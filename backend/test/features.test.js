const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./support/harness');
const push = require('../services/pushService');
const storage = require('../services/storage');
const { matchesProvider, parseWorkingHours, withinWorkingHours } = require('../services/matching');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventually(check, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await wait(20);
  }
  return check();
}

/** Next date (YYYY-MM-DD) after 2026-11-01 that falls on the given weekday (0 = Sunday). */
function nextWeekday(day) {
  const d = new Date('2026-11-01T00:00:00Z');
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('Provider matching rules', () => {
  const booking = { category: 'ac', city: 'Jeddah', scheduled_date: nextWeekday(2), scheduled_time: '10:00' };

  it('filters on availability, service, city or service area, and working hours', () => {
    assert.equal(matchesProvider(booking, { service_categories: ['ac'], city: 'Jeddah' }), true);
    assert.equal(matchesProvider(booking, { service_categories: ['ac'], city: 'Jeddah', is_available: false }), false, 'paused providers get no requests');
    assert.equal(matchesProvider(booking, { service_categories: ['plumbing'], city: 'Jeddah' }), false);
    assert.equal(matchesProvider(booking, { service_categories: ['ac'], city: 'Riyadh' }), false);
    assert.equal(matchesProvider(booking, { service_categories: ['ac'], city: 'Riyadh', service_areas: ['jeddah'] }), true, 'service areas extend coverage');
    assert.equal(matchesProvider(booking, { service_categories: [], city: null }), true, 'unconfigured providers see everything');

    const weekdays = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' };
    assert.equal(matchesProvider(booking, { service_categories: ['ac'], working_hours: weekdays }), true);
    assert.equal(matchesProvider({ ...booking, scheduled_time: '18:30' }, { working_hours: weekdays }), false, 'outside working hours');
    assert.equal(matchesProvider({ ...booking, scheduled_date: nextWeekday(6) }, { working_hours: weekdays }), false, 'not a working day');
    assert.equal(withinWorkingHours(weekdays, null, null), true, 'requests without a time are not filtered');
  });

  it('validates working hours', () => {
    assert.deepEqual(parseWorkingHours({ days: [5, 1, 1], start: '09:00', end: '18:00' }), { days: [1, 5], start: '09:00', end: '18:00' });
    assert.equal(parseWorkingHours(null), null);
    assert.throws(() => parseWorkingHours({ days: [], start: '09:00', end: '18:00' }), /at least one working day/);
    assert.throws(() => parseWorkingHours({ days: [1], start: '18:00', end: '09:00' }), /end after/);
    assert.throws(() => parseWorkingHours({ days: [1], start: '9am', end: '18:00' }), /HH:MM/);
  });
});

describe('Supabase Storage driver', () => {
  it('round-trips files through a bucket using public/ and private/ prefixes', async () => {
    const objects = new Map();
    const client = {
      storage: {
        from: (bucket) => ({
          upload: async (key, buffer) => (objects.has(`${bucket}:${key}`) ? { error: { message: 'exists' } } : (objects.set(`${bucket}:${key}`, buffer), { error: null })),
          download: async (key) => {
            const buf = objects.get(`${bucket}:${key}`);
            return buf ? { data: new Blob([buf]), error: null } : { data: null, error: { message: 'not found' } };
          },
          remove: async (keys) => (keys.forEach((k) => objects.delete(`${bucket}:${k}`)), { error: null }),
        }),
      },
    };
    const driver = storage.createSupabaseDriver(client, 'uploads');
    await driver.save('private', 'receipt_1.png', Buffer.from('hello'), 'image/png');
    assert.ok(objects.has('uploads:private/receipt_1.png'));
    const stream = await driver.open('private', 'receipt_1.png');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'hello');
    assert.equal(await driver.open('public', 'receipt_1.png'), null, 'public and private files are separate');
    await driver.remove('private', 'receipt_1.png');
    assert.equal(await driver.open('private', 'receipt_1.png'), null);
  });
});

