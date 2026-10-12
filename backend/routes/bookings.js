const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { mapBookingToFrontend } = require('../utils/mappers');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadSlip, uploadRequestPhoto, discardUpload } = require('../middleware/upload');
const {
  OPEN_STATUSES,
  LIVE_LOCATION_STATUSES,
  PAYMENT,
  HttpError,
  fetchBooking,
  getViewableBooking,
  getParticipantBooking,
  redactForViewer,
  emitToBooking,
  emitToRole,
  notifyUser,
  notifyUsers,
  logStatus,
  sendError,
} = require('../services/access');
const { submitOrUpdateOffer, getOffersForBooking, acceptOffer, increaseBudget, submitReview } = require('../services/biddingService');
const { createObjection } = require('../services/reportService');
const { getPaymentInstructions, submitPaymentProof, markPaid, AWAITING_PAYMENT } = require('../services/paymentService');
const { confirmCompletion } = require('../services/payoutService');
const { privatePathFor, PRIVATE_PREFIX, isSafeName } = require('../services/files');
const { isStripeConfigured, createBookingPaymentIntent, verifyBookingPayment } = require('../services/stripeService');
const { MATCHING_FIELDS, matchesProvider, isApprovedActive } = require('../services/matching');
const { isServiceCategory, normalizeCity } = require('../services/catalog');
const liveLocation = require('../services/liveLocation');
const storage = require('../services/storage');

router.use(authenticate);

const now = () => new Date().toISOString();
const text = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const view = (booking, user) => redactForViewer(mapBookingToFrontend(booking), booking, user);

const MAX_PHOTOS = 4;
// Requests and unpaid orders can be cancelled by the customer; paid orders go through a dispute/refund.
const CANCELLABLE_STATUSES = [...OPEN_STATUSES, ...AWAITING_PAYMENT];

async function loadProvider(userId) {
  const { data } = await supabase.from('users').select(MATCHING_FIELDS).eq('id', userId).maybeSingle();
  return data;
}

function assertApprovedProvider(provider) {
  if (!provider || provider.status === 'suspended') throw new HttpError(403, 'Your provider account is not active.');
  if ((provider.approval_status || 'APPROVED') !== 'APPROVED') {
    throw new HttpError(403, 'Your provider account is awaiting admin approval.', 'PROVIDER_NOT_APPROVED');
  }
}

/** Removes a provider's proposal while the request is still open; the request returns to "pending" when none are left. */
async function withdrawOffer(booking, providerId, io) {
  const { data: offer } = await supabase.from('booking_offers').select('id').eq('booking_id', booking.id).eq('provider_id', providerId).maybeSingle();
  if (!offer) return false;
  await supabase.from('booking_offers').delete().eq('id', offer.id);
  const { count } = await supabase.from('booking_offers').select('id', { count: 'exact', head: true }).eq('booking_id', booking.id);
  if (!count) await supabase.from('bookings').update({ status: 'pending', updated_at: now() }).eq('id', booking.id).eq('status', 'BIDDING');
  emitToBooking(io, booking, 'offer_withdrawn', { bookingId: booking.id, providerId, offerId: offer.id });
  return true;
}

/** Read-modify-write of the photo list, retried if the order changed in between. */
async function updatePhotos(booking, change) {
  let current = booking;
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = change(Array.isArray(current.photos) ? current.photos : []);
    const { data, error } = await supabase.from('bookings').update({ photos: next, updated_at: now() }).eq('id', current.id).eq('updated_at', current.updated_at).select().maybeSingle();
    if (error) throw error;
    if (data) return data;
    current = await fetchBooking(current.id);
  }
  throw new HttpError(409, 'The request was updated at the same time. Please try again.');
}

