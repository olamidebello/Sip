# Automatic Flutterwave test setup

After deploying PR #28, run on sip.dobhrap.com:

```bash
bash /opt/olamide/repo/tools/provision-flutterwave.sh
```

The script uses the API container environment, detects the active super administrator tenant, reuses an existing Flutterwave TEST API key, preserves an existing strong webhook secret or generates a new 32-byte random secret, and stores matching encrypted wallet-provider and marketplace settings in one database transaction. It records a security event.

It refuses ambiguous tenants, missing master encryption keys, disabled providers, differing API keys, or production credentials. It does not generate merchant API keys. Save the actual Flutterwave test API key in the app first if none exists.

The exact URL, tenant UUID, secret hash and suggested preferences are saved only to the root-private file /opt/olamide/private/flutterwave/dashboard-settings.json (mode 0600). Repeated runs preserve a strong existing hash.

The Flutterwave dashboard itself is not configured by this script. Enter the private report's URL and secretHash in its V3 Test webhooks form and click Save. An authenticated dashboard session is needed to automate this final step.

Syntax validation passed for the provisioner. Database provisioning and host deployment have not been executed from the development session because SSH networking is unavailable.
