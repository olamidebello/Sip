Automatic SIP account provisioning
=================================

Email verification activates the application user and creates their SIP account
in the same transaction. A background worker runs at startup and every 30 seconds
to backfill all active users in active tenants, including administrators and LDAP
users. Pending-email users and suspended users/tenants are excluded from activation.
Existing usernames and encrypted credentials are preserved.

Configure these private values in /etc/olamide/secrets.env:

- SIP_CREDENTIAL_KEY: stable 64-character hexadecimal AES encryption key; never rotate without a credential migration.
- SIP_PROVISION_URL: commissioned HTTPS Kamailio provisioning adapter endpoint.
- SIP_PROVISION_TOKEN: adapter bearer token.
- SIP_ACCOUNT_DOMAIN: optional SIP realm; defaults to PUBLIC_ORIGIN hostname.

The adapter receives accountId, tenantId, userId, username, password and domain.
It must idempotently provision Kamailio authentication credentials using the
Idempotency-Key account UUID and return JSON {"status":"active"} only after success.
No adapter is installed or inferred by this change. Without its configuration,
accounts stay pending; the application never claims activation from email alone.

Retries persist in MySQL, back off from 30 seconds to one hour and resume after
restart. A database session lock serializes background work across replicas.
Administrators can inspect status and retry pending accounts in the Kamailio GUI.
Activation means adapter acknowledgement, not a successful registration or call.
This worker does not revoke previously activated credentials on suspension or
deletion; commissioning must include lifecycle enforcement at the SIP service.

Deploy the verified main build as root:

    bash /opt/olamide/repo/deployment/update.sh

Email delivery and OTP verification retain the application's existing configuration.
