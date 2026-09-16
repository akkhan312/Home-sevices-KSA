const express = require('express');
const router = express.Router();
const { logCall, getUserCallHistory } = require('../services/callService');
const { authenticate: auth } = require('../middleware/auth');
const { getParticipantBooking, sendError } = require('../services/access');

// ─── GET /api/calls/history ───────────────────────────────────────────────────
router.get('/history', auth, async (req, res) => {
  try {
    const history = await getUserCallHistory(req.user.id);
    res.json(history);
  } catch (err) {
    console.error('Fetch call history error:', err);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// ─── POST /api/calls/log ──────────────────────────────────────────────────────
router.post('/log', auth, async (req, res) => {
  try {
    const { bookingId, durationSeconds, status, quality } = req.body;
    // Only allow logging calls between the two participants of a booking.
    const booking = await getParticipantBooking(bookingId, req.user, { allowAdmin: false });
    const receiverId = booking.customer_id === req.user.id ? booking.provider_id : booking.customer_id;
    if (!receiverId) return res.status(400).json({ error: 'This booking has no other participant yet' });
    const callRecord = await logCall({
      bookingId,
      callerId: req.user.id,
      receiverId,
      durationSeconds,
      status,
      quality
    });
    res.status(201).json(callRecord);
  } catch (err) {
    sendError(res, err, 'Failed to log call');
  }
});

module.exports = router;
