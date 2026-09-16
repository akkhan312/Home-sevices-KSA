const crypto = require('crypto');
const supabase = require('../supabase');
const { CURRENCY, toHalalas, fromHalalas } = require('./money');

const TYPES = ['CUSTOMER_PAYMENT', 'PLATFORM_COMMISSION', 'PROVIDER_EARNING', 'PAYOUT', 'REFUND', 'ADJUSTMENT'];
// Types that may only ever be recorded once per order; the unique index (booking_id, type) enforces it.
const ONCE_PER_ORDER = ['CUSTOMER_PAYMENT', 'PLATFORM_COMMISSION', 'PROVIDER_EARNING', 'PAYOUT', 'REFUND'];

/**
 * Appends an immutable financial ledger entry. Recording the same one-per-order entry twice is a no-op
 * that returns the existing row, which makes callers idempotent.
 */
async function recordEntry({ bookingId, userId, amount, type, status = 'COMPLETED', note, reference }) {
  if (!TYPES.includes(type)) throw new Error(`Unknown ledger type ${type}`);
  const row = {
    transaction_id: `TX-${type.slice(0, 3)}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    booking_id: bookingId || null,
    user_id: userId || null,
    amount: fromHalalas(toHalalas(amount)),
    currency: CURRENCY,
    type,
    status,
    note: note || null,
    external_reference: reference || null,
  };

  const { data, error } = await supabase.from('ledger_entries').insert(row).select().single();
  if (!error) return { entry: data, created: true };

  if (error.code === '23505' && ONCE_PER_ORDER.includes(type) && bookingId) {
    const { data: existing } = await supabase.from('ledger_entries').select('*').eq('booking_id', bookingId).eq('type', type).maybeSingle();
    return { entry: existing, created: false };
  }
  throw error;
}

async function entriesForBooking(bookingId) {
  const { data, error } = await supabase.from('ledger_entries').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

module.exports = { TYPES, recordEntry, entriesForBooking };
