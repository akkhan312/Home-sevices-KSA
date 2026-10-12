// Last known provider position per order, so a customer who opens the tracking screen sees the provider immediately
// instead of waiting for the next GPS update. Kept in memory: positions are only meaningful for a few minutes.
const MAX_AGE_MS = 10 * 60 * 1000;
const lastByBooking = new Map();

function remember(bookingId, payload) {
  lastByBooking.set(String(bookingId), { payload, at: Date.now() });
}

function lastKnown(bookingId) {
  const entry = lastByBooking.get(String(bookingId));
  if (!entry) return null;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    lastByBooking.delete(String(bookingId));
    return null;
  }
  return entry.payload;
}

function forget(bookingId) {
  lastByBooking.delete(String(bookingId));
}

module.exports = { remember, lastKnown, forget };