// ─── CUSTOMER: Create a service request ──────────────────────────────────────
router.post('/', requireRole('customer'), async (req, res) => {
  try {
    const b = req.body;
    const price = Number(b.price ?? b.budget);
    if (!b.category || !b.categoryName || !b.scheduledDate || !b.address) {
      throw new HttpError(400, 'Service, date and address are required');
    }
    if (!isServiceCategory(b.category)) throw new HttpError(400, 'Please choose one of the available services');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.scheduledDate))) throw new HttpError(400, 'Please choose a valid date');
    if (b.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.scheduledTime))) throw new HttpError(400, 'Please choose a valid time');
    if (!Number.isFinite(price) || price <= 0 || price > 100000) throw new HttpError(400, 'Please provide a valid budget');
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    const hasCoords = b.latitude !== undefined && b.latitude !== null && b.longitude !== undefined && b.longitude !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        customer_id: req.user.id,
        customer_name: text(b.customerName, 120) || req.user.name,
        customer_phone: text(b.customerPhone, 20),
        category: text(b.category, 50),
        category_name: text(b.categoryName, 80),
        service_option: text(b.serviceOption, 120),
        description: text(b.description, 2000),
        price,
        budget: price,
        scheduled_date: text(b.scheduledDate, 20),
        scheduled_time: text(b.scheduledTime, 20),
        address: text(b.address, 500),
        city: normalizeCity(b.city),
        area: text(b.area, 120),
        latitude: hasCoords ? lat : null,
        longitude: hasCoords ? lng : null,
        notes: text(b.notes, 2000),
        status: 'pending',
        payment_status: PAYMENT.UNPAID,
        communication_status: 'LOCKED',
        payout_status: 'NONE',
      })
      .select()
      .single();
    if (error) throw error;

    try {
      const { data: providers } = await supabase
        .from('users')
        .select(MATCHING_FIELDS)
        .eq('role', 'provider')
        .or('status.is.null,status.neq.suspended');
      const matching = (providers || []).filter((p) => isApprovedActive(p) && matchesProvider(booking, p));
      if (matching.length) {
        const title = `🔔 New request: ${booking.category_name}`;
        const body = `${booking.area || booking.city || 'Nearby'} · ${booking.scheduled_date}. Budget SAR ${price}. Send your proposal.`;
        await notifyUsers(matching.map((p) => p.id), title, body, { type: 'new_request', data: { bookingId: booking.id } });
        const io = req.app.get('io');
        for (const p of matching) {
          io?.to(`user:${p.id}`).emit('new_job_alert', { title, body, bookingId: booking.id, category: booking.category, categoryName: booking.category_name, price, scheduledDate: booking.scheduled_date, scheduledTime: booking.scheduled_time });
        }
      }
    } catch (notifErr) {
      console.error('Provider notification error:', notifErr.message);
    }

    res.status(201).json({ ...view(booking, req.user), message: 'Your request has been sent to available providers.' });
  } catch (err) {
    sendError(res, err, 'Failed to create request');
  }
});

// ─── CUSTOMER: My orders ─────────────────────────────────────────────────────
router.get('/my', async (req, res) => {
  try {
    const { data: bookings, error } = await supabase.from('bookings').select('*').eq('customer_id', req.user.id).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json((bookings || []).map((b) => view(b, req.user)));
  } catch (err) {
    sendError(res, err, 'Failed to fetch bookings');
  }
});

// ─── PROVIDER: Matching open requests + own orders ───────────────────────────
router.get('/provider', requireRole('provider'), async (req, res) => {
  try {
    const provider = await loadProvider(req.user.id);
    const approved = isApprovedActive(provider);

    const [{ data: jobs, error }, { data: dismissals }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .or(`status.in.(${OPEN_STATUSES.join(',')}),provider_id.eq.${req.user.id}`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('booking_dismissals').select('booking_id').eq('provider_id', req.user.id),
    ]);
    if (error) throw error;
    const dismissed = new Set((dismissals || []).map((d) => d.booking_id));

    const visible = (jobs || []).filter((b) => b.provider_id === req.user.id || (approved && !dismissed.has(b.id) && matchesProvider(b, provider)));

    // The provider's own proposal on each open request, so the app can show "quoted" vs "new".
    const openIds = visible.filter((b) => OPEN_STATUSES.includes(b.status)).map((b) => b.id);
    const { data: myOffers } = openIds.length
      ? await supabase.from('booking_offers').select('booking_id, price, eta_minutes, completion_hours').eq('provider_id', req.user.id).in('booking_id', openIds)
      : { data: [] };
    const offerByBooking = new Map((myOffers || []).map((o) => [o.booking_id, { price: Number(o.price), etaMinutes: Number(o.eta_minutes), completionHours: Number(o.completion_hours) }]));

    res.set('X-Provider-Approval', provider?.approval_status || 'APPROVED');
    res.json(visible.map((b) => ({ ...view(b, req.user), myOffer: offerByBooking.get(b.id) || null })));
  } catch (err) {
    sendError(res, err, 'Failed to fetch jobs');
  }
});

