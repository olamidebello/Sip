# Automatic Stripe gateway setup

## One-time private credential

Use a live `sk_live_...` Stripe secret key. This integration currently accepts standard secret keys; restricted keys are not yet accepted. Stripe must have activated your account for live payments. A publishable key is unnecessary for this hosted Checkout flow. The script creates and encrypts the endpoint signing secret automatically.

If a live key is already saved in the payment gateway GUI, the playbook reuses it. Otherwise save the key privately on the server without putting it in shell history:

```bash
mkdir -p /etc/olamide
read -rsp 'Stripe live secret key: ' stripe_setup_key
printf '\n'
(umask 077; printf '%s' "$stripe_setup_key" > /etc/olamide/stripe-api-key)
unset stripe_setup_key
chmod 600 /etc/olamide/stripe-api-key
```

Run as root:

```bash
cd /opt/olamide/repo
ansible-playbook -i localhost, -c local deployment/ansible/stripe-gateway.yml
```

If more than one active super admin exists, specify the intended administrator:

```bash
ansible-playbook -i localhost, -c local deployment/ansible/stripe-gateway.yml -e stripe_admin_email=YOUR_ADMIN_EMAIL
```

Other optional variables: `stripe_tenant_id`, `stripe_key_file`, `stripe_enable_topups` (default true), `stripe_topup_min_cents` (100), and `stripe_topup_max_cents` (100000). Limits are USD cents. Setting `stripe_enable_topups=false` leaves any existing wallet policy unchanged and only configures invoice payments; it does not disable previously enabled top-ups.

## What it does

- Builds and deploys the API and web interface using the existing wallet playbook and preserved Docker overrides.
- Preserves the payment encryption key and runs additive migrations.
- Resolves one active super administrator and workspace; ambiguous selections stop without changing the gateway.
- Checks Stripe account activation and live-mode balance access.
- Creates a managed webhook for the four supported Checkout completion, delayed success/failure, and expiration events.
- Encrypts API and webhook secrets in the existing payment gateway table, enables live invoice payments and optionally wallet top-ups, and records the admin action.
- Stores endpoint identity and encrypted signing-secret recovery state in `stripe_gateway_setup`, reusing it on reruns. Account/URL changes stop for review.
- Posts a signed, nonpayment probe through the public webhook and reports readiness only after HTTP success. This creates an audit event, never a checkout or wallet credit.

Keys are passed to the one-off setup container through stdin, never command arguments. No key is added to Git or printed by the setup utility. The private key file is optional after successful setup; subsequent runs can use the encrypted database key. Do not delete or rotate `PAYMENT_CONFIG_KEY` independently of the encrypted data.

An existing webhook at the same URL that was not created by this setup stops automatic creation to avoid duplicate delivery or replacing unknown signing secrets. Keep the existing working gateway or reconcile that endpoint in Stripe first. Never remove a working production endpoint without reviewing pending payments.

Stripe does not expose signing secrets on ordinary endpoint retrieval. If creation succeeds but database persistence fails, reruns reuse a saved request ID to recover the idempotent creation response during the recovery window. If that window expires, setup stops instead of creating a duplicate endpoint.

Live payments still require a valid Stripe account. This playbook does not submit business verification, add payout bank details, create products/prices, alter taxes, or charge a card. After setup, review Administration > Payments & wallets and complete a small real payment to confirm carrier-independent settlement and wallet crediting.

Reference: https://docs.stripe.com/api/webhook_endpoints/create
