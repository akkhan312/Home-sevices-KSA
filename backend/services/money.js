// Decimal-safe money helpers. All arithmetic happens in integer halalas (1 SAR = 100 halalas).
const CURRENCY = 'SAR';

function toHalalas(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${amount}`);
  // Round via string to avoid binary float drift (e.g. 1.005 * 100).
  return Math.round(Number(`${n.toFixed(4)}e2`));
}

const fromHalalas = (halalas) => halalas / 100;

/** Splits an order amount into platform commission and provider earnings using a percentage rate. */
function splitCommission(amount, ratePercent) {
  const total = toHalalas(amount);
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error(`Invalid commission rate: ${ratePercent}`);
  // rate has at most 2 decimals, so work in basis points to stay in integers.
  const basisPoints = Math.round(rate * 100);
  const commission = Math.round((total * basisPoints) / 10000);
  return {
    amount: fromHalalas(total),
    commissionRate: rate,
    commission: fromHalalas(commission),
    providerEarnings: fromHalalas(total - commission),
  };
}

const addMoney = (...amounts) => fromHalalas(amounts.reduce((s, a) => s + toHalalas(a || 0), 0));

module.exports = { CURRENCY, toHalalas, fromHalalas, splitCommission, addMoney };
