const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate } = require('../middleware/auth');
const { getOrCreateWallet, requestWithdrawal } = require('../services/walletService');
const { providerEarningsSummary } = require('../services/payoutService');
const { requireRole } = require('../middleware/auth');
const { mapWalletToFrontend } = require('../utils/mappers');
const { sendError } = require('../services/access');

router.use(authenticate);

// ─── GET /api/wallets/me ─────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    const [{ data: transactions }, { data: withdrawals }] = await Promise.all([
      supabase.from('wallet_transactions').select('*').eq('wallet_id', wallet.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('withdrawals').select('*').eq('provider_id', req.user.id).order('created_at', { ascending: false }),
    ]);

    res.json({
      wallet: mapWalletToFrontend(wallet),
      transactions: transactions || [],
      withdrawals: withdrawals || [],
    });
  } catch (err) {
    sendError(res, err, 'Failed to fetch wallet information');
  }
});

// ─── GET /api/wallets/earnings — provider earnings, commission & payouts ─────
router.get('/earnings', requireRole('provider'), async (req, res) => {
  try {
    res.json(await providerEarningsSummary(req.user.id));
  } catch (err) {
    sendError(res, err, 'Failed to load earnings');
  }
});

// ─── POST /api/wallets/withdraw ──────────────────────────────────────────────
router.post('/withdraw', async (req, res) => {
  try {
    const { amount, bankName, accountName, iban } = req.body;
    const result = await requestWithdrawal({ user: req.user, amount, bankName, accountName, iban, io: req.app.get('io') });
    res.status(201).json({ message: 'Withdrawal request submitted successfully', ...result });
  } catch (err) {
    sendError(res, err, 'Failed to process withdrawal request');
  }
});

module.exports = router;
