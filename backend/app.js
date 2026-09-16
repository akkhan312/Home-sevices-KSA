const config = require('./config');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const supabase = require('./supabase');

const { authenticate, requireRole, resolveToken } = require('./middleware/auth');
const { uploadImage, UPLOAD_DIR, PRIVATE_UPLOAD_DIR } = require('./middleware/upload');
const { mapUserToFrontend } = require('./utils/mappers');
const {
  canView,
  isParticipant,
  fetchBooking,
  communicationFor,
  emitToBooking,
  sendError,
  HttpError,
} = require('./services/access');
const { saveMessage } = require('./services/chatService');
const { markPaid } = require('./services/paymentService');
const { stripeClient } = require('./services/stripeService');
const { verifySignature } = require('./services/files');

const FILE_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif', '.pdf': 'application/pdf', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp3': 'audio/mpeg', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.3gp': 'audio/3gpp' };

function createApp({ enableRateLimit = true } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6,
  });
  app.set('io', io);
  app.set('trust proxy', Number(process.env.TRUST_PROXY || (config.isProduction ? 1 : 0)));
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin }));

  // ─── Stripe webhook (raw body, registered before express.json) ─────────────
  app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = stripeClient();
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook not configured');

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.warn('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send('Invalid signature');
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object;
        const bookingId = intent.metadata?.bookingId;
        if (bookingId) {
          const booking = await fetchBooking(bookingId);
          const paidEnough = intent.amount_received >= Math.round(Number(booking.price) * 100) && intent.currency === config.STRIPE_CURRENCY;
          if (!paidEnough) console.warn(`Stripe payment for booking ${bookingId} does not match the booking price`);
          else if (booking.payment_status !== 'PAID') await markPaid({ booking, actor: null, method: 'stripe', externalReference: intent.id, io });
        }
      }
      res.json({ received: true });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return res.json({ received: true });
      console.error('Stripe webhook handling error:', err);
      res.status(500).send('Webhook handler error');
    }
  });

  app.use(express.json({ limit: '1mb' }));
  // Express 5 leaves req.body undefined when a request has no body; handlers expect an object.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  if (enableRateLimit) {
    app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  }

  app.get('/', (req, res) => {
    res.json({ status: 'ok', name: 'ServeHome API Server', version: '3.0.0' });
  });

  app.get('/api/health', async (req, res) => {
    const { error } = await supabase.from('users').select('id').limit(1);
    res.status(error ? 503 : 200).json({ status: error ? 'degraded' : 'ok', db: error ? 'unreachable' : 'ok', time: new Date().toISOString() });
  });

  // Public uploads (profile pictures). The private folder is excluded and only reachable via signed URLs.
  app.use('/uploads', (req, res, next) => (req.path.startsWith('/private') ? res.status(404).end() : next()));
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false, dotfiles: 'deny' }));

  // ─── Private files (receipts, chat media) via signed, expiring URLs ─────────
  app.get('/api/files/:name', (req, res) => {
    const { name } = req.params;
    if (!verifySignature(name, req.query.exp, req.query.sig)) return res.status(403).json({ error: 'This link has expired or is invalid' });
    const filePath = path.join(PRIVATE_UPLOAD_DIR, path.basename(name));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Type', FILE_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  });

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/bookings', require('./routes/bookings'));
  app.use('/api/withdrawals', require('./routes/withdrawals'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/reviews', require('./routes/reviews'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/favorites', require('./routes/favorites'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/chat', require('./routes/chat'));
  app.use('/api/wallets', require('./routes/wallets'));
  app.use('/api/calls', require('./routes/calls'));

  app.get('/api/users/me', authenticate, async (req, res) => {
    try {
      const { data: user, error } = await supabase.from('users').select('*').eq('id', req.user.id).single();
      if (error) throw error;
      res.json(mapUserToFrontend(user));
    } catch (err) {
      sendError(res, err, 'Failed to load profile');
    }
  });

  app.get('/api/users/:id/summary', authenticate, async (req, res) => {
    try {
      const { data: user } = await supabase.from('users').select('id, name, role, profile_picture').eq('id', req.params.id).maybeSingle();
      if (!user) throw new HttpError(404, 'User not found');
      res.json({ id: user.id, name: user.name, role: user.role, profilePicture: config.toPublicUrl(user.profile_picture) || '' });
    } catch (err) {
      sendError(res, err, 'Failed to load user');
    }
  });

  app.patch('/api/users/prices', authenticate, requireRole('provider'), async (req, res) => {
    try {
      const { prices } = req.body;
      if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new HttpError(400, 'Invalid prices object');
      const clean = {};
      for (const [k, v] of Object.entries(prices)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, `Invalid price for ${k}`);
        clean[String(k).slice(0, 50)] = n;
      }
      const { data: user, error } = await supabase.from('users').update({ service_prices: clean, updated_at: new Date().toISOString() }).eq('id', req.user.id).select('id, service_prices').single();
      if (error) throw error;
      res.json({ message: 'Service prices updated', servicePrices: user.service_prices });
    } catch (err) {
      sendError(res, err, 'Failed to update prices');
    }
  });

  app.post('/api/users/profile-picture', authenticate, uploadImage.single('image'), async (req, res) => {
    try {
      if (!req.file) throw new HttpError(400, 'No image uploaded');
      const imageUrl = `/uploads/${req.file.filename}`;
      const { error } = await supabase.from('users').update({ profile_picture: imageUrl, updated_at: new Date().toISOString() }).eq('id', req.user.id);
      if (error) throw error;
      res.json({ message: 'Profile picture updated', profilePicture: imageUrl, profilePictureUrl: config.toPublicUrl(imageUrl) });
    } catch (err) {
      sendError(res, err, 'Failed to update profile picture');
    }
  });

  // ─── PUBLIC: providers ─────────────────────────────────────────────────────
  const PROVIDER_PUBLIC_FIELDS = 'id, name, profile_picture, rating, review_count, completed_jobs, experience_years, city, service_categories, service_prices, bio, iqama_number, approval_status, created_at';
  const toPublicProvider = ({ iqama_number, approval_status, ...p }) => ({
    ...p,
    profile_picture: p.profile_picture ? config.toPublicUrl(p.profile_picture) : null,
    verified: Boolean(iqama_number) && (approval_status || 'APPROVED') === 'APPROVED',
  });

  app.get('/api/providers', async (req, res) => {
    try {
      const { category, city, minRating, verifiedOnly } = req.query;
      let query = supabase.from('users').select(PROVIDER_PUBLIC_FIELDS).eq('role', 'provider').or('status.is.null,status.neq.suspended').or('approval_status.is.null,approval_status.eq.APPROVED');
      if (city) query = query.eq('city', String(city));
      if (minRating && Number.isFinite(Number(minRating))) query = query.gte('rating', Number(minRating));
      if (verifiedOnly === 'true') query = query.not('iqama_number', 'is', null);
      if (category) query = query.contains('service_categories', [String(category)]);
      const { data, error } = await query.order('rating', { ascending: false }).limit(50);
      if (error) throw error;
      res.json((data || []).map(toPublicProvider));
    } catch (err) {
      sendError(res, err, 'Failed to fetch providers');
    }
  });

  app.get('/api/providers/:id', async (req, res) => {
    try {
      const { data: provider } = await supabase.from('users').select(PROVIDER_PUBLIC_FIELDS).eq('id', req.params.id).eq('role', 'provider').maybeSingle();
      if (!provider) throw new HttpError(404, 'Provider not found');
      res.json({ ...toPublicProvider(provider), jobsCompleted: Number(provider.completed_jobs || 0) });
    } catch (err) {
      sendError(res, err, 'Failed to fetch provider');
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
  });

  attachSockets(io);
  return { app, server, io };
}

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
function attachSockets(io) {
  const onlineUsers = new Map(); // userId -> open socket count
  const callSessions = new Map(); // bookingId -> { id, callerId, receiverId, state, connectedAt }

  io.use(async (socket, next) => {
    try {
      const user = await resolveToken(socket.handshake.auth?.token);
      if (!user) return next(new Error('Authentication required'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication unavailable'));
    }
  });

  const SIGNAL_CACHE_TTL_MS = 5 * 1000;

  /**
   * Loads the booking and checks the user may use `channel` on it. Signalling events (many per second) may use a
   * very short cache; everything else re-reads the order so a refund or cancellation locks immediately.
   */
  async function authorize(socket, bookingId, { channel, participantOnly = true, cached = false } = {}) {
    try {
      socket.data.bookingCache ||= new Map();
      const hit = cached && socket.data.bookingCache.get(bookingId);
      let booking;
      if (hit && hit.expires > Date.now()) booking = hit.booking;
      else {
        booking = await fetchBooking(bookingId);
        socket.data.bookingCache.set(bookingId, { booking, expires: Date.now() + SIGNAL_CACHE_TTL_MS });
      }
      const allowed = participantOnly ? isParticipant(booking, socket.user) : canView(booking, socket.user);
      if (!allowed) throw new HttpError(403, 'Not allowed', 'FORBIDDEN');
      if (channel) {
        const c = communicationFor(booking, socket.user);
        if (!c[channel]) throw new HttpError(403, c.reason === 'PAYMENT_REQUIRED' ? 'Communication is locked until the payment is verified.' : 'This order is closed.', c.reason === 'PAYMENT_REQUIRED' ? 'COMMUNICATION_LOCKED' : c.reason);
      }
      return booking;
    } catch (err) {
      socket.emit('error_message', { bookingId, channel, code: err.code || (err.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN'), error: err.status && err.status < 500 ? err.message : 'Not allowed' });
      return null;
    }
  }

  const counterpartOf = (booking, userId) => (booking.customer_id === userId ? booking.provider_id : booking.customer_id);

  async function updateCall(bookingId, state, extra = {}) {
    const session = callSessions.get(bookingId);
    if (!session) return null;
    session.state = state;
    const patch = { status: state, ...extra };
    if (state === 'CONNECTED') session.connectedAt = Date.now();
    if (['ENDED', 'MISSED', 'FAILED'].includes(state)) {
      patch.ended_at = new Date().toISOString();
      patch.duration_seconds = session.connectedAt ? Math.round((Date.now() - session.connectedAt) / 1000) : 0;
      callSessions.delete(bookingId);
    }
    if (session.id) {
      const { error } = await supabase.from('call_history').update(patch).eq('id', session.id);
      if (error) console.warn('call_history update failed:', error.message);
    }
    return session;
  }

  io.on('connection', (socket) => {
    const user = socket.user;
    const userId = user.id;

    socket.join([`user:${userId}`, `role:${user.role}`]);
    onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
    socket.emit('online_users_list', Array.from(onlineUsers.keys()));
    if (onlineUsers.get(userId) === 1) io.emit('user_presence', { userId, status: 'online', lastSeen: new Date().toISOString() });

    socket.on('get_online_users', () => socket.emit('online_users_list', Array.from(onlineUsers.keys())));

    // Joining a booking room only delivers order updates; chat/call/location are checked per event.
    socket.on('join_room', async (bookingId) => {
      const booking = await authorize(socket, bookingId, { participantOnly: false });
      if (booking) socket.join(String(booking.id));
    });
    socket.on('leave_room', (bookingId) => {
      if (typeof bookingId === 'string') socket.leave(bookingId);
    });

    const onTyping = (isTyping) => async ({ bookingId } = {}) => {
      const booking = await authorize(socket, bookingId, { channel: 'chat', cached: true });
      if (!booking) return;
      const payload = { userId, isTyping, bookingId };
      const target = io.to(`user:${counterpartOf(booking, userId)}`);
      target.emit('user_typing', payload);
      target.emit(isTyping ? 'typing:start' : 'typing:stop', payload);
    };
    socket.on('typing', onTyping(true));
    socket.on('typing:start', onTyping(true));
    socket.on('stop_typing', onTyping(false));
    socket.on('typing:stop', onTyping(false));

    const onMarkRead = async ({ bookingId } = {}) => {
      const booking = await authorize(socket, bookingId, { channel: 'history' });
      if (!booking) return;
      try {
        await supabase.from('messages').update({ seen: true, seen_at: new Date().toISOString() }).eq('booking_id', booking.id).neq('sender_id', userId).eq('seen', false);
        emitToBooking(io, booking, 'messages_read', { bookingId: booking.id, readByUserId: userId, timestamp: new Date().toISOString() });
      } catch (e) {
        console.error('Mark read socket error:', e.message);
      }
    };
    socket.on('mark_read', onMarkRead);
    socket.on('message:read', onMarkRead);

    const onSendMessage = async (data = {}) => {
      const booking = await authorize(socket, data.bookingId, { channel: 'chat' });
      if (!booking) return socket.emit('message_failed', { tempId: data.tempId, code: 'COMMUNICATION_LOCKED', error: 'Message not sent: communication is locked for this order.' });
      try {
        const mapped = await saveMessage({ booking, user, data });
        emitToBooking(io, booking, 'new_message', mapped);
      } catch (e) {
        console.error('Message error:', e.message);
        socket.emit('message_failed', { tempId: data.tempId, error: e.status === 400 ? e.message : 'Message could not be sent' });
      }
    };
    socket.on('send_message', onSendMessage);
    socket.on('message:send', onSendMessage);

    // ─── Live location (provider trip / on-site) ─────────────────────────────
    socket.on('update_live_location', async (data = {}) => {
      const booking = await authorize(socket, data.bookingId, { channel: 'liveLocation', cached: true });
      if (!booking) return;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      emitToBooking(io, booking, 'live_location_broadcast', {
        bookingId: booking.id,
        senderId: userId,
        senderName: user.name,
        senderRole: user.role,
        latitude,
        longitude,
        heading: Number.isFinite(Number(data.heading)) ? Number(data.heading) : null,
        timestamp: new Date().toISOString(),
      });
    });
    socket.on('location:update', (data) => socket.listeners('update_live_location')[0](data));
    socket.on('stop_live_location', async ({ bookingId } = {}) => {
      const booking = await authorize(socket, bookingId);
      if (booking) emitToBooking(io, booking, 'location:stopped', { bookingId: booking.id, stoppedBy: userId, reason: 'user' });
    });

    // ─── Calls ────────────────────────────────────────────────────────────────
    socket.on('call_user', async (data = {}) => {
      const booking = await authorize(socket, data.bookingId, { channel: 'call' });
      if (!booking) return socket.emit('call_failed', { bookingId: data.bookingId, code: 'COMMUNICATION_LOCKED', error: 'Calls unlock after the payment is verified.' });
      const targetId = counterpartOf(booking, userId);

      const { data: row } = await supabase
        .from('call_history')
        .insert({ booking_id: booking.id, caller_id: userId, receiver_id: targetId, status: 'CALLING', started_at: new Date().toISOString() })
        .select('id')
        .maybeSingle();
      callSessions.set(booking.id, { id: row?.id, callerId: userId, receiverId: targetId, state: 'CALLING' });

      if (!onlineUsers.has(targetId)) {
        await updateCall(booking.id, 'FAILED');
        return socket.emit('call_offline', { bookingId: booking.id, targetUserId: targetId });
      }
      const payload = { bookingId: booking.id, callId: row?.id || null, callerId: userId, callerName: user.name, callerAvatar: typeof data.callerAvatar === 'string' ? data.callerAvatar : undefined, serviceName: booking.category_name || 'Home Service', timestamp: new Date().toISOString() };
      io.to(`user:${targetId}`).emit('incoming_call', payload);
      io.to(`user:${targetId}`).emit('call:incoming', payload);
      await updateCall(booking.id, 'RINGING');
      socket.emit('call:ringing', { bookingId: booking.id, callId: row?.id || null });
    });

    const relay = (event, build, { state, modern } = {}) => async (data = {}) => {
      const booking = await authorize(socket, data.bookingId, { channel: 'call', cached: true });
      if (!booking) return;
      const targetId = counterpartOf(booking, userId);
      const payload = build(data, booking);
      io.to(`user:${targetId}`).emit(event, payload);
      if (modern) io.to(`user:${targetId}`).emit(modern, payload);
      if (state) await updateCall(booking.id, typeof state === 'function' ? state(booking.id) : state);
    };

    const endState = (bookingId) => (callSessions.get(bookingId)?.state === 'CONNECTED' ? 'ENDED' : 'MISSED');

    socket.on('webrtc_offer', relay('webrtc_offer', (d, b) => ({ senderId: userId, offer: d.offer, bookingId: b.id })));
    socket.on('webrtc_answer', relay('webrtc_answer', (d, b) => ({ senderId: userId, answer: d.answer, bookingId: b.id })));
    socket.on('ice_candidate', relay('ice_candidate', (d, b) => ({ senderId: userId, candidate: d.candidate, bookingId: b.id })));
    socket.on('voice_stream_chunk', relay('voice_stream_chunk', (d) => ({ senderId: userId, chunk: d.chunk })));
    socket.on('call_accepted', relay('call_accepted', (d, b) => ({ bookingId: b.id, acceptedBy: userId }), { state: 'CONNECTED', modern: 'call:accepted' }));
    socket.on('call_rejected', relay('call_rejected', (d, b) => ({ bookingId: b.id, rejectedBy: userId, reason: d.reason || 'declined' }), { state: 'MISSED' }));
    socket.on('call_cancelled', relay('call_cancelled', (d, b) => ({ bookingId: b.id, cancelledBy: userId }), { state: 'MISSED' }));
    socket.on('call_timeout', relay('call_timeout', (d, b) => ({ bookingId: b.id }), { state: 'MISSED' }));
    socket.on('call_busy', relay('call_busy', (d, b) => ({ bookingId: b.id, busyUserId: userId }), { state: 'MISSED' }));
    socket.on('call_ended', relay('call_ended', (d, b) => ({ bookingId: b.id, endedBy: userId, duration: Number(d.duration) || 0 }), { state: endState, modern: 'call:ended' }));

    // Order, payment and wallet events are emitted by the server after the REST action succeeds;
    // client-emitted copies are ignored so users cannot forge them.

    socket.on('disconnect', () => {
      const remaining = (onlineUsers.get(userId) || 1) - 1;
      if (remaining > 0) onlineUsers.set(userId, remaining);
      else {
        onlineUsers.delete(userId);
        io.emit('user_presence', { userId, status: 'offline', lastSeen: new Date().toISOString() });
      }
    });
  });
}

module.exports = { createApp };
