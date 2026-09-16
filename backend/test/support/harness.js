// Boots the real Express + Socket.IO app against the in-memory Supabase fake.
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-production-rules-123456';
process.env.SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.API_HOST = 'http://api.test';
process.env.STRIPE_SECRET_KEY = '';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'servehome-uploads-'));
process.env.DEFAULT_COMMISSION_PERCENT = '10';
process.env.REQUIRE_PROVIDER_APPROVAL = 'true';

const { createFakeSupabase } = require('./fakeSupabase');

const fake = createFakeSupabase();
// Replace the real Supabase client module before any app code requires it.
const supabasePath = require.resolve('../../supabase');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const { createApp } = require('../../app');
const { signSessionToken } = require('../../middleware/auth');
const { io: ioClient } = require('socket.io-client');

async function start() {
  const { server, io } = createApp({ enableRateLimit: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];

  function createUser(fields) {
    const user = fake.insertRow('users', { password: null, phone: '0500000000', ...fields });
    return { ...user, token: signSessionToken(user) };
  }

  async function api(method, url, { token, body, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${url}`, init);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  function receiptForm(fields = {}, { type = 'image/png', name = 'receipt.png' } = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('image', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type }), name);
    return form;
  }

  async function connect(token) {
    const socket = ioClient(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  /** Resolves with the first payload of `event`, or null if it does not arrive within `ms`. */
  function waitFor(socket, event, ms = 600) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve(null);
      }, ms);
      const handler = (payload) => {
        clearTimeout(timer);
        resolve(payload);
      };
      socket.once(event, handler);
    });
  }

  async function stop() {
    sockets.forEach((s) => s.disconnect());
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { base, fake, api, createUser, receiptForm, connect, waitFor, stop };
}

module.exports = { start, fake };