describe('Completed features: profiles, availability, cancellation, photos, push, tracking, disputes', () => {
  let t;
  let admin, customer, otherCustomer, provider, otherProvider, jeddahProvider, pausedProvider;
  const pushed = [];

  before(async () => {
    t = await start();
    push.setEnabled(true);
    push.setTransport(async (messages) => {
      pushed.push(...messages);
      return messages.map((m) => (m.to.includes('stale') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'ticket' }));
    });

    admin = t.createUser({ email: 'admin@f.sa', name: 'Admin', role: 'admin' });
    customer = t.createUser({ email: 'c1@f.sa', name: 'Noura', role: 'customer' });
    otherCustomer = t.createUser({ email: 'c2@f.sa', name: 'Faisal', role: 'customer' });
    provider = t.createUser({ email: 'p1@f.sa', name: 'Khalid', role: 'provider', service_categories: ['plumbing'], city: 'Riyadh', iqama_number: '2400000001' });
    otherProvider = t.createUser({ email: 'p2@f.sa', name: 'Yousef', role: 'provider', service_categories: ['plumbing'], city: 'Riyadh' });
    jeddahProvider = t.createUser({ email: 'p3@f.sa', name: 'Hassan', role: 'provider', service_categories: ['plumbing'], city: 'Jeddah', service_areas: ['Riyadh'] });
    pausedProvider = t.createUser({ email: 'p4@f.sa', name: 'Paused', role: 'provider', service_categories: ['plumbing'], city: 'Riyadh', is_available: false });

    await t.api('PUT', '/api/admin/settings/payment', { token: admin.token, body: { bankName: 'Al Rajhi Bank', accountName: 'ServeHome LLC', iban: 'SA0380000000608010167519' } });
    await t.api('PUT', '/api/admin/settings/commission', { token: admin.token, body: { defaultPercent: 10, rules: [] } });
  });

  after(async () => {
    push.setEnabled(null);
    await t.stop();
  });

  const createRequest = (token, extra = {}) =>
    t.api('POST', '/api/bookings', {
      token,
      body: { category: 'plumbing', categoryName: 'Plumbing', price: 200, scheduledDate: nextWeekday(3), scheduledTime: '11:00', address: 'Villa 7, King Fahd Rd', city: 'Riyadh', area: 'Al Malqa', latitude: 24.8, longitude: 46.6, ...extra },
    });

  /** Takes a new request all the way to a paid, unlocked order with `provider`. */
  async function paidOrder(cust = customer, prov = provider) {
    const created = await createRequest(cust.token);
    const id = created.body._id;
    const offer = await t.api('POST', `/api/bookings/${id}/offers`, { token: prov.token, body: { price: 200 } });
    await t.api('POST', `/api/bookings/${id}/accept-offer`, { token: cust.token, body: { offerId: offer.body.id } });
    await t.api('POST', `/api/bookings/${id}/payment-proof`, { token: cust.token, form: t.receiptForm({ transactionNumber: `TX-${id.slice(0, 6)}` }) });
    const approved = await t.api('POST', `/api/admin/payments/${id}/approve`, { token: admin.token });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    return id;
  }

  it('profile editing: customers update contact details, providers manage services, areas, hours and payout account', async () => {
    const cust = await t.api('PATCH', '/api/users/me', { token: customer.token, body: { name: 'Noura Al-Qahtani', phone: '0551234567', city: 'riyadh', serviceAreas: ['Jeddah'] } });
    assert.equal(cust.status, 200, JSON.stringify(cust.body));
    assert.equal(cust.body.name, 'Noura Al-Qahtani');
    assert.equal(cust.body.city, 'Riyadh', 'known cities are normalised');
    assert.deepEqual(cust.body.serviceAreas, [], 'provider-only fields are ignored for customers');
    assert.equal(cust.body.payoutBank, null);

    const bad = await t.api('PATCH', '/api/users/me', { token: provider.token, body: { payoutBank: { bankName: 'SNB', accountHolder: 'Khalid', iban: 'DE89370400440532013000' } } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /Saudi IBAN/);
    assert.equal((await t.api('PATCH', '/api/users/me', { token: provider.token, body: { serviceCategories: ['plumbing', 'teleport'] } })).status, 400);
    assert.equal((await t.api('PATCH', '/api/users/me', { token: provider.token, body: { workingHours: { days: [], start: '08:00', end: '17:00' } } })).status, 400);
    assert.equal((await t.api('PATCH', '/api/users/me', { token: provider.token, body: {} })).status, 400);

    const res = await t.api('PATCH', '/api/users/me', {
      token: provider.token,
      body: {
        serviceCategories: ['plumbing', 'ac'],
        serviceAreas: ['Diriyah', 'riyadh'],
        experienceYears: 7,
        bio: 'Licensed plumber',
        workingHours: { days: [0, 1, 2, 3, 4], start: '08:00', end: '20:00' },
        payoutBank: { bankName: 'Saudi National Bank', accountHolder: 'Khalid Saleh', iban: 'SA44 2000 0001 2345 6789 1234' },
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.serviceCategories, ['plumbing', 'ac']);
    assert.deepEqual(res.body.serviceAreas, ['Diriyah', 'Riyadh']);
    assert.equal(res.body.experienceYears, 7);
    assert.deepEqual(res.body.workingHours, { days: [0, 1, 2, 3, 4], start: '08:00', end: '20:00' });
    assert.deepEqual(res.body.payoutBank, { bankName: 'Saudi National Bank', iban: 'SA4420000001234567891234', accountHolder: 'Khalid Saleh' });
    assert.equal(res.body.verified, true);

    const me = await t.api('GET', '/api/users/me', { token: provider.token });
    assert.equal(me.body.payoutBank.iban, 'SA4420000001234567891234');
  });

  it('provider signup keeps the payout IBAN; invalid IBANs are rejected', async () => {
    const bad = await t.api('POST', '/api/auth/signup', { body: { email: 'np1@f.sa', password: 'secret123', name: 'New P', phone: '0500000001', role: 'provider', iqamaNumber: '2412345678', iban: 'SA12' } });
    assert.equal(bad.status, 400);
    const ok = await t.api('POST', '/api/auth/signup', {
      body: { email: 'np2@f.sa', password: 'secret123', name: 'New P', phone: '0500000002', role: 'provider', iqamaNumber: '2412345679', city: 'jeddah', serviceCategories: ['ac', 'bogus'], iban: 'sa03 8000 0000 6080 1016 7519' },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.payoutBank.iban, 'SA0380000000608010167519');
    assert.equal(ok.body.user.city, 'Jeddah');
    assert.deepEqual(ok.body.user.serviceCategories, ['ac']);
  });

  it('requests reach available providers in the city or its service areas; unknown services are rejected', async () => {
    const unknown = await createRequest(customer.token, { category: 'teleport' });
    assert.equal(unknown.status, 400);
    const badTime = await createRequest(customer.token, { scheduledTime: '25:99' });
    assert.equal(badTime.status, 400);

    const created = await createRequest(customer.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body._id;

    const sees = async (user) => (await t.api('GET', '/api/bookings/provider', { token: user.token })).body.some((b) => b._id === id);
    assert.equal(await sees(provider), true);
    assert.equal(await sees(jeddahProvider), true, 'Jeddah provider serves Riyadh as a service area');
    assert.equal(await sees(pausedProvider), false, 'paused provider does not see new requests');

    const notified = t.fake.rows('notifications').filter((n) => n.type === 'new_request' && n.data.bookingId === id).map((n) => n.user_id);
    assert.ok(notified.includes(jeddahProvider.id));
    assert.ok(!notified.includes(pausedProvider.id));

    const search = await t.api('GET', '/api/providers?city=riyadh&category=plumbing');
    assert.ok(search.body.some((p) => p.id === jeddahProvider.id), 'provider search includes service areas');
  });

  it('providers cannot assign themselves: a provider is only selected by the customer', async () => {
    const created = await createRequest(customer.token);
    const res = await t.api('PATCH', `/api/bookings/${created.body._id}/status`, { token: provider.token, body: { status: 'accepted' } });
    assert.equal(res.status, 400);
    const view = await t.api('GET', `/api/bookings/${created.body._id}`, { token: customer.token });
    assert.equal(view.body.providerId, null);
  });

  it('providers can hide a request ("not interested") and withdraw a proposal', async () => {
    const created = await createRequest(customer.token);
    const id = created.body._id;
    await t.api('POST', `/api/bookings/${id}/offers`, { token: provider.token, body: { price: 220 } });
    await t.api('POST', `/api/bookings/${id}/offers`, { token: otherProvider.token, body: { price: 210 } });

    const customerSocket = await t.connect(customer.token);
    const withdrawnEvent = t.waitFor(customerSocket, 'proposal:withdrawn', 1500);
    const dismiss = await t.api('POST', `/api/bookings/${id}/dismiss`, { token: otherProvider.token });
    assert.equal(dismiss.status, 200);
    assert.equal((await withdrawnEvent).providerId, otherProvider.id);
    const feed = await t.api('GET', '/api/bookings/provider', { token: otherProvider.token });
    assert.ok(!feed.body.some((b) => b._id === id), 'dismissed request is hidden');
    const offers = await t.api('GET', `/api/bookings/${id}/offers`, { token: customer.token });
    assert.deepEqual(offers.body.map((o) => o.providerId), [provider.id], 'their proposal was withdrawn');

    const quoted = (await t.api('GET', '/api/bookings/provider', { token: provider.token })).body.find((b) => b._id === id);
    assert.equal(quoted.myOffer.price, 220, 'the feed shows the provider their own proposal');

    const withdraw = await t.api('DELETE', `/api/bookings/${id}/offers/mine`, { token: provider.token });
    assert.equal(withdraw.status, 200);
    assert.equal((await t.api('GET', `/api/bookings/${id}`, { token: customer.token })).body.stage, 'REQUESTED', 'back to waiting when no proposals are left');
    assert.equal((await t.api('DELETE', `/api/bookings/${id}/offers/mine`, { token: provider.token })).status, 404);

    await t.api('POST', `/api/bookings/${id}/offers`, { token: otherProvider.token, body: { price: 205 } });
    const again = await t.api('GET', '/api/bookings/provider', { token: otherProvider.token });
    assert.ok(again.body.some((b) => b._id === id), 'quoting again un-hides the request');
  });

  it('customers cancel open requests and unpaid orders, never paid ones or ones being verified', async () => {
    const open = await createRequest(customer.token);
    await t.api('POST', `/api/bookings/${open.body._id}/offers`, { token: provider.token, body: { price: 200 } });
    assert.equal((await t.api('POST', `/api/bookings/${open.body._id}/cancel`, { token: otherCustomer.token })).status, 403);
    assert.equal((await t.api('POST', `/api/bookings/${open.body._id}/cancel`, { token: provider.token })).status, 403);

    const cancelled = await t.api('POST', `/api/bookings/${open.body._id}/cancel`, { token: customer.token, body: { reason: 'Fixed it myself' } });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.stage, 'CANCELLED');
    assert.equal(cancelled.body.cancellationReason, 'Fixed it myself');
    assert.ok(t.fake.rows('notifications').some((n) => n.user_id === provider.id && n.type === 'request_cancelled'), 'bidders are told');
    assert.equal((await t.api('POST', `/api/bookings/${open.body._id}/offers`, { token: provider.token, body: { price: 150 } })).status, 400, 'no proposals on a cancelled request');
    assert.equal((await t.api('POST', `/api/bookings/${open.body._id}/cancel`, { token: customer.token })).status, 409);

    const pending = await createRequest(customer.token);
    const offer = await t.api('POST', `/api/bookings/${pending.body._id}/offers`, { token: provider.token, body: { price: 200 } });
    await t.api('POST', `/api/bookings/${pending.body._id}/accept-offer`, { token: customer.token, body: { offerId: offer.body.id } });
    await t.api('POST', `/api/bookings/${pending.body._id}/payment-proof`, { token: customer.token, form: t.receiptForm({ transactionNumber: 'TX-CANCEL' }) });
    const underReview = await t.api('POST', `/api/bookings/${pending.body._id}/cancel`, { token: customer.token });
    assert.equal(underReview.status, 409);
    assert.equal(underReview.body.code, 'PAYMENT_UNDER_REVIEW');

    const paidId = await paidOrder();
    const paid = await t.api('POST', `/api/bookings/${paidId}/cancel`, { token: customer.token });
    assert.equal(paid.status, 400);
    assert.equal(paid.body.code, 'PAID_ORDER');

    const unpaid = await createRequest(customer.token);
    const o2 = await t.api('POST', `/api/bookings/${unpaid.body._id}/offers`, { token: provider.token, body: { price: 180 } });
    await t.api('POST', `/api/bookings/${unpaid.body._id}/accept-offer`, { token: customer.token, body: { offerId: o2.body.id } });
    const unpaidCancel = await t.api('POST', `/api/bookings/${unpaid.body._id}/cancel`, { token: customer.token });
    assert.equal(unpaidCancel.status, 200, 'selected but unpaid orders can be cancelled');
    assert.equal((await t.api('POST', `/api/admin/payments/${unpaid.body._id}/approve`, { token: admin.token })).status, 400, 'a cancelled order cannot be paid');
  });

  it('request photos: up to four, visible to quoting providers through signed URLs, removable', async () => {
    const created = await createRequest(customer.token);
    const id = created.body._id;
    for (let i = 0; i < 4; i++) {
      const up = await t.api('POST', `/api/bookings/${id}/photos`, { token: customer.token, form: t.receiptForm() });
      assert.equal(up.status, 201, JSON.stringify(up.body));
    }
    const fifth = await t.api('POST', `/api/bookings/${id}/photos`, { token: customer.token, form: t.receiptForm() });
    assert.equal(fifth.status, 400);
    assert.equal((await t.api('POST', `/api/bookings/${id}/photos`, { token: otherCustomer.token, form: t.receiptForm() })).status, 403);
    assert.equal((await t.api('POST', `/api/bookings/${id}/photos`, { token: customer.token, form: t.receiptForm({}, { type: 'application/pdf', name: 'x.pdf' }) })).status, 400, 'photos must be images');

    const seen = await t.api('GET', `/api/bookings/${id}`, { token: provider.token });
    assert.equal(seen.body.photos.length, 4);
    const url = new URL(seen.body.photos[0].url);
    assert.equal((await fetch(`${t.base}${url.pathname}${url.search}`)).status, 200);
    assert.equal((await fetch(`${t.base}${url.pathname}`)).status, 403, 'unsigned photo links are refused');

    const removed = await t.api('DELETE', `/api/bookings/${id}/photos/${seen.body.photos[0].name}`, { token: customer.token });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.photos.length, 3);
    assert.equal((await fetch(`${t.base}${url.pathname}${url.search}`)).status, 404, 'removed photos are deleted');
    assert.equal((await t.api('DELETE', `/api/bookings/${id}/photos/unknown.png`, { token: customer.token })).status, 404);

    const paidId = await paidOrder();
    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS']) await t.api('PATCH', `/api/bookings/${paidId}/status`, { token: provider.token, body: { status } });
    assert.equal((await t.api('POST', `/api/bookings/${paidId}/photos`, { token: customer.token, form: t.receiptForm() })).status, 400, 'no new photos once work started');
  });

  it('order broadcasts never leak the exact address to providers who only viewed the request', async () => {
    const created = await createRequest(customer.token);
    const id = created.body._id;
    const watcher = await t.connect(otherProvider.token);
    watcher.emit('join_room', id);
    await wait(100);

    const offer = await t.api('POST', `/api/bookings/${id}/offers`, { token: provider.token, body: { price: 200 } });
    const update = t.waitFor(watcher, 'booking_updated', 1500);
    await t.api('POST', `/api/bookings/${id}/accept-offer`, { token: customer.token, body: { offerId: offer.body.id } });
    const payload = await update;
    assert.ok(payload, 'room members still learn that the order changed');
    assert.equal(payload.address, 'Al Malqa');
    assert.equal(payload.latitude, null);
    assert.equal(payload.customerPhone, '');
  });

  it('live tracking: the customer gets the provider’s last position on demand; outsiders do not', async () => {
    const id = await paidOrder();
    await t.api('PATCH', `/api/bookings/${id}/status`, { token: provider.token, body: { status: 'ON_THE_WAY' } });
    const providerSocket = await t.connect(provider.token);
    const customerSocket = await t.connect(customer.token);
    const live = t.waitFor(customerSocket, 'location:update', 1500);
    providerSocket.emit('update_live_location', { bookingId: id, latitude: 24.75, longitude: 46.65, heading: 90 });
    assert.equal((await live).latitude, 24.75);

    const last = await new Promise((resolve) => customerSocket.emit('location:get', { bookingId: id }, resolve));
    assert.equal(last.latitude, 24.75);
    assert.equal(last.heading, 90);

    const outsider = await t.connect(otherCustomer.token);
    const denied = await new Promise((resolve) => outsider.emit('location:get', { bookingId: id }, resolve));
    assert.equal(denied, null);

    for (const status of ['ARRIVED', 'IN_PROGRESS', 'WAITING_CUSTOMER_CONFIRMATION']) await t.api('PATCH', `/api/bookings/${id}/status`, { token: provider.token, body: { status } });
    const after = await new Promise((resolve) => customerSocket.emit('location:get', { bookingId: id }, resolve));
    assert.equal(after, null, 'position is forgotten when the service is completed');
  });

  it('push notifications: devices register, notifications are pushed with the order id, dead tokens are removed', async () => {
    assert.equal((await t.api('POST', '/api/users/me/push-token', { token: customer.token, body: { token: 'not-a-token' } })).status, 400);
    for (const token of ['ExponentPushToken[customer-phone-1]', 'ExponentPushToken[customer-tablet-2]', 'ExponentPushToken[customer-stale-3]']) {
      assert.equal((await t.api('POST', '/api/users/me/push-token', { token: customer.token, body: { token, platform: 'android' } })).status, 200);
    }
    assert.equal(t.fake.rows('user_push_tokens').filter((r) => r.user_id === customer.id).length, 3, 'several devices per user');
    // Legacy endpoint shares the same rules.
    assert.equal((await t.api('POST', '/api/chat/push-token', { token: provider.token, body: { token: 'ExponentPushToken[provider-phone-1]' } })).status, 200);

    pushed.length = 0;
    const created = await createRequest(customer.token);
    await t.api('POST', `/api/bookings/${created.body._id}/offers`, { token: provider.token, body: { price: 200 } });
    const proposalPush = await eventually(() => {
      const messages = pushed.filter((m) => m.data.type === 'new_proposal');
      return messages.length ? messages : null;
    });
    assert.equal(proposalPush.length, 3, 'pushed to every customer device');
    assert.equal(proposalPush[0].data.bookingId, created.body._id);
    assert.ok(pushed.some((m) => m.to === 'ExponentPushToken[provider-phone-1]' && m.data.type === 'new_request'), 'matching providers get new requests');
    await eventually(() => !t.fake.rows('user_push_tokens').some((r) => r.expo_push_token.includes('stale')));
    assert.ok(!t.fake.rows('user_push_tokens').some((r) => r.expo_push_token.includes('stale')), 'unregistered devices are cleaned up');

    // A device that signs in to another account moves to that account.
    await t.api('POST', '/api/users/me/push-token', { token: otherCustomer.token, body: { token: 'ExponentPushToken[customer-phone-1]' } });
    assert.equal(t.fake.rows('user_push_tokens').find((r) => r.expo_push_token === 'ExponentPushToken[customer-phone-1]').user_id, otherCustomer.id);
    await t.api('DELETE', '/api/users/me/push-token', { token: customer.token, body: { token: 'ExponentPushToken[customer-tablet-2]' } });
    assert.equal(t.fake.rows('user_push_tokens').filter((r) => r.user_id === customer.id).length, 0);
  });

  it('admins see where to pay providers, list disputes and resolve them (release or refund)', async () => {
    const id = await paidOrder();
    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING_CUSTOMER_CONFIRMATION']) await t.api('PATCH', `/api/bookings/${id}/status`, { token: provider.token, body: { status } });
    await t.api('POST', `/api/bookings/${id}/report-issue`, { token: customer.token, body: { reason: 'Leak is back', description: 'Water under the sink again' } });

    const disputes = await t.api('GET', '/api/admin/bookings/disputed', { token: admin.token });
    assert.equal(disputes.status, 200);
    const dispute = disputes.body.find((d) => d._id === id);
    assert.equal(dispute.report.reason, 'Leak is back');
    assert.equal((await t.api('GET', '/api/admin/bookings/disputed', { token: customer.token })).status, 403);

    const release = await t.api('POST', `/api/admin/bookings/${id}/resolve-dispute`, { token: admin.token, body: { resolution: 'release', note: 'Photos show the repair' } });
    assert.equal(release.status, 200, JSON.stringify(release.body));
    assert.ok(t.fake.rows('notifications').some((n) => n.user_id === customer.id && n.type === 'dispute_resolved'));
    assert.ok(t.fake.rows('reports').filter((r) => r.booking_id === id).every((r) => r.status === 'resolved'));

    const payouts = await t.api('GET', '/api/admin/payouts', { token: admin.token });
    const payout = payouts.body.find((p) => p.bookingId === id);
    assert.deepEqual(payout.providerBank, { bankName: 'Saudi National Bank', iban: 'SA4420000001234567891234', accountHolder: 'Khalid Saleh' });

    const refundCase = await paidOrder(otherCustomer, provider);
    await t.api('POST', `/api/bookings/${refundCase}/report-issue`, { token: otherCustomer.token, body: { reason: 'No show' } });
    const refund = await t.api('POST', `/api/admin/bookings/${refundCase}/resolve-dispute`, { token: admin.token, body: { resolution: 'refund' } });
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal((await t.api('GET', `/api/bookings/${refundCase}`, { token: otherCustomer.token })).body.paymentStatus, 'REFUNDED');
  });

  it('analytics only counts money actually received', async () => {
    const res = await t.api('GET', '/api/admin/analytics', { token: admin.token });
    assert.equal(res.status, 200);
    const paid = t.fake.rows('bookings').filter((b) => b.payment_status === 'PAID');
    const expected = paid.reduce((s, b) => s + Number(b.price), 0);
    assert.equal(res.body.summary.totalRevenue, expected);
    assert.equal(res.body.summary.platformFeeTotal, paid.reduce((s, b) => s + Number(b.commission), 0));
  });

  it('files work with any storage driver (served through the API)', async () => {
    const saved = new Map();
    const memory = {
      name: 'memory',
      save: async (v, n, buf) => saved.set(`${v}/${n}`, buf),
      open: async (v, n) => (saved.has(`${v}/${n}`) ? require('stream').Readable.from([saved.get(`${v}/${n}`)]) : null),
      remove: async (v, n) => saved.delete(`${v}/${n}`),
    };
    storage.setDriver(memory);
    try {
      const up = await t.api('POST', '/api/users/profile-picture', { token: customer.token, form: t.receiptForm() });
      assert.equal(up.status, 200, JSON.stringify(up.body));
      assert.ok(saved.has(`public/${up.body.profilePicture.split('/').pop()}`));
      const served = await fetch(`${t.base}${up.body.profilePicture}`);
      assert.equal(served.status, 200);
      assert.equal(served.headers.get('content-type'), 'image/png');
    } finally {
      storage.setDriver(storage.createLocalDriver());
    }
  });
});