// ─── PROPOSALS ───────────────────────────────────────────────────────────────
router.get('/:id/offers', async (req, res) => {
  try {
    const booking = await getViewableBooking(req.params.id, req.user);
    let offers = await getOffersForBooking(booking.id);
    if (req.user.role === 'provider' && booking.provider_id !== req.user.id) {
      offers = offers.filter((o) => o.providerId === req.user.id);
    }
    res.json(offers);
  } catch (err) {
    sendError(res, err, 'Failed to fetch proposals');
  }
});

router.post('/:id/offers', requireRole('provider'), async (req, res) => {
  try {
    assertApprovedProvider(await loadProvider(req.user.id));
    const booking = await fetchBooking(req.params.id);
    if (!OPEN_STATUSES.includes(booking.status)) throw new HttpError(400, 'This request is no longer accepting proposals');
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000) throw new HttpError(400, 'Please provide a valid price');

    const offer = await submitOrUpdateOffer({
      bookingId: booking.id,
      providerId: req.user.id,
      price,
      etaMinutes: req.body.etaMinutes,
      completionHours: req.body.completionHours,
      message: req.body.message,
      notes: req.body.notes,
    });

    // A provider who quotes after hiding the request wants to see it again.
    await supabase.from('booking_dismissals').delete().eq('booking_id', booking.id).eq('provider_id', req.user.id);

    const io = req.app.get('io');
    emitToBooking(io, booking, 'new_offer', offer);
    emitToBooking(io, booking, 'offer_updated', offer);
    await notifyUser(booking.customer_id, '📨 New proposal', `${offer.providerName} offered SAR ${offer.price} for ${booking.category_name}.`, { type: 'new_proposal', data: { bookingId: booking.id } });

    res.status(201).json(offer);
  } catch (err) {
    sendError(res, err, 'Failed to submit proposal');
  }
});

// ─── PROVIDER: Withdraw own proposal ─────────────────────────────────────────
router.delete('/:id/offers/mine', requireRole('provider'), async (req, res) => {
  try {
    const booking = await fetchBooking(req.params.id);
    if (!OPEN_STATUSES.includes(booking.status)) throw new HttpError(400, 'Proposals can only be withdrawn while the customer is still choosing.');
    const withdrawn = await withdrawOffer(booking, req.user.id, req.app.get('io'));
    if (!withdrawn) throw new HttpError(404, 'You have not sent a proposal for this request.');
    res.json({ withdrawn: true });
  } catch (err) {
    sendError(res, err, 'Failed to withdraw proposal');
  }
});

// ─── PROVIDER: Not interested (hides an open request from the feed) ──────────
router.post('/:id/dismiss', requireRole('provider'), async (req, res) => {
  try {
    const booking = await fetchBooking(req.params.id);
    if (booking.provider_id === req.user.id) throw new HttpError(400, 'You are the selected provider for this order.');
    const { error } = await supabase.from('booking_dismissals').upsert({ booking_id: booking.id, provider_id: req.user.id }, { onConflict: 'booking_id,provider_id' });
    if (error) throw error;
    if (OPEN_STATUSES.includes(booking.status)) await withdrawOffer(booking, req.user.id, req.app.get('io'));
    res.json({ dismissed: true });
  } catch (err) {
    sendError(res, err, 'Failed to hide request');
  }
});

