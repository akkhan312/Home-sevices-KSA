import React from 'react';
import { NativeModules } from 'react-native';
import { STRIPE_PUBLISHABLE_KEY } from '../config/api';

export function StripeWrapper({ children }: { children: React.ReactNode }) {
  // The native Stripe module is not available in Expo Go, and card payments are disabled without a key.
  if (NativeModules.StripeSdk && STRIPE_PUBLISHABLE_KEY) {
    const { StripeProvider } = require('@stripe/stripe-react-native');
    return (
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.servemate" urlScheme="home-services-app">
        {children}
      </StripeProvider>
    );
  }

  return <>{children}</>;
}
