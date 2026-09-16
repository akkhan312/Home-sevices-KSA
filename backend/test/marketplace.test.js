const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./support/harness');

describe('Marketplace workflow: request → proposals → payment → unlock → service → payout → review', () => {
  let t;
  let admin, customer, otherCustomer, provider, otherProvider, pendingProvider;
  let bookingId, offerId;

  before(async () => {
    t = await start();
    admin = t.createUser({ email: 'admin@test.sa', name: 'Admin', role: 'admin' });
    customer = t.createUser({ email: 'sara@test.sa', name: 'Sara Ahmed', role: 'customer', phone: '0501112222' });
    otherCustomer = t.createUser({ email: 'mona@test.sa', name: 'Mona', role: 'customer' });
    provider = t.createUser({ email: 'ahmed@test.sa', name: 'Ahmed', role: 'provider', service_categories: ['ac'], city: 'Riyadh', iqama_number: '2400000000' });
    otherProvider = t.createUser({ email: 'omar@test.sa', name: 'Omar', role: 'provider', service_categories: ['ac'], city: 'Riyadh' });
    pendingProvider = t.createUser({ email: 'new@test.sa', name: 'New Provider', role: 'provider', approval_status: 'PENDING', service_categories: ['ac'] });

    const bank = await t.api('PUT', '/api/admin/settings/payment', {
      token: admin.token,
      body: { bankName: 'Al Rajhi Bank', accountName: 'ServeHome LLC', iban: 'SA03 8000 0000 6080 1016 7519', accountNumber: '608010167519', instructions: 'Use the payment reference.' },
    });
    assert.equal(bank.status, 200, JSON.stringify(bank.body));
    const commission = await t.api('PUT', '/api/admin/settings/commission', { token: admin.token, body: { defaultPercent: 10, rules: [] } });
    assert.equal(commission.status, 200);
  });

  after(async () => t.stop());

  it('customer creates a request that matching approved providers receive', async () => {
    const res = await t.api('POST', '/api/bookings', {
      token: customer.token,
      body: { category: 'ac', categoryName: 'AC Repair', price: 400, scheduledDate: '2026-10-01', scheduledTime: '10:00', address: 'Building 12, Olaya St, Riyadh', city: 'Riyadh', area: 'Olaya', customerPhone: '0501112222', description: 'AC not cooling' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.stage, 'REQUESTED');
    assert.match(res.body.message, /sent to available providers/);
    bookingId = res.body._id;

    const visible = await t.api('GET', '/api/bookings/provider', { token: provider.token });
    assert.ok(visible.body.some((b) => b._id === bookingId));
    const hiddenFromPending = await t.api('GET', '/api/bookings/provider', { token: pendingProvider.token });
    assert.ok(!hiddenFromPending.body.some((b) => b._id === bookingId), 'unapproved provider must not see requests');
  });

  it('exact address and phone are hidden from providers before payment', async () => {
    const res = await t.api('GET', `/api/bookings/${bookingId}`, { token: provider.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.address, 'Olaya');
    assert.equal(res.body.customerPhone, '');
    assert.equal(res.body.communication.locked, true);
  });

  it('approved providers send proposals; unapproved providers cannot', async () => {
    const a = await t.api('POST', `/api/bookings/${bookingId}/offers`, { token: provider.token, body: { price: 500, etaMinutes: 30, completionHours: 2, message: 'Certified AC technician' } });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    offerId = a.body.id;
    const b = await t.api('POST', `/api/bookings/${bookingId}/offers`, { token: otherProvider.token, body: { price: 450, etaMinutes: 45, completionHours: 3 } });
    assert.equal(b.status, 201);
    const c = await t.api('POST', `/api/bookings/${bookingId}/offers`, { token: pendingProvider.token, body: { price: 300 } });
    assert.equal(c.status, 403);
    assert.equal(c.body.code, 'PROVIDER_NOT_APPROVED');

    const forCustomer = await t.api('GET', `/api/bookings/${bookingId}/offers`, { token: customer.token });
    assert.equal(forCustomer.body.length, 2);
    assert.equal(forCustomer.body[0].price, 450, 'proposals sorted by price');
    assert.equal(forCustomer.body.find((o) => o.id === offerId).verifiedBadge, true);
    const forCompetitor = await t.api('GET', `/api/bookings/${bookingId}/offers`, { token: otherProvider.token });
    assert.equal(forCompetitor.body.length, 1, 'providers only see their own proposal');

    const booking = await t.api('GET', `/api/bookings/${bookingId}`, { token: customer.token });
    assert.equal(booking.body.stage, 'PROPOSALS_RECEIVED');
  });

  it('customer selects provider at SAR 500; commission is fixed server-side and cannot be manipulated', async () => {
    const res = await t.api('POST', `/api/bookings/${bookingId}/accept-offer`, { token: customer.token, body: { offerId, price: 1, commission: 0, providerEarnings: 500 } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const b = res.body.booking;
    assert.equal(b.status, 'OFFER_ACCEPTED');
    assert.equal(b.stage, 'PAYMENT_PENDING');
    assert.equal(b.price, 500);
    assert.equal(b.commissionRate, 10);
    assert.equal(b.commission, 50);
    assert.equal(b.providerEarnings, 450);
    assert.equal(b.paymentStatus, 'UNPAID');
    assert.equal(b.communicationStatus, 'LOCKED');
    assert.match(b.paymentReference, /^BP-\d+$/);

    const again = await t.api('POST', `/api/bookings/${bookingId}/accept-offer`, { token: customer.token, body: { offerId } });
    assert.equal(again.status, 409, 'a provider can only be selected once');
    const budget = await t.api('PATCH', `/api/bookings/${bookingId}/increase-budget`, { token: provider.token, body: { newBudget: 900 } });
    assert.equal(budget.status, 403, 'provider cannot change the order price');
    const custBudget = await t.api('PATCH', `/api/bookings/${bookingId}/increase-budget`, { token: customer.token, body: { newBudget: 900 } });
    assert.equal(custBudget.status, 409, 'price is frozen once a provider is selected');
  });

  it('payment instructions come from admin bank settings', async () => {
    const res = await t.api('GET', `/api/bookings/${bookingId}/payment-instructions`, { token: customer.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.amount, 500);
    assert.equal(res.body.bank.iban, 'SA0380000000608010167519');
    assert.match(res.body.reference, /^BP-/);
    const forProvider = await t.api('GET', `/api/bookings/${bookingId}/payment-instructions`, { token: provider.token });
    assert.equal(forProvider.status, 403);
  });

  it('before payment: chat, call and location are locked for both customer and provider (REST + socket)', async () => {
    for (const user of [customer, provider]) {
      const send = await t.api('POST', '/api/chat/send', { token: user.token, body: { bookingId, text: 'hello' } });
      assert.equal(send.status, 403, `${user.name} chat must be locked`);
      assert.equal(send.body.code, 'COMMUNICATION_LOCKED');
      const history = await t.api('GET', `/api/chat/${bookingId}`, { token: user.token });
      assert.equal(history.status, 403);
    }

    const upload = await t.api('POST', `/api/chat/upload-image?bookingId=${bookingId}`, { token: customer.token, form: t.receiptForm() });
    assert.equal(upload.status, 403, 'chat media upload locked');

    const customerSocket = await t.connect(customer.token);
    const providerSocket = await t.connect(provider.token);

    const failed = t.waitFor(customerSocket, 'message_failed');
    const leaked = t.waitFor(providerSocket, 'new_message');
    customerSocket.emit('send_message', { bookingId, text: 'socket hello', tempId: 't1' });
    assert.equal((await failed).code, 'COMMUNICATION_LOCKED');
    assert.equal(await leaked, null, 'no message delivered before payment');

    const callFailed = t.waitFor(customerSocket, 'call_failed');
    const incoming = t.waitFor(providerSocket, 'incoming_call');
    customerSocket.emit('call_user', { bookingId });
    assert.equal((await callFailed).code, 'COMMUNICATION_LOCKED');
    assert.equal(await incoming, null, 'customer cannot call before payment');

    const providerCallFailed = t.waitFor(providerSocket, 'call_failed');
    providerSocket.emit('call_user', { bookingId });
    assert.ok(await providerCallFailed, 'provider cannot call before payment');

    const locationLeak = t.waitFor(customerSocket, 'live_location_broadcast');
    providerSocket.emit('update_live_location', { bookingId, latitude: 24.7, longitude: 46.6 });
    assert.equal(await locationLeak, null, 'no live location before payment');

    const forged = t.waitFor(providerSocket, 'payment_verified');
    customerSocket.emit('payment_verified', { bookingId, status: 'VERIFIED' });
    assert.equal(await forged, null, 'client cannot forge payment events');

    const start = await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: provider.token, body: { status: 'ON_THE_WAY' } });
    assert.equal(start.status, 400);
    assert.equal(start.body.code, 'PAYMENT_REQUIRED');
  });

  it('customer uploads receipt → PENDING_VERIFICATION, communication stays LOCKED, duplicates are idempotent', async () => {
    const missingTxn = await t.api('POST', `/api/bookings/${bookingId}/payment-proof`, { token: customer.token, form: t.receiptForm() });
    assert.equal(missingTxn.status, 400);

    const badType = await t.api('POST', `/api/bookings/${bookingId}/payment-proof`, { token: customer.token, form: t.receiptForm({ transactionNumber: 'TX123456' }, { type: 'text/html', name: 'x.html' }) });
    assert.equal(badType.status, 400, 'non-image receipts rejected');

    const otherCust = await t.api('POST', `/api/bookings/${bookingId}/payment-proof`, { token: otherCustomer.token, form: t.receiptForm({ transactionNumber: 'TX999999' }) });
    assert.equal(otherCust.status, 403);

    const res = await t.api('POST', `/api/bookings/${bookingId}/payment-proof`, { token: customer.token, form: t.receiptForm({ transactionNumber: 'RJHI-778899' }) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.paymentStatus, 'PENDING_VERIFICATION');
    assert.equal(res.body.stage, 'PAYMENT_VERIFICATION');
    assert.equal(res.body.communicationStatus, 'LOCKED');

    const dup = await t.api('POST', `/api/bookings/${bookingId}/payment-proof`, { token: customer.token, form: t.receiptForm({ transactionNumber: 'RJHI-778899' }) });
    assert.equal(dup.status, 200);
    assert.equal(t.fake.rows('payment_proofs').length, 1, 'double tap does not create a second payment record');

    const chat = await t.api('POST', '/api/chat/send', { token: customer.token, body: { bookingId, text: 'paid!' } });
    assert.equal(chat.status, 403, 'uploading a receipt does not unlock chat');

    const selfApprove = await t.api('POST', `/api/admin/payments/${bookingId}/approve`, { token: customer.token });
    assert.equal(selfApprove.status, 403, 'customer cannot approve own payment');
    const statusHack = await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: customer.token, body: { status: 'VERIFIED' } });
    assert.equal(statusHack.status, 400, 'customer cannot set payment status');
  });

  it('receipts are private: only reachable through a valid signed URL', async () => {
    const list = await t.api('GET', '/api/admin/payments', { token: admin.token });
    assert.equal(list.status, 200);
    const proof = list.body.find((p) => p.bookingId === bookingId);
    assert.equal(proof.amount, 500);
    assert.equal(proof.transactionNumber, 'RJHI-778899');

    const signed = new URL(proof.receiptUrl);
    const ok = await fetch(`${t.base}${signed.pathname}${signed.search}`);
    assert.equal(ok.status, 200);
    const tampered = await fetch(`${t.base}${signed.pathname}?exp=${signed.searchParams.get('exp')}&sig=forged`);
    assert.equal(tampered.status, 403);
    const direct = await fetch(`${t.base}/uploads/private/${signed.pathname.split('/').pop()}`);
    assert.equal(direct.status, 404);

    const providerView = await t.api('GET', `/api/bookings/${bookingId}`, { token: provider.token });
    assert.equal(providerView.body.paymentSlip, '', 'provider never gets the receipt');
  });

  it('only admin approval unlocks communication; payment becomes PAID', async () => {
    const providerApprove = await t.api('POST', `/api/admin/payments/${bookingId}/approve`, { token: provider.token });
    assert.equal(providerApprove.status, 403);

    const providerSocket = await t.connect(provider.token);
    const unlockedEvent = t.waitFor(providerSocket, 'payment:approved');

    const res = await t.api('POST', `/api/admin/payments/${bookingId}/approve`, { token: admin.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.booking.paymentStatus, 'PAID');
    assert.equal(res.body.booking.communicationStatus, 'UNLOCKED');
    assert.equal((await unlockedEvent).communicationStatus, 'UNLOCKED');

    const twice = await t.api('POST', `/api/admin/payments/${bookingId}/approve`, { token: admin.token });
    assert.equal(twice.status, 409);

    const ledger = t.fake.rows('ledger_entries').filter((e) => e.booking_id === bookingId);
    assert.deepEqual(ledger.map((e) => [e.type, e.amount]), [['CUSTOMER_PAYMENT', 500]]);
    const wallet = t.fake.rows('wallets').find((w) => w.user_id === provider.id);
    assert.equal(wallet.pending_balance, 450);

    const view = await t.api('GET', `/api/bookings/${bookingId}`, { token: provider.token });
    assert.equal(view.body.address, 'Building 12, Olaya St, Riyadh', 'exact address unlocked for assigned provider');
    assert.equal(view.body.customerPhone, '0501112222');
    assert.equal(view.body.communication.chat, true);
  });

  it('after payment: chat, call and live location work between the two participants only', async () => {
    const customerSocket = await t.connect(customer.token);
    const providerSocket = await t.connect(provider.token);
    const outsider = await t.connect(otherProvider.token);

    const received = t.waitFor(providerSocket, 'message:new', 1500);
    const outsiderGot = t.waitFor(outsider, 'new_message');
    const sent = await t.api('POST', '/api/chat/send', { token: customer.token, body: { bookingId, text: 'See you soon' } });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal((await received).text, 'See you soon');
    assert.equal(await outsiderGot, null, 'messages are not broadcast to other users');

    const external = await t.api('POST', '/api/chat/send', { token: customer.token, body: { bookingId, image: 'https://evil.example/phish.png' } });
    assert.equal(external.status, 400, 'external media links rejected');

    const history = await t.api('GET', `/api/chat/${bookingId}`, { token: provider.token });
    assert.equal(history.status, 200);
    assert.equal(history.body.length, 1);

    const incoming = t.waitFor(providerSocket, 'call:incoming', 1500);
    customerSocket.emit('call_user', { bookingId });
    const call = await incoming;
    assert.equal(call.callerId, customer.id);
    const accepted = t.waitFor(customerSocket, 'call:accepted', 1500);
    providerSocket.emit('call_accepted', { bookingId });
    assert.ok(await accepted);
    const ended = t.waitFor(providerSocket, 'call:ended', 1500);
    customerSocket.emit('call_ended', { bookingId, duration: 12 });
    assert.ok(await ended);
    await new Promise((r) => setTimeout(r, 100));
    const callRow = t.fake.rows('call_history').find((c) => c.booking_id === bookingId);
    assert.equal(callRow.status, 'ENDED');

    const location = t.waitFor(customerSocket, 'location:update', 1500);
    providerSocket.emit('update_live_location', { bookingId, latitude: 24.71, longitude: 46.67 });
    assert.equal((await location).latitude, 24.71);

    const outsiderChat = await t.api('POST', '/api/chat/send', { token: otherCustomer.token, body: { bookingId, text: 'hi' } });
    assert.equal(outsiderChat.status, 403);
  });

  it('users cannot access orders that are not theirs', async () => {
    assert.equal((await t.api('GET', `/api/bookings/${bookingId}`, { token: otherCustomer.token })).status, 403);
    assert.equal((await t.api('GET', `/api/bookings/${bookingId}`, { token: otherProvider.token })).status, 403);
    assert.equal((await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: otherProvider.token, body: { status: 'ON_THE_WAY' } })).status, 403);
    assert.equal((await t.api('GET', `/api/bookings/${bookingId}/offers`, { token: otherCustomer.token })).status, 403);
  });

  it('provider progresses the job; only the assigned provider can complete it', async () => {
    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS']) {
      const res = await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: provider.token, body: { status } });
      assert.equal(res.status, 200, `${status}: ${JSON.stringify(res.body)}`);
    }
    const hijack = await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: otherProvider.token, body: { status: 'WAITING_CUSTOMER_CONFIRMATION' } });
    assert.equal(hijack.status, 403);

    const earlyReview = await t.api('POST', '/api/reviews', { token: customer.token, body: { bookingId, rating: 5 } });
    assert.equal(earlyReview.status, 400, 'cannot review an incomplete order');

    const customerSocket = await t.connect(customer.token);
    const stopped = t.waitFor(customerSocket, 'location:stopped', 1500);
    const done = await t.api('PATCH', `/api/bookings/${bookingId}/status`, { token: provider.token, body: { status: 'WAITING_CUSTOMER_CONFIRMATION' } });
    assert.equal(done.status, 200);
    assert.equal(done.body.stage, 'SERVICE_COMPLETED');
    assert.ok(await stopped, 'live tracking stops when the service is completed');

    const socketLoc = t.waitFor(customerSocket, 'live_location_broadcast');
    const providerSocket = await t.connect(provider.token);
    providerSocket.emit('update_live_location', { bookingId, latitude: 24.72, longitude: 46.68 });
    assert.equal(await socketLoc, null, 'no live location after completion');
  });

  it('customer confirms → commission 10% (SAR 50), provider SAR 450, payout PENDING', async () => {
    const byProvider = await t.api('PATCH', `/api/bookings/${bookingId}/confirm-completion`, { token: provider.token });
    assert.equal(byProvider.status, 403);

    const res = await t.api('PATCH', `/api/bookings/${bookingId}/confirm-completion`, { token: customer.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.stage, 'PAYOUT_PENDING');
    assert.equal(res.body.payoutStatus, 'PENDING');

    const again = await t.api('PATCH', `/api/bookings/${bookingId}/confirm-completion`, { token: customer.token });
    assert.equal(again.status, 400);

    const ledger = t.fake.rows('ledger_entries').filter((e) => e.booking_id === bookingId);
    assert.equal(ledger.find((e) => e.type === 'PLATFORM_COMMISSION').amount, 50);
    assert.equal(ledger.find((e) => e.type === 'PROVIDER_EARNING').amount, 450);

    const payouts = await t.api('GET', '/api/admin/payouts', { token: admin.token });
    const payout = payouts.body.find((p) => p.bookingId === bookingId);
    assert.equal(payout.status, 'PENDING');
    assert.equal(payout.customerPayment, 500);
    assert.equal(payout.commission, 50);
    assert.equal(payout.amount, 450);
  });

  it('admin marks payout PAID once; duplicate payouts are impossible; provider wallet +450', async () => {
    const payout = (await t.api('GET', '/api/admin/payouts', { token: admin.token })).body.find((p) => p.bookingId === bookingId);

    const byProvider = await t.api('POST', `/api/admin/payouts/${payout.id}/mark-paid`, { token: provider.token });
    assert.equal(byProvider.status, 403);

    const res = await t.api('POST', `/api/admin/payouts/${payout.id}/mark-paid`, { token: admin.token, body: { reference: 'RJHI-PAYOUT-1' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.booking.stage, 'COMPLETED');

    const twice = await t.api('POST', `/api/admin/payouts/${payout.id}/mark-paid`, { token: admin.token });
    assert.equal(twice.status, 409);
    const legacy = await t.api('PATCH', `/api/admin/bookings/${bookingId}/release-earnings`, { token: admin.token });
    assert.equal(legacy.status, 409, 'legacy release button cannot pay twice');
    assert.equal(t.fake.rows('ledger_entries').filter((e) => e.booking_id === bookingId && e.type === 'PAYOUT').length, 1);

    const earnings = await t.api('GET', '/api/wallets/earnings', { token: provider.token });
    assert.equal(earnings.status, 200);
    assert.equal(earnings.body.paidOut, 450);
    assert.equal(earnings.body.pendingBalance, 0);
    assert.equal(earnings.body.totalEarnings, 450);
    assert.equal(earnings.body.totalCommission, 50);
    assert.equal(earnings.body.pendingPayouts, 0);

    const stats = await t.api('GET', '/api/admin/stats', { token: admin.token });
    assert.equal(stats.body.totalPlatformEarnings, 50);
  });

  it('customer reviews once with category ratings; provider stats update', async () => {
    const otherReview = await t.api('POST', '/api/reviews', { token: otherCustomer.token, body: { bookingId, rating: 1 } });
    assert.equal(otherReview.status, 403);

    const res = await t.api('POST', '/api/reviews', { token: customer.token, body: { bookingId, rating: 5, quality: 5, professionalism: 5, punctuality: 4, value: 5, comment: 'Excellent' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.review.punctuality, 4);

    const dup = await t.api('POST', `/api/bookings/${bookingId}/reviews`, { token: customer.token, body: { rating: 4 } });
    assert.equal(dup.status, 409);

    const p = t.fake.rows('users').find((u) => u.id === provider.id);
    assert.equal(p.rating, 5);
    assert.equal(p.review_count, 1);
    assert.equal(p.completed_jobs, 1);
  });

  it('category commission rules apply to new orders without changing historical ones', async () => {
    const rule = await t.api('PUT', '/api/admin/settings/commission', { token: admin.token, body: { defaultPercent: 10, rules: [{ category: 'ac', percent: 12 }] } });
    assert.equal(rule.status, 200);

    const created = await t.api('POST', '/api/bookings', { token: customer.token, body: { category: 'ac', categoryName: 'AC Repair', price: 300, scheduledDate: '2026-10-05', address: 'Addr', city: 'Riyadh' } });
    const offer = await t.api('POST', `/api/bookings/${created.body._id}/offers`, { token: provider.token, body: { price: 200 } });
    const accepted = await t.api('POST', `/api/bookings/${created.body._id}/accept-offer`, { token: customer.token, body: { offerId: offer.body.id } });
    assert.equal(accepted.body.booking.commissionRate, 12);
    assert.equal(accepted.body.booking.commission, 24);
    assert.equal(accepted.body.booking.providerEarnings, 176);

    const old = await t.api('GET', `/api/bookings/${bookingId}`, { token: customer.token });
    assert.equal(old.body.commissionRate, 10, 'historical order keeps its commission');
  });

  it('admin rejects a payment → REJECTED, still locked, customer can resubmit', async () => {
    const created = await t.api('POST', '/api/bookings', { token: otherCustomer.token, body: { category: 'ac', categoryName: 'AC Repair', price: 250, scheduledDate: '2026-10-06', address: 'Addr 2', city: 'Riyadh' } });
    const id = created.body._id;
    const offer = await t.api('POST', `/api/bookings/${id}/offers`, { token: otherProvider.token, body: { price: 250 } });
    await t.api('POST', `/api/bookings/${id}/accept-offer`, { token: otherCustomer.token, body: { offerId: offer.body.id } });
    await t.api('POST', `/api/bookings/${id}/payment-proof`, { token: otherCustomer.token, form: t.receiptForm({ transactionNumber: 'FAKE-0001' }) });

    const noReason = await t.api('POST', `/api/admin/payments/${id}/reject`, { token: admin.token, body: {} });
    assert.equal(noReason.status, 400);
    const res = await t.api('POST', `/api/admin/payments/${id}/reject`, { token: admin.token, body: { reason: 'Amount not received' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.booking.paymentStatus, 'REJECTED');
    assert.equal(res.body.booking.communicationStatus, 'LOCKED');
    assert.equal(res.body.booking.paymentRejectionReason, 'Amount not received');

    const chat = await t.api('POST', '/api/chat/send', { token: otherCustomer.token, body: { bookingId: id, text: 'hi' } });
    assert.equal(chat.status, 403);

    const resubmit = await t.api('POST', `/api/bookings/${id}/payment-proof`, { token: otherCustomer.token, form: t.receiptForm({ transactionNumber: 'REAL-0002' }) });
    assert.equal(resubmit.status, 201);
    assert.equal(resubmit.body.paymentStatus, 'PENDING_VERIFICATION');
  });

  it('refund locks communication again and prevents payout', async () => {
    const created = await t.api('POST', '/api/bookings', { token: otherCustomer.token, body: { category: 'ac', categoryName: 'AC Repair', price: 150, scheduledDate: '2026-10-07', address: 'Addr 3', city: 'Riyadh' } });
    const id = created.body._id;
    const offer = await t.api('POST', `/api/bookings/${id}/offers`, { token: provider.token, body: { price: 150 } });
    await t.api('POST', `/api/bookings/${id}/accept-offer`, { token: otherCustomer.token, body: { offerId: offer.body.id } });
    await t.api('POST', `/api/bookings/${id}/payment-proof`, { token: otherCustomer.token, form: t.receiptForm({ transactionNumber: 'TX-REFUND-1' }) });
    await t.api('POST', `/api/admin/payments/${id}/approve`, { token: admin.token });
    assert.equal((await t.api('POST', '/api/chat/send', { token: otherCustomer.token, body: { bookingId: id, text: 'ok' } })).status, 201);

    const refund = await t.api('PATCH', `/api/admin/bookings/${id}/refund`, { token: admin.token, body: { reason: 'Provider unavailable' } });
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    const view = await t.api('GET', `/api/bookings/${id}`, { token: otherCustomer.token });
    assert.equal(view.body.paymentStatus, 'REFUNDED');
    assert.equal(view.body.communicationStatus, 'LOCKED');
    assert.equal((await t.api('POST', '/api/chat/send', { token: otherCustomer.token, body: { bookingId: id, text: 'hello?' } })).status, 403);
    assert.equal((await t.api('PATCH', `/api/admin/bookings/${id}/refund`, { token: admin.token, body: {} })).status, 400, 'cannot refund twice');
  });

  it('problem report opens a dispute that blocks payout until resolved', async () => {
    const created = await t.api('POST', '/api/bookings', { token: customer.token, body: { category: 'ac', categoryName: 'AC Repair', price: 100, scheduledDate: '2026-10-08', address: 'Addr 4', city: 'Riyadh' } });
    const id = created.body._id;
    const offer = await t.api('POST', `/api/bookings/${id}/offers`, { token: provider.token, body: { price: 100 } });
    await t.api('POST', `/api/bookings/${id}/accept-offer`, { token: customer.token, body: { offerId: offer.body.id } });
    await t.api('POST', `/api/bookings/${id}/payment-proof`, { token: customer.token, form: t.receiptForm({ transactionNumber: 'TX-DISPUTE' }) });
    await t.api('POST', `/api/admin/payments/${id}/approve`, { token: admin.token });
    for (const status of ['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'WAITING_CUSTOMER_CONFIRMATION']) {
      await t.api('PATCH', `/api/bookings/${id}/status`, { token: provider.token, body: { status } });
    }
    const report = await t.api('POST', `/api/bookings/${id}/report-issue`, { token: customer.token, body: { reason: 'AC still broken' } });
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal(report.body.booking.stage, 'DISPUTED');
    assert.equal((await t.api('PATCH', `/api/bookings/${id}/confirm-completion`, { token: customer.token })).status, 400);

    const resolved = await t.api('POST', `/api/admin/bookings/${id}/resolve-dispute`, { token: admin.token, body: { resolution: 'release', note: 'Fixed on revisit' } });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    const payouts = await t.api('GET', '/api/admin/payouts', { token: admin.token });
    assert.ok(payouts.body.some((p) => p.bookingId === id && p.status === 'PENDING'));
  });

  it('admin-only endpoints and account security', async () => {
    for (const user of [customer, provider]) {
      assert.equal((await t.api('GET', '/api/admin/settings', { token: user.token })).status, 403);
      assert.equal((await t.api('PUT', '/api/admin/settings/commission', { token: user.token, body: { defaultPercent: 0 } })).status, 403);
    }
    const badIban = await t.api('PUT', '/api/admin/settings/payment', { token: admin.token, body: { bankName: 'X', accountName: 'Y', iban: 'DE123' } });
    assert.equal(badIban.status, 400);

    const signup = await t.api('POST', '/api/auth/signup', { body: { email: 'hacker@test.sa', password: 'secret123', name: 'H', phone: '050', role: 'admin' } });
    assert.equal(signup.status, 200);
    assert.equal(signup.body.user.role, 'customer', 'cannot self-register as admin');

    const providerSignup = await t.api('POST', '/api/auth/signup', { body: { email: 'p2@test.sa', password: 'secret123', name: 'P', phone: '050', role: 'provider', iqamaNumber: '2411111111' } });
    assert.equal(providerSignup.body.user.approvalStatus, 'PENDING', 'new providers need admin approval');
    const approve = await t.api('PATCH', `/api/admin/providers/${providerSignup.body.user.uid}/approval`, { token: admin.token, body: { status: 'APPROVED' } });
    assert.equal(approve.status, 200);

    const reset = await t.api('POST', '/api/auth/reset-password', { body: { email: 'sara@test.sa', password: 'hacked123' } });
    assert.equal(reset.status, 400, 'password reset requires a verified OTP');
    const masterCode = await t.api('POST', '/api/auth/verify-otp', { body: { email: 'sara@test.sa', code: '1234' } });
    assert.equal(masterCode.status, 400, 'no master OTP code');

    assert.equal((await t.api('GET', '/api/bookings/my')).status, 401);
    assert.equal((await t.api('GET', '/api/bookings/my', { token: 'forged.token.value' })).status, 401);
  });
});