// ─── CUSTOMER: Select provider ───────────────────────────────────────────────
router.post('/:id/accept-offer', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    const result = await acceptOffer({ bookingId: booking.id, offerId: req.body.offerId, customerId: req.user.id });

    const io = req.app.get('io');
    emitToBooking(io, result.raw, 'offer_accepted', { bookingId: booking.id, winningOffer: result.winningOffer });
    emitToBooking(io, result.raw, 'booking_updated', mapBookingToFrontend(result.raw));
    await notifyUser(result.raw.provider_id, '🎉 You were selected', `The customer selected your proposal for ${booking.category_name}. Waiting for payment verification.`, { type: 'proposal_selected', data: { bookingId: booking.id } });
    await notifyUser(req.user.id, '💳 Payment required', `Pay SAR ${result.raw.price} using reference ${result.raw.payment_reference} to confirm your order.`, { type: 'payment_instructions', data: { bookingId: booking.id } });

    res.json({ booking: view(result.raw, req.user), winningOffer: result.winningOffer });
  } catch (err) {
    sendError(res, err, 'Failed to select provider');
  }
});

router.patch('/:id/increase-budget', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    const newBudget = Number(req.body.newBudget);
    if (!Number.isFinite(newBudget) || newBudget <= 0 || newBudget > 100000) throw new HttpError(400, 'Please provide a valid budget');
    const updated = await increaseBudget({ bookingId: booking.id, customerId: req.user.id, newBudget });
    const io = req.app.get('io');
    emitToBooking(io, booking, 'budget_updated', updated);
    emitToRole(io, 'provider', 'budget_updated', { bookingId: booking.id, newBudget });
    res.json(updated);
  } catch (err) {
    sendError(res, err, 'Failed to update budget');
  }
});

// ─── CUSTOMER: Review ────────────────────────────────────────────────────────
router.post('/:id/reviews', requireRole('customer'), async (req, res) => {
  try {
    const review = await submitReview({ bookingId: req.params.id, customerId: req.user.id, ...req.body });
    res.status(201).json(review);
  } catch (err) {
    sendError(res, err, 'Failed to submit review');
  }
});

// ─── Status progression ──────────────────────────────────────────────────────
// A provider is only ever assigned by the customer selecting their proposal (POST /:id/accept-offer).
const STATUS_TRANSITIONS = {
  ON_THE_WAY: { from: ['VERIFIED'], actor: 'assigned_provider', paid: true },
  ARRIVED: { from: ['ON_THE_WAY'], actor: 'assigned_provider', paid: true },
  IN_PROGRESS: { from: ['ARRIVED', 'REVISION_REQUESTED'], actor: 'assigned_provider', paid: true },
  WAITING_CUSTOMER_CONFIRMATION: { from: ['IN_PROGRESS', 'in-progress'], actor: 'assigned_provider', paid: true },
  REVISION_REQUESTED: { from: ['WAITING_CUSTOMER_CONFIRMATION', 'completed_by_provider'], actor: 'customer', paid: true },
};
const STATUS_ALIASES = {
  'in-progress': 'IN_PROGRESS',
  completed_by_provider: 'WAITING_CUSTOMER_CONFIRMATION',
  completed: 'WAITING_CUSTOMER_CONFIRMATION',
  SERVICE_STARTED: 'IN_PROGRESS',
  SERVICE_COMPLETED: 'WAITING_CUSTOMER_CONFIRMATION',
  PROVIDER_ON_THE_WAY: 'ON_THE_WAY',
};

