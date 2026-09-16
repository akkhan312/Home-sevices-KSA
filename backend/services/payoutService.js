const supabase = require('../supabase');
const { HttpError, PAYMENT, emitToBooking, emitToUser, notifyAdmins, notifyUser, logStatus } = require('./access');
const { mapBookingToFrontend } = require('../utils/mappers');
const { recordEntry } = require('./ledgerService');
const { adjustWallet, recordTransaction, getOrCreateWallet } = require('./walletService');
const { addMoney } = require('./money');
const { audit } = require('./paymentService');

const nowIso = () => new Date().toISOString();
const AWAITING_CONFIRMATION = ['WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider'];

/** Creates the single pending payout for an order (idempotent thanks to the unique booking_id). */
async function ensurePendingPayout(booking) {
  const { data: existing } = await supabase.from('payouts').select('*').eq('booking_id', booking.id).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('payouts')
    .insert({
      booking_id: booking.id,
      provider_id: booking.provider_id,
      customer_payment: booking.price,
      commission: booking.commission,
      commission_rate: booking.commission_rate,
      amount: booking.provider_earnings,
      currency: 'SAR',
      status: 'PENDING',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase.from('payouts').select('*').eq('booking_id', booking.id).single();
      return raced;
    }
    throw error;
  }
  return data;
}

/** Customer confirms the provider's work: commission is recognised and the provider payout becomes pending. */
async function confirmCompletion({ booking, user, io }) {
  if (booking.customer_id !== user.id) throw new HttpError(403, 'Only the customer can confirm completion.');
  if (!AWAITING_CONFIRMATION.includes(booking.status)) throw new HttpError(400, 'This order is not awaiting your confirmation.');
  if (booking.payment_status !== PAYMENT.PAID) throw new HttpError(400, 'This order has not been paid.');

  const ts = nowIso();
  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'CUSTOMER_CONFIRMED', payout_status: 'PENDING', confirmed_at: ts, updated_at: ts })
    .eq('id', booking.id)
    .in('status', AWAITING_CONFIRMATION)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, 'Completion has already been confirmed.');

  await recordEntry({ bookingId: booking.id, userId: null, amount: updated.commission, type: 'PLATFORM_COMMISSION', note: `${updated.commission_rate ?? ''}% commission` });
  await recordEntry({ bookingId: booking.id, userId: updated.provider_id, amount: updated.provider_earnings, type: 'PROVIDER_EARNING' });
  const payout = await ensurePendingPayout(updated);

  const { data: provider } = await supabase.from('users').select('completed_jobs').eq('id', updated.provider_id).maybeSingle();
  await supabase.from('users').update({ completed_jobs: Number(provider?.completed_jobs || 0) + 1 }).eq('id', updated.provider_id);

  await logStatus(booking.id, 'CUSTOMER_CONFIRMED', user.id, 'Customer confirmed completion; payout pending');
  await notifyAdmins({
    title: `💳 Payout pending — ${updated.order_number || booking.id.slice(0, 8)}`,
    body: `Customer confirmed completion. Pay the provider SAR ${updated.provider_earnings}.`,
    type: 'payout_pending',
    data: { bookingId: booking.id, payoutId: payout.id },
  });
  await notifyUser(updated.provider_id, '🌟 Customer confirmed completion', `Your earnings of SAR ${updated.provider_earnings} are pending payout.`, { type: 'payout_pending', data: { bookingId: booking.id } });
  await notifyUser(updated.customer_id, '⭐ Rate your provider', 'How was the service? Leave a quick review.', { type: 'review_reminder', data: { bookingId: booking.id } });

  const mapped = mapBookingToFrontend(updated);
  emitToBooking(io, updated, 'customer_confirmed', { bookingId: booking.id, status: 'CUSTOMER_CONFIRMED' }, { includeAdmins: true });
  emitToBooking(io, updated, 'booking_updated', mapped, { includeAdmins: true });
  return { booking: updated, payout };
}

