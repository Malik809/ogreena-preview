# Stripe-hosted Checkout plan

The public catalog is intentionally payment-disabled. Product data uses stable internal IDs in `product-catalog.js`; no Stripe secret, publishable key, Payment Link, or live Price ID is stored in the site.

When Ogreena's authorized owner is ready:

1. Create or select Ogreena's separate verified Stripe account.
2. Create five Stripe Products and recurring-free, one-time Prices matching the IDs, names, sizes, and USD prices in `product-catalog.js`.
3. Keep product checkout separate from future service-payment flows by using product-only Checkout Sessions and product-specific metadata.
4. Add a trusted server endpoint that maps the public internal product ID to a server-side Stripe Price ID and creates a Stripe-hosted Checkout Session. Never accept price or Stripe Price ID values from the browser.
5. Redirect the browser only to the Stripe-hosted Checkout URL returned by that endpoint.
6. Verify fulfillment with signed Stripe webhooks before treating any purchase as paid.
7. Replace the current checkout-unavailable handler only after test-mode and owner-approved live-mode purchases pass.

GitHub Pages cannot securely hold a Stripe secret key or create Checkout Sessions by itself, so live checkout must remain disabled until an approved secure backend is connected.
