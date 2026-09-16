import React from 'react';

// Stripe React Native is not supported on Web. We render a passthrough component.
export function StripeWrapper({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  return <>{children}</>;
}