/** Admin paid the provider outside the app (bank transfer) and records it. Can only happen once per order. */
async function markPayoutPaid({ payoutId, bookingId, admin, reference, io }) {
  let query = supabase.from('payouts').select('*');
  query = payoutId ? query.eq('id', payoutId) : query.eq('booking_id', bookingId);
  const { data: payout } = await query.maybeSingle();
  if (!payout) throw new HttpError(404, 'Payout not found. The customer must confirm completion first.');
  if (payout.status === 'PAID') throw new HttpError(409, 'This payout has already been marked as paid.');
  if (payout.status !== 'PENDING') throw new HttpError(400, `Payout is ${payout.status.toLowerCase()} and cannot be paid.`);

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', payout.booking_id).single();
  if (booking.status === 'disputed') throw new HttpError(400, 'Resolve the dispute before paying the provider.');

  const ts = nowIso();
  const { data: locked, error } = await supabase
    .from('payouts')
    .update({ status: 'PAID', paid_at: ts, paid_by: admin.id, external_reference: String(reference || '').slice(0, 120) || null, updated_at: ts })
    .eq('id', payout.id)
    .eq('status', 'PENDING')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!locked) throw new HttpError(409, 'This payout has already been marked as paid.');

  const { created } = await recordEntry({ bookingId: booking.id, userId: payout.provider_id, amount: payout.amount, type: 'PAYOUT', reference });
  if (!created) throw new HttpError(409, 'This payout has already been recorded.');

  const wallet = await adjustWallet(payout.provider_id, { pending: -Number(payout.amount), released: payout.amount });
  await recordTransaction(wallet, { amount: payout.amount, type: 'payout_release', referenceId: booking.id, note: reference ? `Bank ref ${reference}` : null });

  const { data: updatedBooking } = await supabase
    .from('bookings')
    .update({ status: 'completed', payout_status: 'PAID', earnings_released: true, released_at: ts, released_by: admin.id, updated_at: ts })
    .eq('id', booking.id)
    .select()
    .single();
  await supabase.from('payments').update({ payment_status: 'released', released_at: ts, released_by: admin.id, updated_at: ts }).eq('booking_id', booking.id);

  await logStatus(booking.id, 'completed', admin.id, `Provider paid SAR ${payout.amount}`);
  await audit(admin, 'PAYOUT_PAID', 'payout', payout.id, `Paid SAR ${payout.amount} to provider for ${booking.order_number || booking.id}${reference ? ` (ref ${reference})` : ''}`);
  await notifyUser(payout.provider_id, '💰 Payout Sent', `SAR ${payout.amount} for order ${booking.order_number || ''} has been paid to your bank account.`, { type: 'payout_paid', data: { bookingId: booking.id } });

  emitToBooking(io, updatedBooking, 'payment_released', { bookingId: booking.id, providerId: payout.provider_id, amount: Number(payout.amount), status: 'COMPLETED' }, { includeAdmins: true });
  emitToBooking(io, updatedBooking, 'booking_updated', mapBookingToFrontend(updatedBooking));
  emitToUser(io, payout.provider_id, 'wallet_updated', { userId: payout.provider_id, pending: Number(wallet.pending_balance), paidOut: Number(wallet.released_balance) });

  return { payout: locked, booking: updatedBooking };
}

