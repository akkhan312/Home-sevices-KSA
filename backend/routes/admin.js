const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { mapBookingToFrontend, mapWithdrawalToFrontend } = require('../utils/mappers');
const { requireAdmin, invalidateUser } = require('../middleware/auth');
const { sendError, emitToRole, notifyUser, HttpError, PAYMENT } = require('../services/access');
const { resolveWithdrawal } = require('../services/walletService');
const { approvePayment, rejectPayment, refundPayment, listPaymentProofs, audit } = require('../services/paymentService');
const { markPayoutPaid, listPayouts, resolveDispute } = require('../services/payoutService');
const settings = require('../services/settingsService');
const { entriesForBooking } = require('../services/ledgerService');
const { addMoney } = require('../services/money');

const CONFIRMED_STATUSES = ['CUSTOMER_CONFIRMED', 'customer_confirmed'];

router.use(requireAdmin);

// ─── GET Platform Stats ───────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      customersResult,
      providersResult,
      totalJobsResult,
      completedJobsResult,
      commissionResult,
      adminWithdrawalsResult
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'provider'),
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('ledger_entries').select('amount').eq('type', 'PLATFORM_COMMISSION'),
      supabase.from('withdrawals').select('amount').eq('provider_id', req.user.id).eq('status', 'completed')
    ]);

    const customersCount = customersResult.count || 0;
    const providersCount = providersResult.count || 0;
    const totalJobs = totalJobsResult.count || 0;
    const completedJobs = completedJobsResult.count || 0;

    const totalPlatformEarnings = addMoney(...(commissionResult.data || []).map((e) => e.amount));
    const totalWithdrawn = addMoney(...(adminWithdrawalsResult.data || []).map((w) => w.amount));
    const availableBalance = addMoney(totalPlatformEarnings, -totalWithdrawn);

    res.json({ customers: customersCount, providers: providersCount, totalJobs, completedJobs, totalPlatformEarnings, totalWithdrawn, availableBalance });
  } catch (error) {
    console.error('Fetch stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST Admin Withdrawal ────────────────────────────────────────────────────
router.post('/withdraw', async (req, res) => {
  try {
    const { bankName, iban } = req.body;
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!bankName || !iban) return res.status(400).json({ error: 'Bank name and IBAN are required' });

    const [commissionResult, adminWithdrawalsResult] = await Promise.all([
      supabase.from('ledger_entries').select('amount').eq('type', 'PLATFORM_COMMISSION'),
      supabase.from('withdrawals').select('amount').eq('provider_id', req.user.id).eq('status', 'completed')
    ]);
    const totalPlatformEarnings = addMoney(...(commissionResult.data || []).map((e) => e.amount));
    const totalWithdrawn = addMoney(...(adminWithdrawalsResult.data || []).map((w) => w.amount));
    const availableBalance = addMoney(totalPlatformEarnings, -totalWithdrawn);

    if (amount > availableBalance) return res.status(400).json({ error: 'Insufficient platform balance' });

    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .insert({
        provider_id: req.user.id,
        provider_name: 'Admin Platform Earnings',
        amount,
        bank_name: bankName,
        account_number: iban,
        iban,
        account_name: req.user.name || 'Admin',
        account_holder: req.user.name || 'Admin',
        status: 'completed'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Platform withdrawal successful', withdrawal: mapWithdrawalToFrontend(withdrawal) });
  } catch (error) {
    console.error('Admin withdrawal error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET Admin Withdrawal History ────────────────────────────────────────────
router.get('/withdrawals', async (req, res) => {
  try {
    const { data: withdrawals, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('provider_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json((withdrawals || []).map(mapWithdrawalToFrontend));
  } catch (error) {
    console.error('Fetch admin withdrawals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET All Provider Withdrawal Requests ────────────────────────────────────
router.get('/provider-withdrawals', async (req, res) => {
  try {
    const { data: withdrawals, error } = await supabase
      .from('withdrawals')
      .select('*')
      .neq('provider_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json((withdrawals || []).map(mapWithdrawalToFrontend));
  } catch (error) {
    console.error('Fetch provider withdrawals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH Approve/Reject Provider Withdrawal ────────────────────────────────
router.patch('/provider-withdrawals/:id', async (req, res) => {
  try {
    const withdrawal = await resolveWithdrawal({
      withdrawalId: req.params.id,
      status: req.body.status,
      note: req.body.note,
      adminId: req.user.id,
      adminName: req.user.name,
      io: req.app.get('io'),
    });
    res.json(mapWithdrawalToFrontend(withdrawal));
  } catch (error) {
    sendError(res, error, 'Failed to update withdrawal');
  }
});

// ─── PAYMENT VERIFICATION ────────────────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const status = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(req.query.status) ? req.query.status : 'PENDING';
    res.json(await listPaymentProofs({ status }));
  } catch (error) {
    sendError(res, error, 'Failed to load payments');
  }
});

async function approvePaymentHandler(req, res) {
  try {
    const booking = await approvePayment({ bookingId: req.params.id || req.params.bookingId, admin: req.user, io: req.app.get('io') });
    res.json({ message: 'Payment approved. Communication unlocked.', booking: mapBookingToFrontend(booking) });
  } catch (error) {
    sendError(res, error, 'Failed to approve payment');
  }
}
router.post('/payments/:bookingId/approve', approvePaymentHandler);
router.patch('/bookings/:id/verify-payment', approvePaymentHandler);

router.post('/payments/:bookingId/reject', async (req, res) => {
  try {
    const booking = await rejectPayment({ bookingId: req.params.bookingId, admin: req.user, reason: req.body.reason, io: req.app.get('io') });
    res.json({ message: 'Payment rejected. The customer has been asked to resubmit.', booking: mapBookingToFrontend(booking) });
  } catch (error) {
    sendError(res, error, 'Failed to reject payment');
  }
});

router.get('/bookings/pending-verification', async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('payment_status', PAYMENT.PENDING)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json((bookings || []).map(mapBookingToFrontend));
  } catch (error) {
    sendError(res, error, 'Failed to fetch pending verifications');
  }
});

router.get('/bookings/active', async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'WAITING_CUSTOMER_CONFIRMATION', 'REVISION_REQUESTED'])
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json((bookings || []).map(mapBookingToFrontend));
  } catch (error) {
    sendError(res, error, 'Failed to fetch active bookings');
  }
});

// ─── PROVIDER PAYOUTS ────────────────────────────────────────────────────────
router.get('/payouts', async (req, res) => {
  try {
    const status = ['PENDING', 'PAID', 'CANCELLED', 'ALL'].includes(req.query.status) ? req.query.status : 'PENDING';
    res.json(await listPayouts({ status }));
  } catch (error) {
    sendError(res, error, 'Failed to load payouts');
  }
});

router.post('/payouts/:id/mark-paid', async (req, res) => {
  try {
    const result = await markPayoutPaid({ payoutId: req.params.id, admin: req.user, reference: req.body.reference, io: req.app.get('io') });
    res.json({ message: 'Payout marked as paid', payout: result.payout, booking: mapBookingToFrontend(result.booking) });
  } catch (error) {
    sendError(res, error, 'Failed to mark payout as paid');
  }
});

// Legacy "release earnings" buttons now record the external payout for the order.
async function legacyReleaseHandler(req, res) {
  try {
    const result = await markPayoutPaid({ bookingId: req.params.id || req.params.bookingId, admin: req.user, reference: req.body?.reference, io: req.app.get('io') });
    res.json({ message: 'Payout marked as paid', booking: mapBookingToFrontend(result.booking) });
  } catch (error) {
    sendError(res, error, 'Failed to mark payout as paid');
  }
}
router.patch('/bookings/:id/release-earnings', legacyReleaseHandler);
router.patch('/bookings/:id/release-payment', legacyReleaseHandler);
router.patch('/bookings/:id/approve', legacyReleaseHandler);
router.post('/release-payment/:bookingId', legacyReleaseHandler);

router.get('/bookings/completed-unreleased', async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('payout_status', 'PENDING')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json((bookings || []).map(mapBookingToFrontend));
  } catch (error) {
    sendError(res, error, 'Failed to fetch bookings awaiting payout');
  }
});

// ─── DISPUTES / REFUNDS ──────────────────────────────────────────────────────
async function holdHandler(req, res) {
  try {
    const bookingId = req.params.id || req.params.bookingId;
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.payout_status === 'PAID') throw new HttpError(400, 'The provider has already been paid.');
    const reason = String(req.body?.reason || 'Held by admin for review').slice(0, 500);
    const { data: updated } = await supabase.from('bookings').update({ status: 'disputed', disputed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', bookingId).select().single();
    await audit(req.user, 'PAYOUT_HELD', 'booking', bookingId, reason);
    await notifyUser(booking.provider_id, '⏸ Payout on hold', `Payout for order ${booking.order_number || ''} is on hold: ${reason}`, { type: 'dispute_update' });
    res.json({ success: true, message: 'Order moved to dispute review.', booking: mapBookingToFrontend(updated) });
  } catch (error) {
    sendError(res, error, 'Failed to hold payout');
  }
}
router.patch('/bookings/:id/reject-payment', holdHandler);
router.post('/reject-payment/:bookingId', holdHandler);

router.patch('/bookings/:id/refund', async (req, res) => {
  try {
    res.json(await refundPayment({ bookingId: req.params.id, admin: req.user, reason: req.body.reason, io: req.app.get('io') }));
  } catch (error) {
    sendError(res, error, 'Failed to refund payment');
  }
});

router.post('/bookings/:id/resolve-dispute', async (req, res) => {
  try {
    res.json(await resolveDispute({ bookingId: req.params.id, admin: req.user, resolution: req.body.resolution, note: req.body.note, io: req.app.get('io') }));
  } catch (error) {
    sendError(res, error, 'Failed to resolve dispute');
  }
});

router.get('/bookings/:id/ledger', async (req, res) => {
  try {
    res.json(await entriesForBooking(req.params.id));
  } catch (error) {
    sendError(res, error, 'Failed to load ledger');
  }
});

// ─── SETTINGS: bank details & commission ─────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const [payment, commission] = await Promise.all([settings.getPaymentSettings(), settings.getCommissionSettings()]);
    res.json({ payment, commission });
  } catch (error) {
    sendError(res, error, 'Failed to load settings');
  }
});

router.put('/settings/payment', async (req, res) => {
  try {
    const payment = await settings.updatePaymentSettings(req.body || {}, req.user.id);
    await audit(req.user, 'BANK_SETTINGS_UPDATED', 'settings', 'payment', `Bank details updated (${payment.bankName}, IBAN ending ${payment.iban.slice(-4)})`);
    res.json(payment);
  } catch (error) {
    sendError(res, error, 'Failed to update bank settings');
  }
});

router.put('/settings/commission', async (req, res) => {
  try {
    const commission = await settings.updateCommissionSettings(req.body || {}, req.user.id);
    await audit(req.user, 'COMMISSION_UPDATED', 'settings', 'commission', `Default ${commission.defaultPercent}%, ${commission.rules.length} category rules`);
    res.json(commission);
  } catch (error) {
    sendError(res, error, 'Failed to update commission settings');
  }
});

// ─── PROVIDER APPROVAL ───────────────────────────────────────────────────────
router.patch('/providers/:id/approval', async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) throw new HttpError(400, 'Status must be APPROVED, REJECTED or PENDING');
    const { data: user, error } = await supabase
      .from('users')
      .update({ approval_status: status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('role', 'provider')
      .select('id, name, approval_status')
      .maybeSingle();
    if (error) throw error;
    if (!user) throw new HttpError(404, 'Provider not found');
    await audit(req.user, `PROVIDER_${status}`, 'user', user.id, `Provider ${user.name} marked ${status}`);
    await notifyUser(user.id, status === 'APPROVED' ? '✅ Account approved' : 'Account review update', status === 'APPROVED' ? 'You can now receive requests and send proposals.' : `Your provider account status is ${status.toLowerCase()}.`, { type: 'provider_approval' });
    res.json({ message: `Provider ${user.name} is now ${status.toLowerCase()}`, user });
  } catch (error) {
    sendError(res, error, 'Failed to update provider approval');
  }
});

// ─── GET All Users (admin) ────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, role, phone, iqama_number, profile_picture, status, approval_status, city, rating, review_count, completed_jobs, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(users || []);
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET All Bookings (admin) ─────────────────────────────────────────────────
router.get('/bookings', async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json((bookings || []).map(mapBookingToFrontend));
  } catch (error) {
    console.error('Fetch all bookings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE Remove User / Provider (Admin Full Access) ──────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('id, name, role, email')
      .eq('id', id)
      .single();

    if (fetchErr || !user) return res.status(404).json({ error: 'User or provider not found' });
    if (user.id === req.user.id || user.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot be removed from the app' });
    }

    // Delete user record from Supabase
    const { error: delErr } = await supabase.from('users').delete().eq('id', id);
    if (delErr) {
      if (delErr.code === '23503') {
        return res.status(409).json({ error: 'This account has bookings or payments on record. Suspend it instead of deleting.' });
      }
      throw delErr;
    }
    invalidateUser(id);
    disconnectUser(req.app.get('io'), id);
    emitToRole(req.app.get('io'), 'customer', 'user_removed', { userId: id, targetUserId: id, role: user.role });

    res.json({ message: `${user.role === 'provider' ? 'Provider' : 'User'} ${user.name} has been removed successfully.` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// ─── PATCH Suspend / Ban User or Provider ────────────────────────────────────
router.patch('/users/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body.status === 'active' ? 'active' : 'suspended';
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot suspend your own account' });

    const { data: user, error } = await supabase
      .from('users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .neq('role', 'admin')
      .select('id, name, email, role, status')
      .maybeSingle();

    if (error || !user) return res.status(404).json({ error: 'User not found' });
    invalidateUser(id);
    if (status === 'suspended') disconnectUser(req.app.get('io'), id);
    res.json({ message: `Account status updated to ${user.status}`, user });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

// ─── GET All Objections & Disputes (Admin) ───────────────────────────────────
router.get('/disputes', async (req, res) => {
  try {
    const { data: disputes, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('type', 'objection')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(disputes || []);
  } catch (error) {
    console.error('Fetch disputes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH Admin Verify Report & Take Action ─────────────────────────────────
// Actions: 'remove' (delete/ban provider), 'disverify' (unverify provider), 'dismiss' (keep provider in position)
router.patch('/reports/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminNotes } = req.body; // 'remove' | 'disverify' | 'dismiss'

    if (!['remove', 'disverify', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be remove, disverify, or dismiss.' });
    }

    // Fetch dispute notification
    const { data: dispute, error: dErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (dErr || !dispute) return res.status(404).json({ error: 'Report not found' });

    const targetUserId = dispute.data?.targetUserId;
    const currentData = dispute.data || {};

    let message = '';
    let updatedStatus = 'resolved';

    if (action === 'remove' && targetUserId) {
      // 1. Remove Provider
      const { data: targetUser } = await supabase
        .from('users')
        .select('name, email, role')
        .eq('id', targetUserId)
        .single();

      if (targetUser?.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be removed' });
      // Ban (suspend) rather than hard-delete so bookings, payments and audit history stay intact.
      await supabase.from('users').update({ status: 'suspended', updated_at: new Date().toISOString() }).eq('id', targetUserId);
      invalidateUser(targetUserId);
      disconnectUser(req.app.get('io'), targetUserId);
      emitToRole(req.app.get('io'), 'customer', 'user_removed', { userId: targetUserId, targetUserId, role: targetUser?.role });
      message = `Report verified. ${targetUser?.name || 'User'} has been banned from the platform.`;
      updatedStatus = 'verified_removed';
    } else if (action === 'disverify' && targetUserId) {
      // 2. Disverify Provider (strip iqama / verification badge, remain active on platform)
      await supabase
        .from('users')
        .update({ iqama_number: null, updated_at: new Date().toISOString() })
        .eq('id', targetUserId);

      message = `Report processed. Provider verification status removed; provider remains active on platform.`;
      updatedStatus = 'disverified';
    } else if (action === 'dismiss') {
      // 3. Dismiss Report — confirm false report, keep provider existing in same position
      message = `Report reviewed and verified as invalid. Provider remains active in original position.`;
      updatedStatus = 'dismissed';
    }

    const newData = {
      ...currentData,
      status: updatedStatus,
      adminNotes: adminNotes || '',
      resolvedAt: new Date().toISOString()
    };

    const { data: updatedNotif } = await supabase
      .from('notifications')
      .update({
        read: true,
        data: newData,
        body: `${dispute.body} — [ADMIN DECISION: ${updatedStatus.toUpperCase()}] ${adminNotes ? `(${adminNotes})` : ''}`
      })
      .eq('id', id)
      .select()
      .single();

    if (currentData.reportId) {
      await supabase
        .from('reports')
        .update({ status: action === 'dismiss' ? 'dismissed' : 'resolved', resolved_at: new Date().toISOString(), resolution_notes: adminNotes || updatedStatus })
        .eq('id', currentData.reportId);
    }
    await supabase.from('admin_activity_logs').insert({
      admin_id: req.user.id,
      admin_name: req.user.name || 'Admin',
      action: `REPORT_${updatedStatus.toUpperCase()}`,
      target_type: 'user',
      target_id: targetUserId || null,
      details: message,
    });

    emitToRole(req.app.get('io'), 'admin', 'report_updated', { id, status: updatedStatus, action, targetUserId });

    res.json({ message, dispute: updatedNotif });
  } catch (error) {
    console.error('Verify report error:', error);
    res.status(500).json({ error: 'Failed to process report verification' });
  }
});

// ─── PATCH Admin Disverify Provider ─────────────────────────────────────────
router.patch('/users/:id/disverify', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: user, error } = await supabase
      .from('users')
      .update({ iqama_number: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, email, role, iqama_number')
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: `Provider ${user.name} is now disverified.`, user });
  } catch (error) {
    console.error('Disverify user error:', error);
    res.status(500).json({ error: 'Failed to disverify user' });
  }
});

// ─── GET /api/admin/pending-payments (legacy list used by the payouts screen) ─
router.get('/pending-payments', async (req, res) => {
  try {
    const payouts = await listPayouts({ status: 'PENDING' });
    res.json(payouts.map((p) => ({
      bookingId: p.bookingId,
      payoutId: p.id,
      orderNumber: p.orderNumber,
      customerName: p.customerName,
      providerName: p.providerName,
      categoryName: p.serviceName,
      amount: p.customerPayment,
      platformFee: p.commission,
      commissionRate: p.commissionRate,
      providerEarnings: p.amount,
      status: p.bookingStatus,
      paymentStatus: PAYMENT.PAID,
      payoutStatus: p.status,
      createdAt: p.createdAt,
    })));
  } catch (err) {
    sendError(res, err, 'Failed to fetch pending payouts');
  }
});

// ─── GET /api/admin/analytics ────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const [
      allBookingsRes,
      allUsersRes,
      reportsRes,
      withdrawalsRes
    ] = await Promise.all([
      supabase.from('bookings').select('*'),
      supabase.from('users').select('id, role, city, created_at'),
      supabase.from('reports').select('id, status'),
      supabase.from('withdrawals').select('id, status, amount')
    ]);

    const bookings = allBookingsRes.data || [];
    const users = allUsersRes.data || [];
    const reports = reportsRes.data || [];
    const withdrawals = withdrawalsRes.data || [];

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthStr = now.toISOString().slice(0, 7);

    let totalRevenue = 0;
    let todayRevenue = 0;
    let monthlyRevenue = 0;
    let platformFeeTotal = 0;
    let providerEarningsTotal = 0;

    const categoryRevenueMap = {};
    const cityRevenueMap = {};
    const providerEarningsMap = {};

    bookings.forEach((b) => {
      const amt = Number(b.price || 0);
      const fee = Number(b.commission || amt * 0.15);
      const earn = Number(b.provider_earnings || amt - fee);
      const dateStr = (b.created_at || '').slice(0, 10);
      const monthStr = (b.created_at || '').slice(0, 7);

      if (b.payment_status === PAYMENT.PAID) {
        totalRevenue += amt;
        platformFeeTotal += fee;
        providerEarningsTotal += earn;

        if (dateStr === todayStr) todayRevenue += amt;
        if (monthStr === thisMonthStr) monthlyRevenue += amt;
      }

      // Categories
      const cat = b.category_name || b.category || 'General';
      categoryRevenueMap[cat] = (categoryRevenueMap[cat] || 0) + amt;

      // Provider
      if (b.provider_name) {
        providerEarningsMap[b.provider_name] = (providerEarningsMap[b.provider_name] || 0) + earn;
      }
    });

    const activeProviders = users.filter((u) => u.role === 'provider').length;
    const activeCustomers = users.filter((u) => u.role === 'customer').length;
    const pendingOrders = bookings.filter((b) => ['pending', 'OPEN', 'BIDDING', 'OFFER_ACCEPTED', 'PAYMENT_PENDING', 'VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress'].includes(b.status)).length;
    const completedOrders = bookings.filter((b) => ['completed', 'completed_by_provider', 'WAITING_CUSTOMER_CONFIRMATION', ...CONFIRMED_STATUSES].includes(b.status)).length;
    const pendingPayments = bookings.filter((b) => b.payout_status === 'PENDING').length;
    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending').length;
    const openReports = reports.filter((r) => r.status === 'open').length;

    // Monthly Chart Data (Last 6 Months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('default', { month: 'short' });
      const mKey = d.toISOString().slice(0, 7);

      const mRev = bookings
        .filter((b) => (b.created_at || '').slice(0, 7) === mKey)
        .reduce((sum, b) => sum + Number(b.price || 0), 0);

      monthlyTrend.push({ month: label, revenue: mRev });
    }

    res.json({
      summary: {
        totalRevenue,
        todayRevenue,
        monthlyRevenue,
        platformFeeTotal,
        providerEarningsTotal,
        activeProviders,
        activeCustomers,
        pendingOrders,
        completedOrders,
        pendingPayments,
        pendingWithdrawals,
        openReports
      },
      categoryBreakdown: Object.entries(categoryRevenueMap).map(([name, value]) => ({ name, value })),
      topProviders: Object.entries(providerEarningsMap)
        .map(([name, earnings]) => ({ name, earnings }))
        .sort((a, b) => b.earnings - a.earnings)
        .slice(0, 5),
      monthlyTrend
    });
  } catch (err) {
    console.error('Fetch SaaS analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── GET /api/admin/activity-logs ─────────────────────────────────────────────
router.get('/activity-logs', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('admin_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(logs || []);
  } catch (err) {
    console.error('Fetch activity logs error:', err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// ─── GET /api/admin/calendar ──────────────────────────────────────────────────
router.get('/calendar', async (req, res) => {
  try {
    const { month, year } = req.query; // format e.g. month=07, year=2026
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Group bookings by date string YYYY-MM-DD
    const calendarMap = {};
    (bookings || []).forEach((b) => {
      const dateKey = (b.scheduled_date || b.created_at || '').slice(0, 10);
      if (!calendarMap[dateKey]) {
        calendarMap[dateKey] = { date: dateKey, totalBookings: 0, revenue: 0, items: [] };
      }
      calendarMap[dateKey].totalBookings += 1;
      calendarMap[dateKey].revenue += Number(b.price || 0);
      calendarMap[dateKey].items.push(mapBookingToFrontend(b));
    });

    res.json(calendarMap);
  } catch (err) {
    console.error('Fetch calendar error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar bookings' });
  }
});

function disconnectUser(io, userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = router;

