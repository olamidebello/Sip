# Stripe management

Super admin → Stripe management controls the current tenant's existing encrypted invoice Checkout configuration. Save/rotate the API key and webhook signing secret, enable/disable payments, confirm live mode, inspect recent payment attempts and verify the key through a read-only Stripe balance request. Verification does not return balances or secrets and does not validate webhook delivery. Ordinary administrators may read payment status/history but cannot change or verify credentials. Updates record a security event. The existing PAYMENT_CONFIG_KEY (64 hex characters) is required. Stored secrets are never shown again.

Deploy after successful CI using `bash deployment/deploy-messenger-features.sh` from `/opt/olamide/repo` after pulling main. Existing payment tables are reused; no new migration is required.

These controls do not create cards, fund wallets, withdraw money, approve an issuing program or enable all regions. The dashboard link opens Stripe's own account management. Approved issuer coverage and a dedicated cardholder/card/authorization integration remain required for card features.