async function listPayouts({ status = 'PENDING', providerId } = {}) {
  let query = supabase.from('payouts').select('*').order('created_at', { ascending: false }).limit(200);
  if (status !== 'ALL') query = query.eq('status', status);
  if (providerId) query = query.eq('provider_id', providerId);
  const { data: payouts, error } = await query;
  if (error) throw error;
  if (!payouts?.length) return [];

  const bookingIds = [...new Set(payouts.map((p) => p.booking_id))];
  const providerIds = [...new Set(payouts.map((p) => p.provider_id))];
  const [{ data: bookings }, { data: providers }] = await Promise.all([
    supabase.from('bookings').select('id, order_number, category_name, customer_name, status').in('id', bookingIds),
    supabase.from('users').select('id, name').in('id', providerIds),
  ]);
  const bById = new Map((bookings || []).map((b) => [b.id, b]));
  const pById = new Map((providers || []).map((p) => [p.id, p]));

  return payouts.map((p) => ({
    id: p.id,
    bookingId: p.booking_id,
    orderNumber: bById.get(p.booking_id)?.order_number || null,
    serviceName: bById.get(p.booking_id)?.category_name || '',
    customerName: bById.get(p.booking_id)?.customer_name || '',
    bookingStatus: bById.get(p.booking_id)?.status || null,
    providerId: p.provider_id,
    providerName: pById.get(p.provider_id)?.name || 'Provider',
    customerPayment: Number(p.customer_payment),
    commission: Number(p.commission),
    commissionRate: p.commission_rate !== null && p.commission_rate !== undefined ? Number(p.commission_rate) : null,
    amount: Number(p.amount),
    currency: p.currency || 'SAR',
    status: p.status,
    externalReference: p.external_reference || null,
    paidAt: p.paid_at || null,
    createdAt: p.created_at,
  }));
}

/** Provider dashboard numbers, all derived from server-side records. */
async function providerEarningsSummary(providerId) {
  const wallet = await getOrCreateWallet(providerId);
  const payouts = await listPayouts({ status: 'ALL', providerId });
  const nonCancelled = payouts.filter((p) => p.status !== 'CANCELLED');
  return {
    currency: 'SAR',
    availableBalance: Number(wallet.available_balance || 0),
    pendingBalance: Number(wallet.pending_balance || 0),
    paidOut: Number(wallet.released_balance || 0),
    totalEarnings: addMoney(...nonCancelled.map((p) => p.amount)),
    totalCommission: addMoney(...nonCancelled.map((p) => p.commission)),
    pendingPayouts: addMoney(...payouts.filter((p) => p.status === 'PENDING').map((p) => p.amount)),
    payouts,
  };
}

/** Admin resolves a dispute: either release (payout becomes pending) or refund the customer. */
async function resolveDispute({ bookingId, admin, resolution, note, io }) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.status !== 'disputed') throw new HttpError(400, 'This order is not disputed.');

  if (resolution === 'refund') {
    const { refundPayment } = require('./paymentService');
    return refundPayment({ bookingId, admin, reason: note || 'Dispute resolved in favour of the customer', io });
  }
  if (resolution !== 'release') throw new HttpError(400, 'Resolution must be "release" or "refund".');
  if (booking.payment_status !== PAYMENT.PAID) throw new HttpError(400, 'Unpaid orders cannot be released.');

  const { data: updated } = await supabase
    .from('bookings')
    .update({ status: 'CUSTOMER_CONFIRMED', payout_status: 'PENDING', updated_at: nowIso() })
    .eq('id', bookingId)
    .eq('status', 'disputed')
    .select()
    .single();
  await recordEntry({ bookingId, userId: null, amount: updated.commission, type: 'PLATFORM_COMMISSION' });
  await recordEntry({ bookingId, userId: updated.provider_id, amount: updated.provider_earnings, type: 'PROVIDER_EARNING' });
  await ensurePendingPayout(updated);
  await logStatus(bookingId, 'CUSTOMER_CONFIRMED', admin.id, `Dispute resolved: release. ${note || ''}`);
  await audit(admin, 'DISPUTE_RELEASED', 'booking', bookingId, note || 'Released to provider');
  emitToBooking(io, updated, 'booking_updated', mapBookingToFrontend(updated), { includeAdmins: true });
  return { success: true, message: 'Dispute resolved. Provider payout is now pending.' };
}

module.exports = { confirmCompletion, ensurePendingPayout, markPayoutPaid, listPayouts, providerEarningsSummary, resolveDispute };
