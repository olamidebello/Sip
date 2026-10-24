# Trusted application registration bridge

`deploy/ansible/hosted-app-services.yml` enables POST
`/api/integrations/hosted-apps/provision` with per-application Bearer credentials
and X-Hosted-App. Body: subject, email, emailVerified=true, name, accountType
(individual/business/court/organization), organizationId for non-individuals.
Only trusted app backends may assert verified email and organizational membership.
No browser is given these credentials. Unsupported or suspended identities fail.
Existing accounts are never auto-linked by email. Duplicate email conflicts need
an explicit verified account-linking flow, not implemented here.

New identities get isolated app workspaces, an active login and a SIP account in
its normal switch provisioning queue. Non-individual workspaces also receive a
Standard PBX feature group and extensions starting at 1001; first member is tenant
admin, later members are users. No system super-admin, DID, paid plan, wallet
balance, carrier authorization or SSO session is granted. Existing SIP call access,
passkey and billing controls continue to apply. PBX runtime commissioning remains
separate from tenant/extension records.

Each identity gets an independent unknown random password, never returned. SIP
password recovery must be configured for the user to set a phone password. Use the
existing phone/PBX portal at https://sip.dobhrap.com/. Public signup is not bypassed
through an unprotected route; server tokens explicitly authorize trusted identity
provisioning instead. Disable an app by removing its token from
HOSTED_APP_TOKENS_JSON and recreating API. Track app origin independently of email;
stable IDs and organization IDs are required. Tokens grant creation of new users
and tenant admins and must be held only by authorized backend operators.

The Ansible playbook defaults to /opt/olamide/repo and /etc/olamide/secrets.env,
keeps volumes, generates private per-app client JSON under
/etc/olamide/hosted-apps and rebuilds API only. Hand off only the matching app's
JSON through a private channel to its separate service account on the application
server. Never distribute the full token map. Application registration hooks,
status routes and UI navigation are a separate required adapter per application.
The olamidepanel repository contains the durable Python outbox/SMTP client and a
phone services widget under integrations/, with deployment and integration docs.
No app registrations are automatically wired just by enabling this API.
