// Mobile push notifications through the Expo push service (delivers via FCM on Android and APNs on iOS).
const supabase = require('../supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]{10,200}\]$/;

/** Sends a batch of Expo push messages and returns the tickets. Tests replace it with `setTransport`. */
let transport = async (messages) => {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`Expo push responded ${res.status}`);
  const json = await res.json();
  return json.data || [];
};
let enabledOverride = null;

const isEnabled = () => (enabledOverride !== null ? enabledOverride : process.env.NODE_ENV !== 'test' && process.env.PUSH_NOTIFICATIONS !== 'false');
const isValidPushToken = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);

/** Registers a device for a user. A device belongs to whoever signed in on it last. */
async function registerToken(userId, token, platform) {
  if (!isValidPushToken(token)) return false;
  const { error } = await supabase
    .from('user_push_tokens')
    .upsert({ user_id: userId, expo_push_token: token, platform: String(platform || 'expo').slice(0, 20), updated_at: new Date().toISOString() }, { onConflict: 'expo_push_token' });
  if (error) throw error;
  return true;
}

async function unregisterToken(userId, token) {
  await supabase.from('user_push_tokens').delete().eq('user_id', userId).eq('expo_push_token', token);
}

/** Pushes one notification to every device of the given users. Failures are logged, never thrown. */
async function sendPush(userIds, { title, body, data = {} }) {
  if (!isEnabled()) return { sent: 0 };
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return { sent: 0 };

  try {
    const { data: rows, error } = await supabase.from('user_push_tokens').select('user_id, expo_push_token').in('user_id', ids);
    if (error) throw error;
    const tokens = [...new Set((rows || []).map((r) => r.expo_push_token).filter(isValidPushToken))];
    if (!tokens.length) return { sent: 0 };

    const messages = tokens.map((to) => ({ to, title, body: body || undefined, data, sound: 'default', priority: 'high', channelId: 'default' }));
    let sent = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const tickets = await transport(batch);
      const stale = [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'ok') sent++;
        else if (ticket?.details?.error === 'DeviceNotRegistered') stale.push(batch[idx].to);
      });
      if (stale.length) await supabase.from('user_push_tokens').delete().in('expo_push_token', stale);
    }
    return { sent };
  } catch (err) {
    console.warn('Push notification failed:', err.message);
    return { sent: 0, error: err.message };
  }
}

/** Fire-and-forget variant used next to in-app notifications so a slow push service never delays a request. */
function queuePush(userIds, payload) {
  sendPush(userIds, payload).catch(() => {});
}

module.exports = {
  registerToken,
  unregisterToken,
  sendPush,
  queuePush,
  isValidPushToken,
  setTransport: (fn) => { transport = fn; },
  setEnabled: (value) => { enabledOverride = value; },
};
