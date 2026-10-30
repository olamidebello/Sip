# Naira payments and deployment

All NGN payments must use Flutterwave. Stripe and Paystack remain available for USD; an NGN invoice or NGN request cannot be routed through them. The Flutterwave button requests an NGN quote for the current USD or NGN invoice, shows the total and rate, and asks the customer to confirm before redirecting.

## Exchange-rate policy

The server requests the latest published USD parallel-market **sell** rate from the documented Aboki Forex API when creating each quote. There is no markup and no fallback to official, cached, invented or client-supplied rates. The feed updates hourly, so this is the latest published rate at checkout, not a tick-by-tick executable FX price. Rates older than 90 minutes are refused. USD cents are multiplied by NGN per USD using integer arithmetic and rounded half-up to the nearest kobo. Native NGN invoices are not converted again.

The quote lasts ten minutes. Its amount, base invoice amount, currency, rate, source, source timestamp and expiry are saved before checkout. The provider session duration is capped to the remaining whole minutes. The webhook verifies the charged NGN amount against the saved quote, and the original USD invoice against its original amount; it never reprices a completed payment using a later rate. Delayed webhook deliveries still reconcile against the saved quote. Paid attempts display the rate and amount in Billing history. Expired attempts remain pending until independently verified; they must not be blindly replaced with another charge.

The customer's checkout may also show fees applied by Flutterwave or the customer's bank. The exchange quote itself adds no margin.

## Required setup

1. Configure the Flutterwave merchant/test or live credentials and webhook as described in flutterwave-webhook.md. The current automatic provisioner is intentionally restricted to test credentials.
2. Obtain an Aboki Forex API subscription/key from https://abokiforex.app/api. This change does not purchase a subscription.
3. In the super administrator GUI, open Store payment gateways → Naira parallel-market rate feed and save the key. It is encrypted using the existing PAYMENT_CONFIG_KEY and never returned by the API. Each tenant has its own configuration.

## Pull and deploy

From an Ansible controller with SSH access to sip.dobhrap.com:

```bash
ansible-playbook -i 'sip.dobhrap.com,' -u root deploy/ansible/flutterwave-naira.yml
```

Or from the existing repository on the server:

```bash
cd /opt/olamide/repo
git fetch origin codex/flutterwave-v3-webhook
git show FETCH_HEAD:deploy/ansible/flutterwave-naira.yml > /root/flutterwave-naira.yml
ansible-playbook -i 'localhost,' -c local /root/flutterwave-naira.yml
```

To also auto-provision existing TEST Flutterwave credentials, add `-e flutterwave_provision_test=true`. The generated dashboard values are saved to the private file documented in flutterwave-auto-provision.md. Missing merchant keys, ambiguous tenants, or disabled/live settings require explicit configuration instead of guessed values.

The playbook backs up source and database, fetches and pins the payment branch, applies staged three-way merges to retain existing server fixes, builds API and web, runs targeted tests, restarts only those services, verifies the expected API release and webhook route, and checks HTTPS. Merge conflicts stop before source writes. A failed build or test stops before restarting services. Database integration and a real provider test payment are still required before enabling live payments.

For the shared API router, the installer adds the payment import, public webhook classification, origin exemption, external rate-limit classification and dispatch using individually validated anchors. It retains other local routes and security checks rather than merging an old copy of the whole router. Missing or ambiguous anchors abort before any source writes. Five Python regression tests cover these integrations and conflict handling.

Both deployment and test provisioning use /etc/olamide/secrets.env when present, falling back to deployment/docker/.env. After any installer update, fetch the payment branch and regenerate /root/flutterwave-naira.yml before retrying; rerunning an old copied playbook does not update its shell steps.

The billing and payment-admin UI files are integrated using uniquely matched payment-edit blocks rather than whole-file merges. Adjacent wallet fixes and unrelated imports/features remain intact. Missing or ambiguous payment-edit blocks still stop before any application writes. Eight installer regression tests cover router changes, UI edits, repeated runs and conflicts; the payment test suite has 29 tests.

Backups are root-private under /opt/olamide/backups/flutterwave-naira-*. If a post-start health check fails, inspect the containers and backup before restoring. Schema additions are additive; the playbook does not automatically restore a live database or discard local modifications.

Deployment from this development session is unverified because the SIP host is unreachable over SSH.