router.patch('/:id/status', async (req, res) => {
  try {
    const target = STATUS_ALIASES[req.body.status] || req.body.status;
    const rule = STATUS_TRANSITIONS[target];
    if (!rule) throw new HttpError(400, 'Invalid status');

    const booking = await fetchBooking(req.params.id);
    if (rule.actor === 'assigned_provider' && booking.provider_id !== req.user.id) throw new HttpError(403, 'Not authorized for this order');
    if (rule.actor === 'customer' && booking.customer_id !== req.user.id) throw new HttpError(403, 'Only the customer can request a revision');
    if (rule.paid && booking.payment_status !== PAYMENT.PAID) throw new HttpError(400, 'Payment must be verified before the service can start.', 'PAYMENT_REQUIRED');
    if (!rule.from.includes(booking.status)) throw new HttpError(400, `Cannot change status from ${booking.status} to ${target}.`);

    const updateData = { status: target, updated_at: now() };
    if (target === 'ON_THE_WAY') updateData.trip_started_at = now();
    if (target === 'ARRIVED') updateData.arrived_at = now();
    if (target === 'IN_PROGRESS') updateData.service_started_at = now();
    if (target === 'WAITING_CUSTOMER_CONFIRMATION') updateData.completed_at = now();
    if (target === 'REVISION_REQUESTED' && req.body.revisionNotes) updateData.revision_notes = String(req.body.revisionNotes).slice(0, 2000);

    const { data: updated, error } = await supabase.from('bookings').update(updateData).eq('id', booking.id).eq('status', booking.status).select().maybeSingle();
    if (error) throw error;
    if (!updated) throw new HttpError(409, 'Order was updated by someone else. Please refresh.');

    await logStatus(booking.id, updated.status, req.user.id, `Status changed to ${updated.status}`);

    const io = req.app.get('io');
    const providerName = updated.provider_name || 'Provider';
    emitToBooking(io, updated, 'booking_updated', mapBookingToFrontend(updated), { includeAdmins: true });

    // Live tracking stops automatically once the provider is no longer travelling / on site.
    if (LIVE_LOCATION_STATUSES.includes(booking.status) && !LIVE_LOCATION_STATUSES.includes(updated.status)) {
      liveLocation.forget(booking.id);
      emitToBooking(io, updated, 'location:stopped', { bookingId: booking.id, reason: 'order_status' });
    }

    try {
      switch (target) {
        case 'ON_THE_WAY':
          await notifyUser(booking.customer_id, '🚚 Provider is on the way', `${providerName} is traveling to your location.`, { type: 'provider_on_the_way', data: { bookingId: booking.id } });
          emitToBooking(io, updated, 'provider_started', { bookingId: booking.id, status: 'ON_THE_WAY' });
          break;
        case 'ARRIVED':
          await notifyUser(booking.customer_id, '📍 Provider arrived', `${providerName} has arrived at your address.`, { type: 'provider_arrived', data: { bookingId: booking.id } });
          emitToBooking(io, updated, 'provider_arrived', { bookingId: booking.id, status: 'ARRIVED' });
          break;
        case 'IN_PROGRESS':
          await notifyUser(
            booking.customer_id,
            '⚙️ Service started',
            booking.status === 'REVISION_REQUESTED' ? 'Provider resumed work on your revision request.' : `${providerName} has started the service.`,
            { type: 'service_started', data: { bookingId: booking.id } }
          );
          emitToBooking(io, updated, 'service_started', { bookingId: booking.id, status: 'IN_PROGRESS' });
          break;
        case 'WAITING_CUSTOMER_CONFIRMATION':
          await notifyUser(booking.customer_id, '🎉 Service completed', 'Provider marked this service as completed. Please confirm or report a problem.', { type: 'service_completed', data: { bookingId: booking.id } });
          emitToBooking(io, updated, 'provider_completed', { bookingId: booking.id, status: 'WAITING_CUSTOMER_CONFIRMATION' });
          break;
        case 'REVISION_REQUESTED':
          await notifyUser(booking.provider_id, '🔄 Revision requested', 'The customer requested changes. Please review and resume the job.', { type: 'revision_requested', data: { bookingId: booking.id } });
          emitToBooking(io, updated, 'revision_requested', { bookingId: booking.id, revisionNotes: updated.revision_notes });
          break;
      }
    } catch (notifErr) {
      console.warn('Non-blocking notification error:', notifErr.message);
    }

    res.json(view(updated, req.user));
  } catch (err) {
    sendError(res, err, 'Failed to update order status');
  }
});

// ─── CUSTOMER: Confirm completion ────────────────────────────────────────────
router.patch('/:id/confirm-completion', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    const { booking: updated } = await confirmCompletion({ booking, user: req.user, io: req.app.get('io') });
    res.json(view(updated, req.user));
  } catch (err) {
    sendError(res, err, 'Failed to confirm completion');
  }
});

