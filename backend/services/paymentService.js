const supabase = require('../supabase');
const { HttpError, PAYMENT, emitToBooking, emitToUser, notifyAdmins, notifyUser, logStatus } = require('./access');
const { mapBookingToFrontend } = require('../utils/mappers');
const { fileUrl } = require('./files');
const { recordEntry } = require('./ledgerService');
const { adjustWallet, recordTransaction } = require('./walletService');
const { getPaymentSettings } = require('./settingsService');

const AWAITING_PAYMENT = ['OFFER_ACCEPTED', 'accepted', 'PAYMENT_PENDING'];
const nowIso = () => new Date().toISOString();

async function audit(actor, action, targetType, targetId, details) {
  const { error } = await supabase.from('admin_activity_logs').insert({
    admin_id: actor?.role === 'admin' ? actor.id : null,
    admin_name: actor?.name || 'System',
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
  if (error) console.warn('Audit log insert failed:', error.message);
}

/** Bank details + amount + reference the customer needs to transfer money. */
async function getPaymentInstructions(booking) {
  const bank = await getPaymentSettings();
  return {
    orderNumber: booking.order_number || null,
    reference: booking.payment_reference || booking.order_number,
    amount: Number(booking.price),
    currency: 'SAR',
    paymentStatus: booking.payment_status || PAYMENT.UNPAID,
    rejectionReason: booking.payment_rejection_reason || null,
    bank: bank.configured
      ? { bankName: bank.bankName, accountName: bank.accountName, iban: bank.iban, accountNumber: bank.accountNumber, instructions: bank.instructions }
      : null,
  };
}

/**
 * Customer uploads a transfer receipt. This only moves the payment to PENDING_VERIFICATION: it never unlocks
 * communication. Re-submitting while a receipt is already pending is idempotent.
 */
async function submitPaymentProof({ booking, user, storedPath, transactionNumber, io }) {
  if (booking.customer_id !== user.id) throw new HttpError(403, 'Only the customer of this order can submit payment.');
  if (booking.payment_status === PAYMENT.PAID) throw new HttpError(409, 'This order is already paid.');
  if (!AWAITING_PAYMENT.includes(booking.status)) throw new HttpError(400, 'This order is not awaiting payment.');

  const txn = String(transactionNumber || '').trim().slice(0, 64);
  if (txn.length < 4) throw new HttpError(400, 'Please enter the bank transaction / reference number.');

  const { data: pending } = await supabase
    .from('payment_proofs')
    .select('*')
    .eq('booking_id', booking.id)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (pending) {
    return { booking, proof: pending, duplicate: true };
  }

  const { data: proof, error } = await supabase
    .from('payment_proofs')
    .insert({
      booking_id: booking.id,
      customer_id: user.id,
      file_path: storedPath,
      transaction_number: txn,
      amount: Number(booking.price),
      status: 'PENDING',
    })
    .select()
    .single();

  if (error) {
    // Two taps raced: the unique partial index allows only one pending proof per order.
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('payment_proofs').select('*').eq('booking_id', booking.id).eq('status', 'PENDING').maybeSingle();
      return { booking, proof: existing, duplicate: true };
    }
    throw error;
  }

  const { data: updated, error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'PAYMENT_PENDING',
      payment_status: PAYMENT.PENDING,
      payment_slip: storedPath,
      payment_transaction_number: txn,
      payment_rejection_reason: null,
      updated_at: nowIso(),
    })
    .eq('id', booking.id)
    .select()
    .single();
  if (updErr) throw updErr;

  await logStatus(booking.id, 'PAYMENT_PENDING', user.id, `Customer submitted bank transfer receipt (txn ${txn})`);
  await notifyAdmins({
    title: '🧾 Payment receipt submitted',
    body: `Order ${updated.order_number || booking.id.slice(0, 8)} — SAR ${updated.price}. Please verify the transfer.`,
    type: 'payment_submitted',
    data: { bookingId: booking.id, proofId: proof.id },
  });
  await notifyUser(updated.provider_id, '⏳ Customer submitted payment', 'The payment is being verified by ServeHome.', { type: 'payment_submitted', data: { bookingId: booking.id } });

  const mapped = mapBookingToFrontend(updated);
  emitToBooking(io, updated, 'booking_updated', mapped, { includeAdmins: true });
  emitToBooking(io, updated, 'payment_pending', { bookingId: booking.id, paymentStatus: PAYMENT.PENDING }, { includeAdmins: true });
  return { booking: updated, proof, duplicate: false };
}

