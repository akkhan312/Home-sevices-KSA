const supabase = require('../supabase');
const { HttpError, OPEN_STATUSES, PAYMENT } = require('./access');
const { getCommissionRate } = require('./settingsService');
const { splitCommission } = require('./money');
const { mapOfferToFrontend, mapBookingToFrontend, mapReviewToFrontend } = require('../utils/mappers');

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ─── 1. SUBMIT OR UPDATE PROVIDER PROPOSAL (one per provider per request) ────
async function submitOrUpdateOffer({ bookingId, providerId, price, etaMinutes, completionHours, message, notes }) {
  const { data: providerUser } = await supabase.from('users').select('name, profile_picture').eq('id', providerId).maybeSingle();

  const fields = {
    price: Number(price),
    eta_minutes: clampInt(etaMinutes, 1, 24 * 60, 30),
    completion_hours: Math.min(240, Math.max(0.5, Number(completionHours) || 1)),
    message: String(message || '').slice(0, 1000),
    notes: String(notes || '').slice(0, 1000),
    updated_at: new Date().toISOString(),
  };

  const { data: existingOffer } = await supabase
    .from('booking_offers')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('provider_id', providerId)
    .maybeSingle();

  let offerRecord;
  if (existingOffer) {
    const { data, error } = await supabase.from('booking_offers').update({ ...fields, status: 'updated' }).eq('id', existingOffer.id).select().single();
    if (error) throw error;
    offerRecord = data;
  } else {
    const { data, error } = await supabase
      .from('booking_offers')
      .insert({
        ...fields,
        booking_id: bookingId,
        provider_id: providerId,
        provider_name: providerUser?.name || 'Provider',
        provider_avatar: providerUser?.profile_picture || '',
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    offerRecord = data;
  }

  const { data: movedToBidding } = await supabase
    .from('bookings')
    .update({ status: 'BIDDING', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .in('status', ['pending', 'OPEN'])
    .select('id')
    .maybeSingle();

  if (movedToBidding) {
    await supabase.from('booking_status_history').insert({ booking_id: bookingId, status: 'BIDDING', changed_by: providerId, note: 'First proposal received' });
  }

  const [enriched] = await enrichOffers([offerRecord]);
  return enriched;
}

/** Adds live provider reputation (rating, jobs, verification) so customers compare real numbers. */
async function enrichOffers(offers) {
  const providerIds = [...new Set(offers.map((o) => o.provider_id))];
  if (providerIds.length === 0) return [];
  const { data: providers } = await supabase
    .from('users')
    .select('id, name, profile_picture, rating, review_count, completed_jobs, experience_years, iqama_number, approval_status')
    .in('id', providerIds);
  const byId = new Map((providers || []).map((p) => [p.id, p]));

  return offers.map((o) => {
    const p = byId.get(o.provider_id) || {};
    return mapOfferToFrontend({
      ...o,
      provider_name: p.name || o.provider_name,
      provider_avatar: p.profile_picture || o.provider_avatar,
      rating: p.rating,
      review_count: p.review_count,
      completed_jobs: p.completed_jobs,
      experience_years: p.experience_years,
      verified_badge: Boolean(p.iqama_number) && (p.approval_status || 'APPROVED') === 'APPROVED',
    });
  });
}

// ─── 2. GET ALL PROPOSALS FOR A REQUEST ──────────────────────────────────────
async function getOffersForBooking(bookingId) {
  const { data: offers, error } = await supabase
    .from('booking_offers')
    .select('*')
    .eq('booking_id', bookingId)
    .order('price', { ascending: true });
  if (error) throw error;
  return enrichOffers(offers || []);
}

/** Commission, earnings and payment reference fixed at the moment the provider is selected. */
async function pricingFor(booking, price) {
  const rate = await getCommissionRate(booking.category);
  const split = splitCommission(price, rate);
  return {
    price: split.amount,
    commission: split.commission,
    provider_earnings: split.providerEarnings,
    commission_rate: split.commissionRate,
  };
}

// ─── 3. SELECT PROVIDER (accept proposal) ────────────────────────────────────
async function acceptOffer({ bookingId, offerId, customerId }) {
  if (!offerId) throw new HttpError(400, 'Please choose a proposal');
  const { data: offer } = await supabase.from('booking_offers').select('*').eq('id', offerId).eq('booking_id', bookingId).maybeSingle();
  if (!offer) throw new HttpError(404, 'Selected proposal not found.');

  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Request not found.');
  if (booking.customer_id !== customerId) throw new HttpError(403, 'Only the customer can select a provider.');

  const { data: provider } = await supabase.from('users').select('id, name, status, approval_status').eq('id', offer.provider_id).maybeSingle();
  if (!provider || provider.status === 'suspended' || (provider.approval_status || 'APPROVED') !== 'APPROVED') {
    throw new HttpError(409, 'This provider is no longer available. Please choose another proposal.');
  }

  const pricing = await pricingFor(booking, offer.price);
  const ts = new Date().toISOString();

  // Conditional update: a request can only be converted into an order once.
  const { data: updatedBooking, error: updateErr } = await supabase
    .from('bookings')
    .update({
      ...pricing,
      status: 'OFFER_ACCEPTED',
      payment_status: PAYMENT.UNPAID,
      communication_status: 'LOCKED',
      payout_status: 'NONE',
      selected_offer_id: offerId,
      selected_provider_id: offer.provider_id,
      provider_id: offer.provider_id,
      provider_name: provider.name,
      escrow_amount: pricing.price,
      duration_hours: offer.completion_hours,
      updated_at: ts,
    })
    .eq('id', bookingId)
    .in('status', OPEN_STATUSES)
    .select()
    .maybeSingle();

  if (updateErr) throw updateErr;
  if (!updatedBooking) throw new HttpError(409, 'A provider has already been selected for this request.');

  const reference = updatedBooking.order_number || `BP-${bookingId.slice(0, 8).toUpperCase()}`;
  if (!updatedBooking.payment_reference) {
    await supabase.from('bookings').update({ payment_reference: reference }).eq('id', bookingId);
    updatedBooking.payment_reference = reference;
  }

  await supabase.from('booking_offers').update({ status: 'accepted', updated_at: ts }).eq('id', offerId);
  await supabase.from('booking_offers').update({ status: 'rejected', updated_at: ts }).eq('booking_id', bookingId).neq('id', offerId);
  await supabase.from('booking_status_history').insert({
    booking_id: bookingId,
    status: 'OFFER_ACCEPTED',
    changed_by: customerId,
    note: `Customer selected ${provider.name} for SAR ${pricing.price}`,
  });

  const [winningOffer] = await enrichOffers([{ ...offer, status: 'accepted' }]);
  return { booking: mapBookingToFrontend(updatedBooking), winningOffer, raw: updatedBooking };
}

// ─── 4. INCREASE CUSTOMER BUDGET (only while collecting proposals) ───────────
async function increaseBudget({ bookingId, customerId, newBudget }) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  if (booking.customer_id !== customerId) throw new HttpError(403, 'Unauthorized.');

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ budget: Number(newBudget), price: Number(newBudget), updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .in('status', OPEN_STATUSES)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, 'Budget can only be changed while the request is open for proposals.');
  return mapBookingToFrontend(updated);
}

// ─── 5. REVIEWS ──────────────────────────────────────────────────────────────
const REVIEWABLE_STATUSES = ['CUSTOMER_CONFIRMED', 'customer_confirmed', 'completed'];

async function refreshProviderRating(providerId) {
  if (!providerId) return;
  const { data: all } = await supabase.from('reviews').select('rating').eq('provider_id', providerId);
  const count = (all || []).length;
  const avg = count ? all.reduce((s, r) => s + Number(r.rating), 0) / count : 0;
  await supabase.from('users').update({ rating: Math.round(avg * 100) / 100, review_count: count }).eq('id', providerId);
}

/** Creates the one review a customer may leave for a confirmed order. */
async function submitReview({ bookingId, customerId, rating, reviewText, recommend, quality, professionalism, punctuality, value }) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!booking) throw new HttpError(404, 'Booking not found.');
  if (booking.customer_id !== customerId) throw new HttpError(403, 'Only the customer of this order can review it.');
  if (!booking.provider_id || !REVIEWABLE_STATUSES.includes(booking.status)) {
    throw new HttpError(400, 'You can review the provider after confirming the service is complete.');
  }

  const score = (v, required) => {
    if (v === undefined || v === null || v === '') {
      if (required) throw new HttpError(400, 'Overall rating must be between 1 and 5');
      return null;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, 'Ratings must be whole numbers between 1 and 5');
    return n;
  };

  const text = reviewText ? String(reviewText).slice(0, 2000) : null;
  const { data: review, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: bookingId,
      customer_id: customerId,
      provider_id: booking.provider_id,
      rating: score(rating, true),
      quality: score(quality),
      professionalism: score(professionalism),
      punctuality: score(punctuality),
      value_rating: score(value),
      review_text: text,
      comment: text,
      recommend: recommend === undefined ? true : Boolean(recommend),
      hire_again: recommend === undefined ? true : Boolean(recommend),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'You have already reviewed this order.');
    throw error;
  }

  await refreshProviderRating(booking.provider_id);
  return mapReviewToFrontend(review);
}

module.exports = {
  submitOrUpdateOffer,
  getOffersForBooking,
  enrichOffers,
  pricingFor,
  acceptOffer,
  increaseBudget,
  submitReview,
  refreshProviderRating,
};
