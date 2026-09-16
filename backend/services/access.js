const supabase = require('../supabase');

// Statuses in which a booking is still open to proposals from any provider.
const OPEN_STATUSES = ['pending', 'OPEN', 'BIDDING'];
// Statuses in which the order is being worked on and participants may message/call each other.
const ACTIVE_STATUSES = ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider', 'REVISION_REQUESTED', 'CUSTOMER_CONFIRMED', 'customer_confirmed'];
// Statuses in which live location may be shared (trip + on-site work).
const LIVE_LOCATION_STATUSES = ['VERIFIED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'in-progress', 'REVISION_REQUESTED'];

const PAYMENT = {
  UNPAID: 'UNPAID',
  SUBMITTED: 'PAYMENT_SUBMITTED',
  PENDING: 'PENDING_VERIFICATION',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
};

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function fetchBooking(bookingId) {
  if (!bookingId || typeof bookingId !== 'string') throw new HttpError(400, 'Invalid booking id');
  const { data: booking, error } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (error) {
    // Malformed UUIDs surface as a Postgres error; treat them as "not found".
    if (error.code === '22P02') throw new HttpError(404, 'Booking not found');
    throw error;
  }
  if (!booking) throw new HttpError(404, 'Booking not found');
  return booking;
}

function isParticipant(booking, user) {
  return booking.customer_id === user.id || (booking.provider_id && booking.provider_id === user.id);
}

/** Can this user see the booking? Admins and participants always; providers may view jobs still open for proposals. */
function canView(booking, user) {
  if (user.role === 'admin' || isParticipant(booking, user)) return true;
  return user.role === 'provider' && OPEN_STATUSES.includes(booking.status);
}

async function getViewableBooking(bookingId, user) {
  const booking = await fetchBooking(bookingId);
  if (!canView(booking, user)) throw new HttpError(403, 'You do not have access to this booking');
  return booking;
}

async function getParticipantBooking(bookingId, user, { allowAdmin = true } = {}) {
  const booking = await fetchBooking(bookingId);
  if (isParticipant(booking, user) || (allowAdmin && user.role === 'admin')) return booking;
  throw new HttpError(403, 'You do not have access to this booking');
}

const isUnlocked = (booking) => booking.payment_status === PAYMENT.PAID && booking.communication_status === 'UNLOCKED';

/**
 * What the viewer may do right now. The backend enforces every one of these; the app only uses them to
 * render locked/unlocked buttons.
 */
function communicationFor(booking, user) {
  const participant = Boolean(user) && isParticipant(booking, user) && Boolean(booking.provider_id);
  const unlocked = participant && isUnlocked(booking);
  const active = ACTIVE_STATUSES.includes(booking.status);
  return {
    locked: !unlocked,
    chat: unlocked && active,
    call: unlocked && active,
    location: unlocked && active,
    liveLocation: unlocked && LIVE_LOCATION_STATUSES.includes(booking.status),
    history: unlocked,
    reason: !participant ? 'NOT_PARTICIPANT' : !unlocked ? 'PAYMENT_REQUIRED' : !active ? 'ORDER_CLOSED' : null,
  };
}

const LOCK_MESSAGES = {
  NOT_PARTICIPANT: 'You are not part of this order.',
  PAYMENT_REQUIRED: 'Communication is locked until the payment is verified.',
  ORDER_CLOSED: 'This order is closed.',
};

/** Throws 403 unless the user may use the given communication channel for this order. */
function assertCommunication(booking, user, channel = 'chat') {
  const c = communicationFor(booking, user);
  if (c[channel]) return;
  const reason = c.reason || 'ORDER_CLOSED';
  throw new HttpError(403, LOCK_MESSAGES[reason], reason === 'PAYMENT_REQUIRED' ? 'COMMUNICATION_LOCKED' : reason);
}

/** Removes data the viewer must not see yet (exact address, phone, receipt). */
function redactForViewer(mappedBooking, booking, user) {
  if (!mappedBooking) return mappedBooking;
  const communication = communicationFor(booking, user);
  const result = { ...mappedBooking, communication };
  if (user.role === 'admin' || booking.customer_id === user.id) return result;

  const hidden = 'Exact location shared after payment is verified';
  result.paymentSlip = '';
  if (!(booking.provider_id === user.id && isUnlocked(booking))) {
    result.address = booking.area || booking.city || hidden;
    result.addressHidden = true;
    result.customerPhone = '';
    result.latitude = null;
    result.longitude = null;
  }
  return result;
}

// Modern namespaced event names emitted alongside the legacy names the current app listens to.
const EVENT_ALIASES = {
  new_offer: 'proposal:new',
  offer_accepted: 'proposal:selected',
  booking_updated: 'order:updated',
  payment_pending: 'payment:submitted',
  payment_verified: 'payment:approved',
  payment_rejected: 'payment:rejected',
  new_message: 'message:new',
  messages_read: 'message:read',
  incoming_call: 'call:incoming',
  call_accepted: 'call:accepted',
  call_ended: 'call:ended',
  live_location_broadcast: 'location:update',
  provider_started: 'provider:on-the-way',
  provider_arrived: 'provider:arrived',
  service_started: 'service:started',
  provider_completed: 'service:completed',
  payment_released: 'payout:paid',
};

function emitWithAlias(target, event, payload) {
  target.emit(event, payload);
  if (EVENT_ALIASES[event]) target.emit(EVENT_ALIASES[event], payload);
}

/** Emits to the booking room plus each participant's personal room and optionally admins (deduplicated by Socket.IO). */
function emitToBooking(io, booking, event, payload, { includeAdmins = false } = {}) {
  if (!io || !booking) return;
  const rooms = [String(booking.id)];
  if (booking.customer_id) rooms.push(`user:${booking.customer_id}`);
  if (booking.provider_id) rooms.push(`user:${booking.provider_id}`);
  if (includeAdmins) rooms.push('role:admin');
  emitWithAlias(io.to(rooms), event, payload);
}

function emitToUser(io, userId, event, payload) {
  if (io && userId) emitWithAlias(io.to(`user:${userId}`), event, payload);
}

function emitToRole(io, role, event, payload) {
  if (io) emitWithAlias(io.to(`role:${role}`), event, payload);
}

async function notifyAdmins(rows) {
  const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
  if (!admins || admins.length === 0) return;
  await supabase.from('notifications').insert(admins.map((a) => ({ user_id: a.id, read: false, ...rows })));
}

async function notifyUser(userId, title, body, extra = {}) {
  if (!userId) return;
  const { error } = await supabase.from('notifications').insert({ user_id: userId, title, body, read: false, ...extra });
  if (error) console.warn('Notification insert failed:', error.message);
}

async function logStatus(bookingId, status, userId, note) {
  const { error } = await supabase.from('booking_status_history').insert({ booking_id: bookingId, status, changed_by: userId, note });
  if (error) console.warn('Status history insert failed:', error.message);
}

function sendError(res, err, fallback = 'Server error') {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

module.exports = {
  OPEN_STATUSES,
  ACTIVE_STATUSES,
  LIVE_LOCATION_STATUSES,
  PAYMENT,
  HttpError,
  fetchBooking,
  isParticipant,
  canView,
  getViewableBooking,
  getParticipantBooking,
  isUnlocked,
  communicationFor,
  assertCommunication,
  redactForViewer,
  emitToBooking,
  emitToUser,
  emitToRole,
  notifyAdmins,
  notifyUser,
  logStatus,
  sendError,
};
