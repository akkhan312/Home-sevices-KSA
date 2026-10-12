const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const config = require('../config');
const { authenticate, requireRole, invalidateUser } = require('../middleware/auth');
const { uploadImage, discardUpload } = require('../middleware/upload');
const { mapUserToFrontend } = require('../utils/mappers');
const { sendError, HttpError } = require('../services/access');
const { isServiceCategory, normalizeCity } = require('../services/catalog');
const { parseWorkingHours } = require('../services/matching');
const { registerToken, unregisterToken, isValidPushToken } = require('../services/pushService');

router.use(authenticate);

const IBAN = /^SA\d{22}$/;
const cleanIban = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

router.get('/me', async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    if (error) throw error;
    res.json(mapUserToFrontend(user));
  } catch (err) {
    sendError(res, err, 'Failed to load profile');
  }
});

/** Builds the column patch for a profile update, validating every field the user sent. */
function profilePatch(body, role) {
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Please enter your full name');
    patch.name = name;
  }
  if (body.phone !== undefined) {
    const phone = String(body.phone).replace(/[\s-]/g, '');
    if (!/^\+?\d{9,15}$/.test(phone)) throw new HttpError(400, 'Please enter a valid phone number');
    patch.phone = phone;
  }
  if (body.city !== undefined) patch.city = normalizeCity(body.city);
  if (body.bio !== undefined) patch.bio = String(body.bio || '').trim().slice(0, 1000) || null;

  if (role !== 'provider') return patch;

  if (body.serviceCategories !== undefined) {
    const list = Array.isArray(body.serviceCategories) ? [...new Set(body.serviceCategories.map(String))] : [];
    if (!list.length) throw new HttpError(400, 'Choose at least one service you provide');
    const unknown = list.find((c) => !isServiceCategory(c));
    if (unknown) throw new HttpError(400, `Unknown service: ${unknown}`);
    patch.service_categories = list;
  }
  if (body.serviceAreas !== undefined) {
    if (!Array.isArray(body.serviceAreas)) throw new HttpError(400, 'Service areas must be a list of cities');
    const areas = [...new Set(body.serviceAreas.map(normalizeCity).filter(Boolean))];
    if (areas.length > 15) throw new HttpError(400, 'You can choose up to 15 service areas');
    patch.service_areas = areas;
  }
  if (body.isAvailable !== undefined) patch.is_available = Boolean(body.isAvailable);
  if (body.workingHours !== undefined) {
    try {
      patch.working_hours = parseWorkingHours(body.workingHours);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  }
  if (body.experienceYears !== undefined) {
    const years = Number(body.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) throw new HttpError(400, 'Experience must be between 0 and 60 years');
    patch.experience_years = years;
  }
  if (body.payoutBank !== undefined) {
    const bank = body.payoutBank || {};
    const iban = cleanIban(bank.iban);
    const bankName = String(bank.bankName || '').trim().slice(0, 120);
    const accountHolder = String(bank.accountHolder || '').trim().slice(0, 120);
    if (!bankName || !accountHolder) throw new HttpError(400, 'Bank name and account holder are required');
    if (!IBAN.test(iban)) throw new HttpError(400, 'IBAN must be a valid Saudi IBAN (SA followed by 22 digits)');
    Object.assign(patch, { payout_bank_name: bankName, payout_iban: iban, payout_account_holder: accountHolder });
  }
  return patch;
}

router.patch('/me', async (req, res) => {
  try {
    const patch = profilePatch(req.body, req.user.role);
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
    const { data: user, error } = await supabase.from('users').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', req.user.id).select('*').single();
    if (error) throw error;
    invalidateUser(req.user.id);
    res.json(mapUserToFrontend(user));
  } catch (err) {
    sendError(res, err, 'Failed to update profile');
  }
});

// ─── Push notification devices ───────────────────────────────────────────────
router.post('/me/push-token', async (req, res) => {
  try {
    if (!isValidPushToken(req.body.token)) throw new HttpError(400, 'Invalid push token');
    await registerToken(req.user.id, req.body.token, req.body.platform);
    res.json({ registered: true });
  } catch (err) {
    sendError(res, err, 'Failed to register device');
  }
});

router.delete('/me/push-token', async (req, res) => {
  try {
    if (typeof req.body.token === 'string') await unregisterToken(req.user.id, req.body.token);
    res.json({ registered: false });
  } catch (err) {
    sendError(res, err, 'Failed to unregister device');
  }
});

router.get('/:id/summary', async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('id, name, role, profile_picture').eq('id', req.params.id).maybeSingle();
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ id: user.id, name: user.name, role: user.role, profilePicture: config.toPublicUrl(user.profile_picture) || '' });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'User not found' });
    sendError(res, err, 'Failed to load user');
  }
});

router.patch('/prices', requireRole('provider'), async (req, res) => {
  try {
    const { prices } = req.body;
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new HttpError(400, 'Invalid prices object');
    const clean = {};
    for (const [k, v] of Object.entries(prices)) {
      if (!isServiceCategory(k)) throw new HttpError(400, `Unknown service: ${k}`);
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, `Invalid price for ${k}`);
      clean[k] = n;
    }
    const { data: user, error } = await supabase.from('users').update({ service_prices: clean, updated_at: new Date().toISOString() }).eq('id', req.user.id).select('id, service_prices').single();
    if (error) throw error;
    res.json({ message: 'Service prices updated', servicePrices: user.service_prices });
  } catch (err) {
    sendError(res, err, 'Failed to update prices');
  }
});

router.post('/profile-picture', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) throw new HttpError(400, 'No image uploaded');
    const imageUrl = `/uploads/${req.file.filename}`;
    const { error } = await supabase.from('users').update({ profile_picture: imageUrl, updated_at: new Date().toISOString() }).eq('id', req.user.id);
    if (error) throw error;
    res.json({ message: 'Profile picture updated', profilePicture: imageUrl, profilePictureUrl: config.toPublicUrl(imageUrl) });
  } catch (err) {
    discardUpload(req.file);
    sendError(res, err, 'Failed to update profile picture');
  }
});

module.exports = router;
