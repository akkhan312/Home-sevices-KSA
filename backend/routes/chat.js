const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { mapMessageToFrontend } = require('../utils/mappers');
const { authenticate } = require('../middleware/auth');
const { uploadChatImage, uploadVoice, discardUpload } = require('../middleware/upload');
const { toPublicUrl } = require('../config');
const { privatePathFor, fileUrl } = require('../services/files');
const { getParticipantBooking, emitToBooking, sendError, HttpError, assertCommunication, communicationFor } = require('../services/access');
const { saveMessage } = require('../services/chatService');

router.use(authenticate);

// ─── GET /api/chat/conversations — List chat conversations for user ──────────
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = supabase.from('bookings').select('*').order('updated_at', { ascending: false }).limit(100);
    if (userRole === 'customer') query = query.eq('customer_id', userId);
    else if (userRole === 'provider') query = query.eq('provider_id', userId);

    const { data: bookings, error: bErr } = await query;
    if (bErr) throw bErr;
    if (!bookings || bookings.length === 0) return res.json([]);

    const bookingIds = bookings.map((b) => b.id);
    const otherIds = [...new Set(bookings.map((b) => (userRole === 'customer' ? b.provider_id : b.customer_id)).filter(Boolean))];

    const [{ data: pinnedRows }, { data: users }] = await Promise.all([
      supabase.from('chat_pinned').select('booking_id').eq('user_id', userId).in('booking_id', bookingIds),
      otherIds.length ? supabase.from('users').select('id, name, profile_picture').in('id', otherIds) : Promise.resolve({ data: [] }),
    ]);
    const pinned = new Set((pinnedRows || []).map((p) => p.booking_id));
    const usersById = new Map((users || []).map((u) => [u.id, u]));

    const conversations = await Promise.all(
      bookings.map(async (b) => {
        const [{ data: lastMsgs }, { count: unreadCount }] = await Promise.all([
          supabase.from('messages').select('*').eq('booking_id', b.id).order('created_at', { ascending: false }).limit(1),
          supabase.from('messages').select('id', { count: 'exact', head: true }).eq('booking_id', b.id).neq('sender_id', userId).eq('seen', false),
        ]);

        const lastMsg = lastMsgs && lastMsgs.length > 0 ? mapMessageToFrontend(lastMsgs[0]) : null;
        const otherUserId = userRole === 'customer' ? b.provider_id : b.customer_id;
        const u = usersById.get(otherUserId);

        return {
          bookingId: b.id,
          categoryName: b.category_name,
          bookingStatus: b.status,
          otherUser: {
            id: otherUserId || '',
            name: u?.name || (userRole === 'customer' ? b.provider_name || 'Provider' : b.customer_name || 'Customer'),
            profilePicture: u?.profile_picture ? toPublicUrl(u.profile_picture) : '',
          },
          lastMessage: lastMsg,
          unreadCount: unreadCount || 0,
          isPinned: pinned.has(b.id),
          communication: communicationFor(b, req.user),
          updatedAt: lastMsg?.createdAt || b.updated_at,
        };
      })
    );

    conversations.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    res.json(conversations);
  } catch (err) {
    sendError(res, err, 'Failed to fetch conversations');
  }
});

// ─── POST /api/chat/upload-image ─────────────────────────────────────────────
// Media belongs to an order: the uploader must be allowed to chat on it (bookingId in query string or form).
function chatUpload(uploader, field) {
  return [
    uploader.single(field),
    async (req, res, next) => {
      try {
        if (!req.file) throw new HttpError(400, 'No file uploaded');
        const booking = await getParticipantBooking(req.query.bookingId || req.body.bookingId, req.user, { allowAdmin: false });
        assertCommunication(booking, req.user, 'chat');
        req.storedPath = privatePathFor(req.file.filename);
        next();
      } catch (err) {
        discardUpload(req.file);
        sendError(res, err, 'Upload failed');
      }
    },
  ];
}

router.post('/upload-image', ...chatUpload(uploadChatImage, 'image'), (req, res) => {
  res.json({ message: 'Image uploaded successfully', imageUrl: fileUrl(req.storedPath), relativeUrl: req.storedPath });
});

// ─── POST /api/chat/upload-voice ─────────────────────────────────────────────
router.post('/upload-voice', ...chatUpload(uploadVoice, 'file'), (req, res) => {
  res.json({ message: 'Voice message uploaded successfully', url: fileUrl(req.storedPath), relativeUrl: req.storedPath });
});

