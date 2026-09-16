// Stripe's PaymentSheet is native-only. On web, card payments are hidden and customers pay by bank transfer.
const unavailable = async (_params?: any) => ({
  error: { code: 'Unavailable', message: 'Card payments are available in the mobile app. Please use bank transfer.' },
});

export function usePayment() {
  return { initPaymentSheet: unavailable, presentPaymentSheet: unavailable, isAvailable: false };
}
