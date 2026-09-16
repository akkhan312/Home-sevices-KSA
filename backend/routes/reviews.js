const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const { submitReview } = require('../services/biddingService');
const { sendError } = require('../services/access');
const { toPublicUrl } = require('../config');

// POST /api/reviews — customer reviews a confirmed order (once per order)
router.post('/', authenticate, requireRole('customer'), async (req, res) => {
  try {
    const { bookingId, rating, comment, hireAgain, quality, professionalism, punctuality, value } = req.body;
    const review = await submitReview({
      bookingId,
      customerId: req.user.id,
      rating,
      reviewText: comment ?? req.body.reviewText,
      recommend: hireAgain ?? req.body.recommend,
      quality,
      professionalism,
      punctuality,
      value,
    });
    res.status(201).json({ message: 'Review submitted', review });
  } catch (err) {
    sendError(res, err, 'Failed to submit review');
  }
});

// GET /api/reviews/provider/:id — public reviews for a provider
router.get('/provider/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, quality, professionalism, punctuality, value_rating, comment, review_text, hire_again, created_at, customer_id')
      .eq('provider_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const customerIds = [...new Set((data || []).map((r) => r.customer_id))];
    const { data: customers } = customerIds.length
      ? await supabase.from('users').select('id, name, profile_picture').in('id', customerIds)
      : { data: [] };
    const byId = new Map((customers || []).map((c) => [c.id, c]));

    const reviews = (data || []).map((r) => {
      const c = byId.get(r.customer_id);
      // Only the first name is shown publicly.
      return {
        id: r.id,
        rating: r.rating,
        quality: r.quality,
        professionalism: r.professionalism,
        punctuality: r.punctuality,
        value: r.value_rating,
        comment: r.comment || r.review_text || null,
        hire_again: r.hire_again,
        created_at: r.created_at,
        customerName: (c?.name || 'Customer').split(' ')[0],
        customerPicture: c?.profile_picture ? toPublicUrl(c.profile_picture) : null,
      };
    });

    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    res.json({ reviews, averageRating: parseFloat(avg.toFixed(1)), total: reviews.length });
  } catch (err) {
    sendError(res, err, 'Failed to fetch reviews');
  }
});

// GET /api/reviews/booking/:id — has this order been reviewed?
router.get('/booking/:id', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('reviews').select('id, rating, comment, review_text, customer_id, provider_id').eq('booking_id', req.params.id).maybeSingle();
    if (data && req.user.role !== 'admin' && ![data.customer_id, data.provider_id].includes(req.user.id)) {
      return res.json({ reviewed: true, review: null });
    }
    res.json({ reviewed: !!data, review: data ? { id: data.id, rating: data.rating, comment: data.comment || data.review_text } : null });
  } catch (err) {
    sendError(res, err, 'Failed to check review');
  }
});

module.exports = router;
