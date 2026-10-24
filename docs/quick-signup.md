# SMS quick signup

On the signup page open **Quick signup by SMS**, enter an email, a password of
at least 12 characters and confirmation, an optional account PIN (required when
administrator policy demands it), and the image CAPTCHA. The page displays an
`OLAMIDE` command to text from the user's own phone to **+12109050290**. Only use
a code generated on your own signup page.

The authenticated Flowroute inbound SMS webhook binds the actual carrier sender
to the new account. The browser polls using a separate random secret; refreshing
can resume verification in the same tab. Codes expire after ten minutes and cannot
be reused. No account or SIP record exists until an eligible SMS is received.
An existing email or phone is never overwritten, signed in, or attached to another
account. Use the existing sign-in/recovery flow for those accounts.

After verification, sign in with the chosen email and password. The account panel
prompts for name and address. The verified phone cannot be changed through that
form. Email is a login identifier and is not verified by this SMS process.
The normal login/passkey/PIN policy still applies.

## Deployment

Use the existing `deploy/ansible/pull-and-deploy.yml` playbook, documented in
[pull-and-deploy.md](pull-and-deploy.md). API startup automatically creates the
additive quick-signup and verified-phone tables. The database and source are
backed up by deployment. Local server modifications must be reconciled first.

Flowroute must deliver inbound SMS for +12109050290 to the existing token-protected
`/api/webhooks/flowroute/<private-token>/sms` route on this application's HTTPS
origin. Preserve `FLOWROUTE_WEBHOOK_TOKEN` (at least 32 characters) in the private API
configuration and the carrier callback. Do not put that token in tickets, GitHub,
or screenshots. An optional `FLOWROUTE_WEBHOOK_TENANT_ID` must match the default
tenant; quick signup does not create accounts for other tenants. Carrier outbound
SMS permission/10DLC is not used by this flow; inbound delivery must work.

The existing durable SIP worker commissions the newly created `awaiting_switch`
SIP account using the configured switch credentials and retries when unavailable.
Account creation is not proof of an operational SIP connection. Inspect **My SIP
account** after sign-in. No DID purchase, external calling authorization, balance,
or carrier plan is granted by SMS verification.

## Verification

Backend tests cover exact SMS parsing, recipient/tenant rejection, sender-derived
phone, expired/missing codes, replay, policy restrictions, duplicates, credential
hash storage, rollback on SIP record failure and authenticated webhook retry.
Browser tests cover instruction display, polling without credentials, password
clearing, completion, and profile account isolation. These use database fixtures;
a real carrier/SMS test and production MySQL deployment remain required.

For live acceptance, start signup yourself, text the displayed code from your own
phone, check account creation, sign in, save the profile, and verify switch status.
Do not send someone else's code or use the provider DID as a sender for this test.
