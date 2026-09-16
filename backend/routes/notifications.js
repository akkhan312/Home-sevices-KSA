const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate } = require('../middleware/auth');
const { createObjection } = require('../services/reportService');

// Internal helper — called by other routes to create notifications
async function createNotification(userId, { title, body, type, data = {} }) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      body,
      type,
      data,
      read: false,
    });
  } catch (err) {
    console.error('createNotification error:', err);
  }
}

// GET /api/notifications — get current user's notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const unreadCount = (data || []).filter(n => !n.read).length;
    res.json({ notifications: data || [], unreadCount });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read — mark a notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('read', false);

    if (error) throw error;
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all notifications' });
  }
});

// POST /api/notifications/objection — submit objection / dispute to admin
router.post('/objection', authenticate, async (req, res) => {
  try {
    const { bookingId, reason, description, targetUserId } = req.body;
    if (!reason) return res.status(400).json({ error: 'Please select a reason for the objection' });

    const { notification: notif } = await createObjection({ reporter: req.user, targetUserId, bookingId, reason, description, io: req.app.get('io') });

    res.status(201).json({ message: 'Objection submitted successfully to Admin.', objection: notif });
  } catch (err) {
    console.error('Submit objection error:', err);
    res.status(500).json({ error: 'Failed to submit objection' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
