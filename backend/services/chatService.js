const supabase = require('../supabase');
const { mapMessageToFrontend } = require('../utils/mappers');
const { HttpError } = require('./access');
const { toStoredPath } = require('./files');

/** Only media hosted by this API is accepted; anything else is rejected rather than silently stored. */
function media(value) {
  if (value === undefined || value === null || value === '') return null;
  const stored = toStoredPath(value);
  if (!stored) throw new HttpError(400, 'Attachments must be uploaded through ServeHome');
  return stored;
}

function location(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new HttpError(400, 'Invalid location');
  }
  return { latitude, longitude, address: typeof value.address === 'string' ? value.address.slice(0, 300) : undefined, live: Boolean(value.live) };
}

const MAX_TEXT = 4000;
const str = (v, max = 2048) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

/** Validates and stores a chat message. Sender identity always comes from the authenticated user. */
async function saveMessage({ booking, user, data }) {
  const text = typeof data.text === 'string' ? data.text.slice(0, MAX_TEXT) : '';
  const image = media(data.image);
  const voiceUrl = media(data.voiceUrl);
  const documentUrl = media(data.documentUrl);
  const loc = location(data.location);

  if (!text.trim() && !image && !voiceUrl && !documentUrl && !loc) {
    throw new HttpError(400, 'Message is empty');
  }

  const { data: row, error } = await supabase
    .from('messages')
    .insert({
      booking_id: booking.id,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      text,
      location: loc,
      image,
      voice_url: voiceUrl,
      voice_duration: Number.isFinite(Number(data.voiceDuration)) ? Math.round(Number(data.voiceDuration)) : 0,
      document_url: documentUrl,
      document_name: str(data.documentName, 255),
      reply_to: data.replyTo && typeof data.replyTo === 'object' ? data.replyTo : null,
      delivered: true,
    })
    .select()
    .single();

  if (error) throw error;

  const mapped = mapMessageToFrontend(row);
  if (data.tempId) mapped.tempId = String(data.tempId).slice(0, 64);
  return mapped;
}

module.exports = { saveMessage };
