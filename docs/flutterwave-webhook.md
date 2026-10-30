# Flutterwave V3 webhook for sip.dobhrap.com

Deploy the branch containing this implementation using the existing SIP deployment process. Restart the API and confirm /api/health. This change does not configure the running host automatically.

## Dashboard settings
URL: https://sip.dobhrap.com/api/webhooks/flutterwave/<TENANT_ID>

Replace <TENANT_ID> with the actual tenant UUID (available from GET /api/admin/provider-webhooks when signed in as super administrator). Do not paste the placeholder into Flutterwave.

Generate a private random hash on the server, for example with openssl rand -hex 32. Save the same hash in Flutterwave's Secret hash field and the app's super administrator Wallet Providers → Flutterwave webhookSecret field. Never commit the value.

The app stores Flutterwave wallet provider credentials encrypted using PROVIDER_CREDENTIAL_KEY. For the test dashboard select sandbox and use test credentials. Enable JSON, retries, and V3 webhooks.

The existing marketplace Flutterwave gateway must also be configured with the matching merchant and test/live environment; its API key is used for independent transaction verification. These are separate settings in the current app. PAYMENT_CONFIG_KEY is required for that gateway.

## Behavior
Only authenticated successful charge.completed notifications tied to an existing Flutterwave payment attempt are reconciled. The server rechecks the transaction through Flutterwave and matches the reference, amount, and currency. The existing reconciler locks the invoice and payment attempt and settles at most once. Unrelated events are acknowledged without creating payments. Temporary verification failures return 503 for retry.

This endpoint settles existing invoices; it does not enable wallet deposits, transfers, payouts, or automatically credit a subscriber wallet.

## Validation
Run node --test services/api/flutterwaveWebhook.test.js and existing storeGateways tests. After deployment send a Flutterwave test event and complete a test checkout created by this app. Confirm that the invoice becomes paid only after verification. Resend the event and confirm no duplicate settlement. Missing or incorrect verif-hash must return 401.
