const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { mapBookingToFrontend } = require('../utils/mappers');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadSlip, discardUpload } = require('../middleware/upload');
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
  logStatus,
  sendError,
} = require('../services/access');
const { submitOrUpdateOffer, getOffersForBooking, acceptOffer, increaseBudget, submitReview, pricingFor } = require('../services/biddingService');
const { createObjection } = require('../services/reportService');
const { getPaymentInstructions, submitPaymentProof, markPaid, AWAITING_PAYMENT } = require('../services/paymentService');
const { confirmCompletion } = require('../services/payoutService');
const { privatePathFor } = require('../services/files');
const { isStripeConfigured, createBookingPaymentIntent, verifyBookingPayment } = require('../services/stripeService');

router.use(authenticate);

const now = () => new Date().toISOString();
const text = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const view = (booking, user) => redactForViewer(mapBookingToFrontend(booking), booking, user);

async function loadProvider(userId) {
  const { data } = await supabase.from('users').select('id, name, status, approval_status, service_categories, city').eq('id', userId).maybeSingle();
  return data;
}

function assertApprovedProvider(provider) {
  if (!provider || provider.status === 'suspended') throw new HttpError(403, 'Your provider account is not active.');
  if ((provider.approval_status || 'APPROVED') !== 'APPROVED') {
    throw new HttpError(403, 'Your provider account is awaiting admin approval.', 'PROVIDER_NOT_APPROVED');
  }
}

/** A provider sees a request if it matches their services and (when both are known) their city. */
function matchesProvider(booking, provider) {
  const categories = provider.service_categories || [];
  if (categories.length && booking.category && !categories.includes(booking.category)) return false;
  if (provider.city && booking.city && provider.city.toLowerCase() !== booking.city.toLowerCase()) return false;
  return true;
}

// ─── CUSTOMER: Create a service request ──────────────────────────────────────
router.post('/', requireRole('customer'), async (req, res) => {
  try {
    const b = req.body;
    const price = Number(b.price ?? b.budget);
    if (!b.category || !b.categoryName || !b.scheduledDate || !b.address) {
      throw new HttpError(400, 'Service, date and address are required');
    }
    if (!Number.isFinite(price) || price <= 0 || price > 100000) throw new HttpError(400, 'Please provide a valid budget');
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);

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
        city: text(b.city, 60),
        area: text(b.area, 120),
        latitude: b.latitude !== undefined && Number.isFinite(lat) ? lat : null,
        longitude: b.longitude !== undefined && Number.isFinite(lng) ? lng : null,
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
        .select('id, service_categories, city, status, approval_status')
        .eq('role', 'provider')
        .or('status.is.null,status.neq.suspended');
      const matching = (providers || []).filter((p) => (p.approval_status || 'APPROVED') === 'APPROVED' && matchesProvider(booking, p));
      if (matching.length) {
        const title = `🔔 New request: ${booking.category_name}`;
        const body = `${booking.area || booking.city || 'Nearby'} · ${booking.scheduled_date}. Budget SAR ${price}. Send your proposal.`;
        await supabase.from('notifications').insert(matching.map((p) => ({ user_id: p.id, title, body, type: 'new_request', data: { bookingId: booking.id }, read: false })));
        const io = req.app.get('io');
        for (const p of matching) {
          io?.to(`user:${p.id}`).emit('new_job_alert', { title, body, bookingId: booking.id, categoryName: booking.category_name, price, scheduledDate: booking.scheduled_date, scheduledTime: booking.scheduled_time });
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
    const approved = provider && provider.status !== 'suspended' && (provider.approval_status || 'APPROVED') === 'APPROVED';

    const { data: jobs, error } = await supabase
      .from('bookings')
      .select('*')
      .or(`status.in.(${OPEN_STATUSES.join(',')}),provider_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const visible = (jobs || []).filter((b) => b.provider_id === req.user.id || (approved && matchesProvider(b, provider)));
    res.set('X-Provider-Approval', provider?.approval_status || 'APPROVED');
    res.json(visible.map((b) => view(b, req.user)));
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

    const io = req.app.get('io');
    emitToBooking(io, booking, 'new_offer', offer);
    emitToBooking(io, booking, 'offer_updated', offer);
    await notifyUser(booking.customer_id, '📨 New proposal', `${offer.providerName} offered SAR ${offer.price} for ${booking.category_name}.`, { type: 'new_proposal', data: { bookingId: booking.id } });

    res.status(201).json(offer);
  } catch (err) {
    sendError(res, err, 'Failed to submit proposal');
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
const STATUS_TRANSITIONS = {
  accepted: { from: OPEN_STATUSES, actor: 'provider' },
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
    if (rule.actor === 'provider' && req.user.role !== 'provider') throw new HttpError(403, 'Only providers can accept requests');
    if (rule.actor === 'assigned_provider' && booking.provider_id !== req.user.id) throw new HttpError(403, 'Not authorized for this order');
    if (rule.actor === 'customer' && booking.customer_id !== req.user.id) throw new HttpError(403, 'Only the customer can request a revision');
    if (rule.paid && booking.payment_status !== PAYMENT.PAID) throw new HttpError(400, 'Payment must be verified before the service can start.', 'PAYMENT_REQUIRED');
    if (!rule.from.includes(booking.status)) throw new HttpError(400, `Cannot change status from ${booking.status} to ${target}.`);

    const updateData = { status: target, updated_at: now() };
    if (target === 'accepted') {
      const provider = await loadProvider(req.user.id);
      assertApprovedProvider(provider);
      Object.assign(updateData, await pricingFor(booking, booking.price), {
        provider_id: req.user.id,
        provider_name: provider.name,
        payment_status: PAYMENT.UNPAID,
        communication_status: 'LOCKED',
        payment_reference: booking.order_number || `BP-${booking.id.slice(0, 8).toUpperCase()}`,
      });
    }
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
      emitToBooking(io, updated, 'location:stopped', { bookingId: booking.id, reason: 'order_status' });
    }

    try {
      switch (target) {
        case 'accepted':
          await notifyUser(booking.customer_id, `✅ ${providerName} accepted your request`, 'Complete the payment to confirm your order.', { type: 'proposal_selected', data: { bookingId: booking.id } });
          emitToBooking(io, updated, 'job_accepted', { bookingId: booking.id, providerName });
          break;
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
