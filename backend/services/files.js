const crypto = require('crypto');
const path = require('path');
const { JWT_SECRET, API_HOST, toPublicUrl } = require('../config');

// Private uploads (payment receipts, chat media) are never served statically. They are only reachable
// through short-lived signed URLs handed to users who are authorised to see them.
const PRIVATE_PREFIX = 'private/';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const signingKey = crypto.createHash('sha256').update(`file-signing:${JWT_SECRET}`).digest();

const isSafeName = (name) => typeof name === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(name) && !name.startsWith('.');

function sign(name, exp) {
  return crypto.createHmac('sha256', signingKey).update(`${name}.${exp}`).digest('base64url');
}

function signedUrl(storedPath, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const name = storedPath.slice(PRIVATE_PREFIX.length);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${API_HOST}/api/files/${encodeURIComponent(name)}?exp=${exp}&sig=${sign(name, exp)}`;
}

function verifySignature(name, exp, sig) {
  if (!isSafeName(name) || !/^\d+$/.test(String(exp)) || typeof sig !== 'string') return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(name, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Converts a stored path into a URL the client can load. */
function fileUrl(storedPath) {
  if (!storedPath) return storedPath;
  if (storedPath.startsWith(PRIVATE_PREFIX)) return signedUrl(storedPath);
  return toPublicUrl(storedPath);
}

/**
 * Normalises a media reference sent by a client back into a stored path. Only files hosted by this API are
 * accepted, so chat messages cannot carry arbitrary external links disguised as images or voice notes.
 */
function toStoredPath(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith(PRIVATE_PREFIX) && isSafeName(value.slice(PRIVATE_PREFIX.length))) return value;

  let url;
  try {
    url = new URL(value, API_HOST);
  } catch {
    return null;
  }
  if (url.origin !== new URL(API_HOST).origin) return null;
  const filesMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (filesMatch && isSafeName(decodeURIComponent(filesMatch[1]))) return `${PRIVATE_PREFIX}${decodeURIComponent(filesMatch[1])}`;
  const publicMatch = url.pathname.match(/^\/uploads\/([^/]+)$/);
  if (publicMatch && isSafeName(publicMatch[1])) return `/uploads/${publicMatch[1]}`;
  return null;
}

const privatePathFor = (filename) => `${PRIVATE_PREFIX}${path.basename(filename)}`;

module.exports = { PRIVATE_PREFIX, signedUrl, verifySignature, fileUrl, toStoredPath, privatePathFor, isSafeName };
