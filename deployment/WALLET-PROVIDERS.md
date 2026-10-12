# Dwolla and Flutterwave provider setup

Super administrators can save tenant-specific wallet provider credentials in
/admin, under Super admin → Dwolla & Flutterwave API. Secrets are write-only
and encrypted with the existing PROVIDER_CREDENTIAL_KEY (64 hexadecimal characters).
Back up that key securely; do not rotate it without migrating encrypted credentials.

## Dwolla (USD)
1. Create an application at https://dashboard-sandbox.dwolla.com/.
2. Select Dwolla and Sandbox; enter its application key and application secret.
3. Save encrypted credentials, then Verify connection. The server obtains an
   application token from api-sandbox.dwolla.com/token without returning the token.
4. Obtain Dwolla production approval for the exact consumer-wallet business model
   before adding production credentials. Production verification uses api.dwolla.com.

## Flutterwave (NGN)
1. Open https://dashboard.flutterwave.com/ and select test mode.
2. Obtain v3 API secret credentials in Settings → API keys.
3. Select Flutterwave and Sandbox / test. Enter the test secret key and a webhook
   secret hash you control. Save and Verify connection.
4. Verification calls GET https://api.flutterwave.com/v3/banks/NG. v3 uses the same
   API hostname in test and production; the API key determines the actual mode.
   Use test credentials for sandbox and live credentials only after approval.
5. Obtain explicit wallet/business-model approval before using production keys.

## Current scope
This change configures and verifies provider credentials only. It does not register
webhook subscriptions, create customer accounts, link banks, collect money, or
send payouts. No wallet webhook URL is implemented by this change. Do not point
payment callbacks at the generic carrier callback registry.

Deposits and withdrawals remain disabled. Enabling them requires provider customer
identity verification, ownership-verified bank linking, currency-specific accounts
(the current wallet is USD only), durable idempotent operations, signed webhook
handling, settlement/reversal reconciliation, and a ledger for external operations.
The existing Stripe invoice gateway remains separate from withdrawable wallet funds.

Never paste API secrets into chat or commit them to Git. Enter them directly into
the super-admin form over HTTPS. Verify connection is a read-only authentication
check, not confirmation of eligibility for live wallet operations.

Validation: node --test services/api/walletProviders.test.js services/api/providerCredentials.test.js
