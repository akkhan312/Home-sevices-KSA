const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const { mapWithdrawalToFrontend } = require('../utils/mappers');
const { getOrCreateWallet, requestWithdrawal } = require('../services/walletService');
const { sendError } = require('../services/access');

// Legacy provider earnings endpoints. Balances come from the same wallet ledger as /api/wallets,
// so a withdrawal made through either endpoint is reflected in both.
router.use(authenticate, requireRole('provider'));

// ─── Provider: Request a withdrawal ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { amount, bankName, accountNumber, accountHolder } = req.body;
    if (!amount || !bankName || !accountNumber || !accountHolder) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const { withdrawal, newBalance } = await requestWithdrawal({
      user: req.user,
      amount,
      bankName,
      accountName: accountHolder,
      iban: accountNumber,
      io: req.app.get('io'),
    });

    res.status(201).json({ withdrawal: mapWithdrawalToFrontend(withdrawal), availableAfter: newBalance });
  } catch (err) {
    sendError(res, err, 'Failed to request withdrawal');
  }
});

// ─── Provider: My withdrawal history + balance ───────────────────────────────
router.get('/my', async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    const { data: withdrawals, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('provider_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const withdrawn = (withdrawals || []).filter((w) => w.status !== 'rejected').reduce((s, w) => s + Number(w.amount), 0);

    res.json({
      totalEarned: Number(wallet.released_balance || 0),
      withdrawn,
      available: Number(wallet.available_balance || 0),
      pending: Number(wallet.pending_balance || 0),
      withdrawals: (withdrawals || []).map(mapWithdrawalToFrontend),
    });
  } catch (err) {
    sendError(res, err, 'Failed to fetch withdrawals');
  }
});

module.exports = router;
