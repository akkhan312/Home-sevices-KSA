import { NativeModules } from 'react-native';
import { STRIPE_PUBLISHABLE_KEY } from '../config/api';

// The Stripe native module is missing in Expo Go; it requires a development or production build.
// Availability never changes at runtime, so choosing the hook once at module load keeps hook order stable.
const isStripeAvailable = !!NativeModules.StripeSdk && !!STRIPE_PUBLISHABLE_KEY;

const unavailable = async () => ({
  error: { code: 'Unavailable', message: 'Card payments require the ServeHome app build. Please use bank transfer.' },
});

function useUnavailablePayment() {
  return { initPaymentSheet: unavailable as any, presentPaymentSheet: unavailable as any, isAvailable: false };
}

function useStripePayment() {
  const { useStripe } = require('@stripe/stripe-react-native');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  return { initPaymentSheet, presentPaymentSheet, isAvailable: true };
}

export const usePayment = isStripeAvailable ? useStripePayment : useUnavailablePayment;