// ─── Report a problem (opens a dispute) ──────────────────────────────────────
router.post('/:id/report-issue', async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (booking.payment_status !== PAYMENT.PAID || ['completed', 'cancelled', 'disputed'].includes(booking.status)) {
      throw new HttpError(400, 'Problems can be reported on paid, open orders. Contact support for other issues.');
    }
    const reason = String(req.body.reason || 'Service problem').slice(0, 200);
    const description = String(req.body.description || '').slice(0, 2000);

    const { data: updated, error } = await supabase.from('bookings').update({ status: 'disputed', disputed_at: now(), updated_at: now() }).eq('id', booking.id).select().single();
    if (error) throw error;
    await logStatus(booking.id, 'disputed', req.user.id, `Problem reported: ${reason}`);

    const io = req.app.get('io');
    const targetUserId = req.user.id === booking.customer_id ? booking.provider_id : booking.customer_id;
    const { report } = await createObjection({ reporter: req.user, targetUserId, bookingId: booking.id, reason, description, io });
    await notifyUser(targetUserId, '⚠️ Dispute opened', `A problem was reported on order ${booking.order_number || ''}. ServeHome support will review it.`, { type: 'dispute_opened', data: { bookingId: booking.id } });

    emitToBooking(io, updated, 'booking_updated', mapBookingToFrontend(updated), { includeAdmins: true });
    res.status(201).json({ message: 'Problem reported. Our support team will review it.', report, booking: view(updated, req.user) });
  } catch (err) {
    sendError(res, err, 'Failed to report problem');
  }
});

// ─── CUSTOMER: Cancel a request or an unpaid order ───────────────────────────
router.post('/:id/cancel', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (booking.status === 'cancelled') throw new HttpError(409, 'This order is already cancelled.');
    if (booking.payment_status === PAYMENT.PAID) {
      throw new HttpError(400, 'This order is already paid. Use "Report a problem" and our team will arrange a refund.', 'PAID_ORDER');
    }
    if ([PAYMENT.PENDING, PAYMENT.SUBMITTED].includes(booking.payment_status)) {
      throw new HttpError(409, 'Your payment is being verified. Please contact support if you need to cancel.', 'PAYMENT_UNDER_REVIEW');
    }
    if (!CANCELLABLE_STATUSES.includes(booking.status)) throw new HttpError(400, 'This order can no longer be cancelled.');

    const reason = text(req.body.reason, 500);
    const ts = now();
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', communication_status: 'LOCKED', cancelled_at: ts, cancelled_by: req.user.id, cancellation_reason: reason, updated_at: ts })
      .eq('id', booking.id)
      .in('status', CANCELLABLE_STATUSES)
      .in('payment_status', [PAYMENT.UNPAID, PAYMENT.REJECTED])
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new HttpError(409, 'The order changed while cancelling. Please refresh.');

    const { data: offers } = await supabase.from('booking_offers').select('provider_id').eq('booking_id', booking.id);
    await supabase.from('booking_offers').update({ status: 'cancelled', updated_at: ts }).eq('booking_id', booking.id);
    await logStatus(booking.id, 'cancelled', req.user.id, `Cancelled by customer${reason ? `: ${reason}` : ''}`);

    const affected = [booking.provider_id, ...(offers || []).map((o) => o.provider_id)];
    await notifyUsers(affected, '🚫 Request cancelled', `The customer cancelled ${booking.category_name}${booking.order_number ? ` (${booking.order_number})` : ''}.`, {
      type: 'request_cancelled',
      data: { bookingId: booking.id },
    });
    emitToBooking(req.app.get('io'), updated, 'booking_updated', mapBookingToFrontend(updated), { includeAdmins: true });
    res.json(view(updated, req.user));
  } catch (err) {
    sendError(res, err, 'Failed to cancel order');
  }
});

// ─── CUSTOMER: Photos of the problem (shown to providers while they quote) ───
router.post('/:id/photos', requireRole('customer'), uploadRequestPhoto.single('image'), async (req, res) => {
  try {
    if (!req.file) throw new HttpError(400, 'Please attach a photo');
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (!CANCELLABLE_STATUSES.includes(booking.status)) throw new HttpError(400, 'Photos can only be added before the service starts.');
    const stored = privatePathFor(req.file.filename);
    const updated = await updatePhotos(booking, (list) => {
      if (list.length >= MAX_PHOTOS) throw new HttpError(400, `You can add up to ${MAX_PHOTOS} photos`);
      return [...list, stored];
    });
    res.status(201).json(view(updated, req.user));
  } catch (err) {
    discardUpload(req.file);
    sendError(res, err, 'Failed to add photo');
  }
});

