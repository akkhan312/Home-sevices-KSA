const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitCommission, addMoney, toHalalas } = require('../services/money');

test('10% commission on SAR 500 → platform 50, provider 450', () => {
  assert.deepEqual(splitCommission(500, 10), { amount: 500, commissionRate: 10, commission: 50, providerEarnings: 450 });
});

test('commission is computed in halalas without float drift', () => {
  const r = splitCommission(199.99, 12.5);
  assert.equal(r.commission, 25);
  assert.equal(r.providerEarnings, 174.99);
  assert.equal(addMoney(r.commission, r.providerEarnings), 199.99);
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(toHalalas(1.005), 101);
});

test('invalid commission rates are rejected', () => {
  assert.throws(() => splitCommission(100, -1));
  assert.throws(() => splitCommission(100, 101));
  assert.throws(() => splitCommission('abc', 10));
});
