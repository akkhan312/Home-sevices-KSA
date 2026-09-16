const supabase = require('../supabase');
const { HttpError } = require('./access');

const DEFAULT_COMMISSION_PERCENT = Number(process.env.DEFAULT_COMMISSION_PERCENT || 10);
const PAYMENT_FIELDS = ['bankName', 'accountName', 'iban', 'accountNumber', 'instructions', 'referencePrefix'];

async function getSetting(key) {
  const { data, error } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value || null;
}

async function putSetting(key, value, adminId) {
  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_by: adminId || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

/** Bank-transfer details shown to customers. Only customer-safe fields are stored here. */
async function getPaymentSettings() {
  const stored = (await getSetting('payment')) || {};
  return {
    bankName: stored.bankName || '',
    accountName: stored.accountName || '',
    iban: stored.iban || '',
    accountNumber: stored.accountNumber || '',
    instructions: stored.instructions || '',
    referencePrefix: stored.referencePrefix || 'BP',
    configured: Boolean(stored.bankName && stored.iban && stored.accountName),
  };
}

async function updatePaymentSettings(input, adminId) {
  const value = {};
  for (const field of PAYMENT_FIELDS) {
    if (input[field] !== undefined) value[field] = String(input[field]).trim().slice(0, field === 'instructions' ? 2000 : 120);
  }
  if (value.iban) value.iban = value.iban.replace(/\s+/g, '').toUpperCase();
  if (value.referencePrefix && !/^[A-Z0-9]{1,6}$/.test(value.referencePrefix.toUpperCase())) {
    throw new HttpError(400, 'Reference prefix must be 1-6 letters or digits');
  }
  if (value.referencePrefix) value.referencePrefix = value.referencePrefix.toUpperCase();

  const current = await getPaymentSettings();
  const merged = { ...current, ...value };
  delete merged.configured;
  if (!merged.bankName || !merged.accountName || !merged.iban) {
    throw new HttpError(400, 'Bank name, account name and IBAN are required');
  }
  if (!/^SA\d{22}$/.test(merged.iban)) throw new HttpError(400, 'IBAN must be a valid Saudi IBAN (SA followed by 22 digits)');

  await putSetting('payment', merged, adminId);
  return getPaymentSettings();
}

async function getCommissionSettings() {
  const stored = (await getSetting('commission')) || {};
  const { data: rules, error } = await supabase.from('commission_rules').select('category, percent').order('category', { ascending: true });
  if (error) throw error;
  return {
    defaultPercent: stored.defaultPercent !== undefined ? Number(stored.defaultPercent) : DEFAULT_COMMISSION_PERCENT,
    rules: (rules || []).map((r) => ({ category: r.category, percent: Number(r.percent) })),
  };
}

const validPercent = (p) => Number.isFinite(Number(p)) && Number(p) >= 0 && Number(p) <= 50;

async function updateCommissionSettings({ defaultPercent, rules }, adminId) {
  if (defaultPercent !== undefined) {
    if (!validPercent(defaultPercent)) throw new HttpError(400, 'Default commission must be between 0 and 50%');
    await putSetting('commission', { defaultPercent: Math.round(Number(defaultPercent) * 100) / 100 }, adminId);
  }
  if (Array.isArray(rules)) {
    const clean = [];
    for (const r of rules) {
      const category = String(r.category || '').trim().toLowerCase().slice(0, 50);
      if (!category) throw new HttpError(400, 'Every commission rule needs a category');
      if (!validPercent(r.percent)) throw new HttpError(400, `Commission for ${category} must be between 0 and 50%`);
      clean.push({ category, percent: Math.round(Number(r.percent) * 100) / 100, updated_at: new Date().toISOString() });
    }
    // Replace the rule set: delete categories that were removed, upsert the rest.
    const { data: existing } = await supabase.from('commission_rules').select('category');
    const keep = new Set(clean.map((r) => r.category));
    const removed = (existing || []).map((r) => r.category).filter((c) => !keep.has(c));
    if (removed.length) await supabase.from('commission_rules').delete().in('category', removed);
    if (clean.length) {
      const { error } = await supabase.from('commission_rules').upsert(clean, { onConflict: 'category' });
      if (error) throw error;
    }
  }
  return getCommissionSettings();
}

/** Commission percentage for a service category (category rule, else the global default). */
async function getCommissionRate(category) {
  const settings = await getCommissionSettings();
  const rule = settings.rules.find((r) => r.category === String(category || '').toLowerCase());
  return rule ? rule.percent : settings.defaultPercent;
}

module.exports = {
  getPaymentSettings,
  updatePaymentSettings,
  getCommissionSettings,
  updateCommissionSettings,
  getCommissionRate,
};