/** Moves money into escrow, unlocks communication and notifies both parties. Shared by admin approval and gateways. */
async function markPaid({ booking, actor, method, externalReference, io }) {
  const ts = nowIso();
  const { data: updated, error } = await supabase
    .from('bookings')
    .update({
      status: 'VERIFIED',
      payment_status: PAYMENT.PAID,
      communication_status: 'UNLOCKED',
      payment_rejection_reason: null,
      escrow_amount: booking.price,
      transaction_id: externalReference || booking.transaction_id || null,
      paid_at: ts,
      updated_at: ts,
    })
    .eq('id', booking.id)
    .in('status', AWAITING_PAYMENT)
    .neq('payment_status', PAYMENT.PAID)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, 'This payment has already been processed.');

  await recordEntry({ bookingId: booking.id, userId: booking.customer_id, amount: updated.price, type: 'CUSTOMER_PAYMENT', note: `Paid via ${method}`, reference: externalReference });

  // Provider earnings are pending until the customer confirms and the payout is made.
  const wallet = await adjustWallet(updated.provider_id, { pending: updated.provider_earnings });
  await recordTransaction(wallet, { amount: updated.provider_earnings, type: 'escrow_credit', referenceId: booking.id, status: 'pending' });

  const { error: payErr } = await supabase.from('payments').insert({
    booking_id: booking.id,
    customer_id: booking.customer_id,
    provider_id: updated.provider_id,
    amount: updated.price,
    platform_fee: updated.commission,
    provider_earnings: updated.provider_earnings,
    escrow_amount: updated.price,
    payment_status: 'escrow_held',
    transaction_id: externalReference || `${method.toUpperCase()}-${updated.payment_reference || booking.id}`,
  });
  if (payErr && payErr.code !== '23505') console.warn('payments insert failed:', payErr.message);

  await logStatus(booking.id, 'VERIFIED', actor?.id || null, `Payment verified (${method}); communication unlocked`);
  await audit(actor, 'PAYMENT_APPROVED', 'booking', booking.id, `Payment of SAR ${updated.price} for ${updated.order_number || booking.id} approved via ${method}`);

  const body = `Payment for order ${updated.order_number || ''} is confirmed. Chat, call and location are now unlocked.`;
  await notifyUser(updated.customer_id, '✓ Payment Confirmed', body, { type: 'payment_approved', data: { bookingId: booking.id } });
  await notifyUser(updated.provider_id, '💰 Payment Verified — you can start', body, { type: 'payment_approved', data: { bookingId: booking.id } });

  const mapped = mapBookingToFrontend(updated);
  emitToBooking(io, updated, 'booking_updated', mapped, { includeAdmins: true });
  emitToBooking(io, updated, 'payment_verified', { bookingId: booking.id, status: 'VERIFIED', paymentStatus: PAYMENT.PAID, communicationStatus: 'UNLOCKED' }, { includeAdmins: true });
  return updated;
}

async function approvePayment({ bookingId, admin, io }) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.payment_status === PAYMENT.PAID) throw new HttpError(409, 'This payment has already been approved.');

  const { data: proof } = await supabase.from('payment_proofs').select('*').eq('booking_id', bookingId).eq('status', 'PENDING').maybeSingle();
  if (!proof) throw new HttpError(400, 'There is no submitted payment receipt to approve for this order.');

  const updated = await markPaid({ booking, actor: admin, method: 'bank_transfer', externalReference: proof.transaction_number, io });
  await supabase.from('payment_proofs').update({ status: 'APPROVED', reviewed_by: admin.id, reviewed_at: nowIso() }).eq('id', proof.id);
  return updated;
}

async function rejectPayment({ bookingId, admin, reason, io }) {
  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (!cleanReason) throw new HttpError(400, 'Please give the customer a reason for rejecting the payment.');

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found');

  const { data: proof } = await supabase.from('payment_proofs').select('*').eq('booking_id', bookingId).eq('status', 'PENDING').maybeSingle();
  if (!proof) throw new HttpError(400, 'There is no pending payment receipt for this order.');

  await supabase.from('payment_proofs').update({ status: 'REJECTED', rejection_reason: cleanReason, reviewed_by: admin.id, reviewed_at: nowIso() }).eq('id', proof.id);

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'OFFER_ACCEPTED', payment_status: PAYMENT.REJECTED, communication_status: 'LOCKED', payment_rejection_reason: cleanReason, updated_at: nowIso() })
    .eq('id', bookingId)
    .neq('payment_status', PAYMENT.PAID)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, 'This payment was already approved.');

  await logStatus(bookingId, 'OFFER_ACCEPTED', admin.id, `Payment rejected: ${cleanReason}`);
  await audit(admin, 'PAYMENT_REJECTED', 'booking', bookingId, `Rejected receipt ${proof.transaction_number}: ${cleanReason}`);
  await notifyUser(updated.customer_id, '⚠️ Payment Rejected', `We could not verify your transfer: ${cleanReason}. Please submit a valid receipt.`, { type: 'payment_rejected', data: { bookingId } });

  const mapped = mapBookingToFrontend(updated);
  emitToBooking(io, updated, 'booking_updated', mapped, { includeAdmins: true });
  emitToBooking(io, updated, 'payment_rejected', { bookingId, reason: cleanReason, paymentStatus: PAYMENT.REJECTED });
  return updated;
}