// ─── POST /api/chat/send — REST fallback when the socket is unavailable ──────
router.post('/send', async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.body.bookingId, req.user, { allowAdmin: false });
    assertCommunication(booking, req.user, 'chat');
    const mapped = await saveMessage({ booking, user: req.user, data: req.body });
    emitToBooking(req.app.get('io'), booking, 'new_message', mapped);
    res.status(201).json(mapped);
  } catch (err) {
    sendError(res, err, 'Failed to send message');
  }
});

// ─── POST /api/chat/pin/:bookingId — Toggle pinned conversation ──────────────
router.post('/pin/:bookingId', async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.bookingId, req.user);
    const { data: existing } = await supabase
      .from('chat_pinned')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('booking_id', booking.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('chat_pinned').delete().eq('id', existing.id);
      return res.json({ bookingId: booking.id, isPinned: false });
    }
    await supabase.from('chat_pinned').insert({ user_id: req.user.id, booking_id: booking.id });
    res.json({ bookingId: booking.id, isPinned: true });
  } catch (err) {
    sendError(res, err, 'Failed to toggle pin status');
  }
});

// ─── POST /api/chat/push-token — Save user push token ────────────────────────
router.post('/push-token', async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({ user_id: req.user.id, expo_push_token: token, platform: platform || 'expo', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;

    res.json({ message: 'Push token saved successfully' });
  } catch (err) {
    sendError(res, err, 'Failed to save push token');
  }
});

// ─── DELETE /api/chat/messages/:id — Delete own message ──────────────────────
router.delete('/messages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: msg } = await supabase.from('messages').select('id, booking_id, sender_id').eq('id', id).maybeSingle();
    if (!msg) throw new HttpError(404, 'Message not found');
    if (msg.sender_id !== req.user.id) throw new HttpError(403, 'You can only delete your own messages');

    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) throw error;

    const { data: booking } = await supabase.from('bookings').select('id, customer_id, provider_id').eq('id', msg.booking_id).maybeSingle();
    emitToBooking(req.app.get('io'), booking || { id: msg.booking_id }, 'message_deleted', { messageId: id, bookingId: msg.booking_id });

    res.json({ message: 'Message deleted successfully', messageId: id });
  } catch (err) {
    sendError(res, err, 'Failed to delete message');
  }
});

// ─── PATCH /api/chat/messages/:id/react — Toggle emoji reaction ──────────────
router.patch('/messages/:id/react', async (req, res) => {
  try {
    const { id } = req.params;
    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.slice(0, 16) : '';
    if (!emoji) throw new HttpError(400, 'Emoji is required');

    const { data: msg } = await supabase.from('messages').select('id, booking_id, reactions').eq('id', id).maybeSingle();
    if (!msg) throw new HttpError(404, 'Message not found');
    const booking = await getParticipantBooking(msg.booking_id, req.user, { allowAdmin: false });
    assertCommunication(booking, req.user, 'history');

    const reactions = { ...(msg.reactions || {}) };
    const users = reactions[emoji] || [];
    const updated = users.includes(req.user.id) ? users.filter((u) => u !== req.user.id) : [...users, req.user.id];
    if (updated.length > 0) reactions[emoji] = updated;
    else delete reactions[emoji];

    const { error } = await supabase.from('messages').update({ reactions }).eq('id', id);
    if (error) throw error;

    emitToBooking(req.app.get('io'), booking, 'message_reaction', { messageId: id, bookingId: msg.booking_id, reactions });
    res.json({ messageId: id, reactions });
  } catch (err) {
    sendError(res, err, 'Failed to update reaction');
  }
});

// ─── PATCH /api/chat/:bookingId/read — Mark messages as read ─────────────────
router.patch('/:bookingId/read', async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.bookingId, req.user, { allowAdmin: false });
    assertCommunication(booking, req.user, 'history');
    const { error } = await supabase
      .from('messages')
      .update({ seen: true, seen_at: new Date().toISOString() })
      .eq('booking_id', booking.id)
      .neq('sender_id', req.user.id)
      .eq('seen', false);
    if (error) throw error;

    emitToBooking(req.app.get('io'), booking, 'messages_read', { bookingId: booking.id, readByUserId: req.user.id, timestamp: new Date().toISOString() });
    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    sendError(res, err, 'Failed to mark messages read');
  }
});

// ─── GET /api/chat/:bookingId — Chat history ─────────────────────────────────
router.get('/:bookingId', async (req, res) => {
  try {
    const booking = await getParticipantBooking(req.params.bookingId, req.user);
    // Admins may read order conversations when handling disputes; participants only after payment.
    if (req.user.role !== 'admin') assertCommunication(booking, req.user, 'history');
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;

    res.json((messages || []).map(mapMessageToFrontend));
  } catch (err) {
    sendError(res, err, 'Failed to fetch chat history');
  }
});

module.exports = router;
