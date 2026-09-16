const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const supabase = require('../supabase');
const { mapUserToFrontend } = require('../utils/mappers');
const { JWT_SECRET, isProduction } = require('../config');
const { signSessionToken } = require('../middleware/auth');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL = '15m';
const MIN_PASSWORD_LENGTH = 6;
const SELF_SIGNUP_ROLES = ['customer', 'provider'];

// In-memory OTP store (key: account email). Use a shared store such as Redis if you run more than one instance.
const otps = new Map();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many code requests. Please try again later.' } });

// ─── Email transport ─────────────────────────────────────────────────────────
let transporter = null;

async function setupTransporter() {
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
    });
  } else if (!isProduction && process.env.NODE_ENV !== 'test') {
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      console.log('✉️  Using Ethereal test inbox for emails (development only)');
    } catch (err) {
      console.warn('✉️  Could not create Ethereal test account:', err.message);
    }
  } else {
    console.warn('⚠️  No email transport configured (SMTP_* or GMAIL_*). Password reset emails will not be delivered.');
  }
}
setupTransporter();

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendMail(to, subject, text, html) {
  if (!transporter) return false;
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || `"ServeHome" <${process.env.SMTP_USER || process.env.GMAIL_USER || 'no-reply@servehome.app'}>`,
      to, subject, text, html,
    });
    if (!isProduction && nodemailer.getTestMessageUrl(info)) {
      console.log(`📧 Preview email to ${to}: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    return false;
  }
}

const normalizeEmail = (e) => String(e || '').toLowerCase().trim();
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ─── SIGNUP ──────────────────────────────────────────────────────────────────
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { password, name, phone, iqamaNumber, city, serviceCategories } = req.body;
    const email = normalizeEmail(req.body.email);
    // Admin accounts can never be self-registered; they are created with `npm run seed`.
    const role = SELF_SIGNUP_ROLES.includes(req.body.role) ? req.body.role : 'customer';

    if (!email || !password || !name || !phone) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email address' });
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (role === 'provider' && !iqamaNumber) {
      return res.status(400).json({ error: 'Iqama number is required for providers' });
    }

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const insert = {
      email,
      password: hashedPassword,
      name: String(name).trim(),
      phone: String(phone).trim(),
      role,
      iqama_number: role === 'provider' ? String(iqamaNumber).trim() : null,
    };
    if (role === 'provider') {
      // New providers must be approved by an admin before they receive requests (set REQUIRE_PROVIDER_APPROVAL=false to skip).
      insert.approval_status = process.env.REQUIRE_PROVIDER_APPROVAL === 'false' ? 'APPROVED' : 'PENDING';
      if (city) insert.city = String(city);
      if (Array.isArray(serviceCategories)) insert.service_categories = serviceCategories.map(String);
    }

    const { data: user, error } = await supabase.from('users').insert(insert).select().single();
    if (error) throw error;

    sendMail(
      email,
      'Welcome to ServeHome! 🎉',
      `Hi ${user.name},\n\nWelcome to ServeHome! Your account has been created successfully.`,
      `<h3>Welcome to ServeHome, ${escapeHtml(user.name)}! 🎉</h3><p>Your account has been created successfully.</p>`
    );

    res.json({ token: signSessionToken(user), user: mapUserToFrontend(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Please provide email and password' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    res.json({ token: signSessionToken(user), user: mapUserToFrontend(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SEND OTP ────────────────────────────────────────────────────────────────
router.post('/send-otp', otpLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email address' });

    const { data: user } = await supabase.from('users').select('id, name, email').eq('email', email).maybeSingle();

    // Same response whether or not the account exists, so emails cannot be enumerated.
    const genericResponse = { success: true, message: 'If an account exists for this email, a verification code has been sent.' };
    if (!user) return res.json(genericResponse);

    const code = crypto.randomInt(1000, 10000).toString();
    otps.set(email, { code, expires: Date.now() + OTP_TTL_MS, attempts: 0 });

    if (!isProduction) console.log(`🔑 [DEV] OTP for ${email}: ${code}`);

    await sendMail(
      email,
      'Your ServeHome verification code',
      `Hi ${user.name},\n\nYour verification code is: ${code}. It is valid for 10 minutes.\nIf you did not request this, you can ignore this email.`,
      `<h3>🔐 Verification Code</h3><p>Hi <b>${escapeHtml(user.name)}</b>,</p><p>Your verification code is: <b style="font-size: 26px; color: #2E8B57;">${code}</b></p><p>Valid for 10 minutes. If you did not request this, you can ignore this email.</p>`
    );

    res.json(genericResponse);
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────
// Returns a short-lived reset token that must be presented to /reset-password.
router.post('/verify-otp', authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const stored = otps.get(email);

    if (!stored || Date.now() > stored.expires) {
      otps.delete(email);
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    stored.attempts += 1;
    const matches = stored.code.length === code.length && crypto.timingSafeEqual(Buffer.from(stored.code), Buffer.from(code));
    if (!matches) {
      if (stored.attempts >= OTP_MAX_ATTEMPTS) otps.delete(email);
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    otps.delete(email);
    const resetToken = jwt.sign({ email, purpose: 'password_reset' }, JWT_SECRET, { expiresIn: RESET_TOKEN_TTL });
    res.json({ success: true, verified: true, resetToken });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── RESET PASSWORD ──────────────────────────────────────────────────────────
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { resetToken, password } = req.body;
    if (!resetToken || !password) return res.status(400).json({ error: 'Verification is required before resetting your password' });
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    let payload;
    try {
      payload = jwt.verify(resetToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Reset session expired. Please verify your email again.' });
    }
    if (payload.purpose !== 'password_reset' || !payload.email) {
      return res.status(400).json({ error: 'Invalid reset session' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword, updated_at: new Date().toISOString() })
      .eq('email', payload.email);
    if (error) throw error;

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