/** Pending receipts (or history) for the admin verification screen. */
async function listPaymentProofs({ status = 'PENDING' } = {}) {
  let query = supabase.from('payment_proofs').select('*').order('created_at', { ascending: false }).limit(200);
  if (status !== 'ALL') query = query.eq('status', status);
  const { data: proofs, error } = await query;
  if (error) throw error;
  if (!proofs?.length) return [];

  const bookingIds = [...new Set(proofs.map((p) => p.booking_id))];
  const { data: bookings } = await supabase.from('bookings').select('*').in('id', bookingIds);
  const byId = new Map((bookings || []).map((b) => [b.id, b]));

  return proofs.map((p) => {
    const b = byId.get(p.booking_id) || {};
    return {
      id: p.id,
      bookingId: p.booking_id,
      orderNumber: b.order_number || null,
      paymentReference: b.payment_reference || b.order_number || null,
      customerName: b.customer_name || '',
      providerName: b.provider_name || '',
      serviceName: b.category_name || '',
      amount: Number(p.amount),
      currency: 'SAR',
      transactionNumber: p.transaction_number,
      receiptUrl: fileUrl(p.file_path),
      status: p.status,
      rejectionReason: p.rejection_reason || null,
      bookingPaymentStatus: b.payment_status || null,
      createdAt: p.created_at,
      reviewedAt: p.reviewed_at || null,
    };
  });
}

/** Refunds a paid (not yet paid-out) order to the customer's wallet and cancels it. */
async function refundPayment({ bookingId, admin, reason, io }) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.payment_status !== PAYMENT.PAID) throw new HttpError(400, 'Only paid orders can be refunded.');
  if (booking.payout_status === 'PAID') throw new HttpError(400, 'The provider has already been paid for this order.');

  const note = String(reason || 'Admin discretion').slice(0, 500);
  const { data: locked, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', payment_status: PAYMENT.REFUNDED, communication_status: 'LOCKED', payout_status: 'CANCELLED', updated_at: nowIso() })
    .eq('id', bookingId)
    .eq('payment_status', PAYMENT.PAID)
    .neq('payout_status', 'PAID')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!locked) throw new HttpError(409, 'This order was already refunded or paid out.');

  await recordEntry({ bookingId, userId: booking.customer_id, amount: booking.price, type: 'REFUND', note });
  const customerWallet = await adjustWallet(booking.customer_id, { available: booking.price });
  await recordTransaction(customerWallet, { amount: booking.price, type: 'refund', referenceId: bookingId, note });
  await adjustWallet(booking.provider_id, { pending: -Number(booking.provider_earnings) });
  await supabase.from('payouts').update({ status: 'CANCELLED', updated_at: nowIso() }).eq('booking_id', bookingId).eq('status', 'PENDING');
  await supabase.from('payments').update({ payment_status: 'refunded', updated_at: nowIso() }).eq('booking_id', bookingId);

  await logStatus(bookingId, 'cancelled', admin.id, `Refunded: ${note}`);
  await audit(admin, 'REFUND_PAYMENT', 'booking', bookingId, `Refunded SAR ${booking.price}: ${note}`);
  await notifyUser(booking.customer_id, '💰 Refund Processed', `SAR ${booking.price} has been refunded to your wallet.`, { type: 'refund' });
  await notifyUser(booking.provider_id, '❌ Order Refunded', `Order ${booking.order_number || ''} was refunded. Reason: ${note}`, { type: 'refund' });

  emitToBooking(io, locked, 'booking_updated', mapBookingToFrontend(locked), { includeAdmins: true });
  emitToUser(io, booking.customer_id, 'wallet_updated', { userId: booking.customer_id, balance: Number(customerWallet.available_balance) });
  return { success: true, message: `Refund of SAR ${booking.price} issued to customer wallet.` };
}

module.exports = {
  AWAITING_PAYMENT,
  getPaymentInstructions,
  submitPaymentProof,
  markPaid,
  approvePayment,
  rejectPayment,
  listPaymentProofs,
  refundPayment,
  audit,
};
