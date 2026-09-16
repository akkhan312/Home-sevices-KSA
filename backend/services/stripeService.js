const { STRIPE_SECRET_KEY, STRIPE_CURRENCY } = require('../config');

let stripe = null;
if (STRIPE_SECRET_KEY) {
  const Stripe = require('stripe');
  stripe = new Stripe(STRIPE_SECRET_KEY);
}

const isStripeConfigured = () => Boolean(stripe);

// SAR, USD, etc. use 2 decimal places (halalas / cents).
const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

async function createBookingPaymentIntent(booking) {
  if (!stripe) throw new Error('Card payments are not configured on the server');
  return stripe.paymentIntents.create(
    {
      amount: toMinorUnits(booking.price),
      currency: STRIPE_CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: booking.id, customerId: booking.customer_id },
      description: `ServeHome booking ${booking.id}`,
    },
    // Re-using the key returns the same intent if the customer taps "Pay" twice for the same price.
    { idempotencyKey: `booking_${booking.id}_${toMinorUnits(booking.price)}` }
  );
}

/** Returns the PaymentIntent only if it genuinely paid the full price of this booking. */
async function verifyBookingPayment(paymentIntentId, booking) {
  if (!stripe) throw new Error('Card payments are not configured on the server');
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const ok =
    intent.status === 'succeeded' &&
    intent.metadata?.bookingId === booking.id &&
    intent.currency === STRIPE_CURRENCY &&
    intent.amount_received >= toMinorUnits(booking.price);
  return ok ? intent : null;
}

module.exports = { isStripeConfigured, createBookingPaymentIntent, verifyBookingPayment, stripeClient: () => stripe };