router.delete('/:id/photos/:name', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    const { name } = req.params;
    const stored = `${PRIVATE_PREFIX}${name}`;
    if (!isSafeName(name) || !(booking.photos || []).includes(stored)) throw new HttpError(404, 'Photo not found');
    if (!CANCELLABLE_STATUSES.includes(booking.status)) throw new HttpError(400, 'Photos can only be changed before the service starts.');
    const updated = await updatePhotos(booking, (list) => list.filter((p) => p !== stored));
    await storage.remove('private', name);
    res.json(view(updated, req.user));
  } catch (err) {
    sendError(res, err, 'Failed to remove photo');
  }
});

// ─── Get single order ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const booking = await getViewableBooking(req.params.id, req.user);
    res.json(view(booking, req.user));
  } catch (err) {
    sendError(res, err, 'Failed to fetch order');
  }
});

// ─── PAYMENT: bank transfer instructions ─────────────────────────────────────
router.get('/:id/payment-instructions', requireRole('customer'), async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (booking.customer_id !== req.user.id) throw new HttpError(403, 'Only the customer can view payment instructions');
    res.json(await getPaymentInstructions(booking));
  } catch (err) {
    sendError(res, err, 'Failed to load payment instructions');
  }
});

// ─── PAYMENT: upload receipt + transaction number ────────────────────────────
async function paymentProofHandler(req, res) {
  try {
    if (!req.file) throw new HttpError(400, 'Please attach the transfer receipt');
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    const result = await submitPaymentProof({
      booking,
      user: req.user,
      storedPath: privatePathFor(req.file.filename),
      transactionNumber: req.body.transactionNumber || req.body.referenceNumber,
      io: req.app.get('io'),
    });
    if (result.duplicate) discardUpload(req.file);
    res.status(result.duplicate ? 200 : 201).json({
      ...view(result.booking, req.user),
      message: result.duplicate ? 'Your receipt is already being verified.' : 'Payment submitted. We will verify it shortly.',
    });
  } catch (err) {
    discardUpload(req.file);
    sendError(res, err, 'Failed to submit payment');
  }
}
router.post('/:id/payment-proof', requireRole('customer'), uploadSlip.single('image'), paymentProofHandler);
router.patch('/:id/payment-slip', requireRole('customer'), uploadSlip.single('image'), paymentProofHandler);

// ─── PAYMENT: card (Stripe) — verified with Stripe before marking PAID ───────
router.post('/:id/payment-intent', requireRole('customer'), async (req, res) => {
  try {
    if (!isStripeConfigured()) throw new HttpError(503, 'Card payments are currently unavailable. Please use bank transfer.');
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (!AWAITING_PAYMENT.includes(booking.status) || booking.payment_status === PAYMENT.PAID) throw new HttpError(400, 'Order is not awaiting payment');
    const intent = await createBookingPaymentIntent(booking);
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: Number(booking.price), currency: intent.currency });
  } catch (err) {
    sendError(res, err, 'Failed to start card payment');
  }
});

router.post('/:id/stripe-pay', requireRole('customer'), async (req, res) => {
  try {
    if (!isStripeConfigured()) throw new HttpError(503, 'Card payments are currently unavailable. Please use bank transfer.');
    if (!req.body.paymentIntentId) throw new HttpError(400, 'paymentIntentId is required');
    const booking = await getParticipantBooking(req.params.id, req.user, { allowAdmin: false });
    if (booking.payment_status === PAYMENT.PAID) return res.json({ message: 'Payment already confirmed', booking: view(booking, req.user) });

    const intent = await verifyBookingPayment(req.body.paymentIntentId, booking);
    if (!intent) throw new HttpError(402, 'Payment has not been completed');
    const updated = await markPaid({ booking, actor: null, method: 'stripe', externalReference: intent.id, io: req.app.get('io') });
    res.json({ message: 'Payment successful', booking: view(updated, req.user) });
  } catch (err) {
    sendError(res, err, 'Payment processing failed');
  }
});

module.exports = router;
