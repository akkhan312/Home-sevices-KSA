const supabase = require('../supabase');
const { HttpError, emitToUser, emitToRole, notifyAdmins } = require('./access');
const { addMoney } = require('./money');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const nowIso = () => new Date().toISOString();

/** Ensures a user has a wallet row. */
async function getOrCreateWallet(userId) {
  const { data: existing, error: fetchErr } = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('wallets')
    .insert({ user_id: userId, available_balance: 0, pending_balance: 0, released_balance: 0 })
    .select()
    .single();

  if (error) {
    // Another request created it concurrently.
    if (error.code === '23505') {
      const { data } = await supabase.from('wallets').select('*').eq('user_id', userId).single();
      return data;
    }
    throw error;
  }
  return created;
}

/**
 * Applies balance deltas using optimistic concurrency (the update only succeeds if the balances
 * are unchanged since they were read), retrying on conflict. Returns the updated wallet.
 */
async function adjustWallet(userId, { available = 0, pending = 0, released = 0 }, { requireSufficientFunds = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wallet = await getOrCreateWallet(userId);
    const cur = {
      available: round2(wallet.available_balance || 0),
      pending: round2(wallet.pending_balance || 0),
      released: round2(wallet.released_balance || 0),
    };
    const next = {
      available_balance: addMoney(cur.available, available),
      pending_balance: Math.max(0, addMoney(cur.pending, pending)),
      released_balance: addMoney(cur.released, released),
      updated_at: nowIso(),
    };
    if (requireSufficientFunds && next.available_balance < 0) {
      throw new HttpError(400, 'Insufficient wallet balance for withdrawal');
    }

    const { data, error } = await supabase
      .from('wallets')
      .update(next)
      .eq('id', wallet.id)
      .eq('available_balance', cur.available)
      .eq('pending_balance', cur.pending)
      .eq('released_balance', cur.released)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  throw new HttpError(409, 'Wallet is busy, please try again');
}

async function recordTransaction(wallet, { amount, type, referenceId, status = 'completed', note }) {
  const { error } = await supabase.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    user_id: wallet.user_id,
    amount: round2(amount),
    type,
    reference_id: referenceId,
    status,
    note: note || null,
  });
  if (error) console.warn('wallet_transactions insert failed:', error.message);
}

/** Creates a withdrawal request and reserves the amount from the user's available balance. */
async function requestWithdrawal({ user, amount, bankName, accountName, iban, io }) {
  const value = round2(amount);
  if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, 'Invalid withdrawal amount');
  if (!bankName || !iban) throw new HttpError(400, 'Bank name and IBAN are required');

  const wallet = await adjustWallet(user.id, { available: -value }, { requireSufficientFunds: true });

  const { data: withdrawal, error } = await supabase
    .from('withdrawals')
    .insert({
      provider_id: user.id,
      provider_name: user.name || 'Provider',
      amount: value,
      bank_name: String(bankName).slice(0, 120),
      account_name: String(accountName || user.name || 'Account holder').slice(0, 120),
      account_holder: String(accountName || user.name || 'Account holder').slice(0, 120),
      iban: String(iban).replace(/\s+/g, '').toUpperCase().slice(0, 40),
      account_number: String(iban).replace(/\s+/g, '').toUpperCase().slice(0, 40),
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    // Give the reserved funds back if the request could not be recorded.
    await adjustWallet(user.id, { available: value });
    throw error;
  }

  await recordTransaction(wallet, { amount: value, type: 'withdrawal', referenceId: withdrawal.id, status: 'pending' });
  await notifyAdmins({ title: '💸 New Withdrawal Request', body: `${user.name || 'Provider'} requested a withdrawal of SAR ${value} to ${bankName}.`, type: 'new_withdrawal_request' });

  emitToRole(io, 'admin', 'notification_created', { type: 'new_withdrawal_request', amount: value });
  emitToUser(io, user.id, 'wallet_updated', { userId: user.id, balance: Number(wallet.available_balance) });

  return { withdrawal, newBalance: Number(wallet.available_balance) };
}

/** Admin approves/completes or rejects a withdrawal. Rejection returns the reserved funds. */
async function resolveWithdrawal({ withdrawalId, status, note, adminId, adminName, io }) {
  if (!['approved', 'completed', 'rejected'].includes(status)) throw new HttpError(400, 'Status must be approved, completed or rejected');

  const { data: current, error: fetchErr } = await supabase.from('withdrawals').select('*').eq('id', withdrawalId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new HttpError(404, 'Withdrawal not found');
  if (current.status === 'rejected' || current.status === 'completed') throw new HttpError(400, `Withdrawal is already ${current.status}`);

  const { data: updated, error } = await supabase
    .from('withdrawals')
    .update({ status, admin_notes: note || null, processed_at: nowIso(), updated_at: nowIso() })
    .eq('id', withdrawalId)
    .eq('status', current.status)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, 'Withdrawal was updated by someone else. Please refresh.');

  await supabase.from('wallet_transactions').update({ status: status === 'rejected' ? 'cancelled' : 'completed' }).eq('reference_id', withdrawalId).eq('type', 'withdrawal');

  let balance;
  if (status === 'rejected') {
    const wallet = await adjustWallet(current.provider_id, { available: Number(current.amount) });
    balance = Number(wallet.available_balance);
  }

  await supabase.from('admin_activity_logs').insert({
    admin_id: adminId,
    admin_name: adminName || 'Admin',
    action: `WITHDRAWAL_${status.toUpperCase()}`,
    target_type: 'withdrawal',
    target_id: withdrawalId,
    details: `Withdrawal of SAR ${current.amount} marked ${status}${note ? `: ${note}` : ''}`,
  });
  await supabase.from('notifications').insert({
    user_id: current.provider_id,
    title: status === 'rejected' ? '❌ Withdrawal Rejected' : '✅ Withdrawal Approved',
    body: status === 'rejected'
      ? `Your withdrawal of SAR ${current.amount} was rejected and returned to your wallet.${note ? ` Reason: ${note}` : ''}`
      : `Your withdrawal of SAR ${current.amount} has been ${status}.`,
    type: 'withdrawal_update',
    read: false,
  });

  if (balance !== undefined) emitToUser(io, current.provider_id, 'wallet_updated', { userId: current.provider_id, balance });
  return updated;
}

module.exports = {
  getOrCreateWallet,
  adjustWallet,
  recordTransaction,
  requestWithdrawal,
  resolveWithdrawal,
};
