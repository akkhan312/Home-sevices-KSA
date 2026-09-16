const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate } = require('../middleware/auth');
const { sendError, HttpError } = require('../services/access');
const { createObjection } = require('../services/reportService');

// ─── POST /api/reports — File a new report or objection ──────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { targetUserId, bookingId, reason, description } = req.body;
    if (!targetUserId || !reason) throw new HttpError(400, 'Target user ID and reason are required');
    if (targetUserId === req.user.id) throw new HttpError(400, 'You cannot report yourself');

    const { data: target } = await supabase.from('users').select('id').eq('id', targetUserId).maybeSingle();
    if (!target) throw new HttpError(404, 'Reported user not found');

    const { notification } = await createObjection({
      reporter: req.user,
      targetUserId,
      bookingId,
      reason,
      description,
      io: req.app.get('io'),
    });

    res.status(201).json({ message: 'Report submitted successfully. Admin will review and verify.', report: notification });
  } catch (err) {
    sendError(res, err, 'Failed to file report');
  }
});

module.exports = router;
