# Olamide SIP

A development foundation for the Olamide softphone.

## What works

The browser client provides SIP registration over WSS, inbound and outbound WebRTC audio calls, answer/reject, hangup, hold/resume, and DTMF. Its account screen supports email and password registration, sign-in, session restoration, and sign-out through a Node.js API backed by PostgreSQL. Passwords are salted and hashed with scrypt; browser sessions use HttpOnly cookies.

The dialer also reads `apps/web/public/geofence-policy.json`. When enabled, it checks the browser's current location before an outgoing call and permits calls only inside a configured circular zone with acceptable location accuracy. The sample policy is **disabled** because no permitted areas have been supplied. Location is requested when checking or placing a call, rather than on page load.

## Run locally

Install Node.js 20 or later and PostgreSQL. Create a dedicated development database and user with permission to create tables. From the repository root, use separate terminals:

```sh
cd services/api
npm install
DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/olamide' PUBLIC_ORIGIN='http://127.0.0.1:5173' npm start
```

```sh
cd apps/web
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. The Vite development server forwards `/api` to the account service on port 8080. The API creates its tables at startup. Set `DATABASE_URL` only in the API process; never put database credentials in web code. Run `npm test` separately in `services/api` and `apps/web`.

Sign up with a name, email, and password of at least 12 characters, then sign in. **An Olamide account does not create a SIP extension, number, or calling plan.** To try calling, supply an existing test SIP account on a WSS and WebRTC enabled server with trusted TLS. SIP credentials are held in page memory and cleared on reload.

## Configure geo fencing

Edit `apps/web/public/geofence-policy.json`. For example:

```json
{
  "enabled": true,
  "maxAccuracyMeters": 100,
  "zones": [
    { "name": "Office", "latitude": 6.5244, "longitude": 3.3792, "radiusMeters": 500 }
  ]
}
```

Replace the example coordinates and radius with your permitted area. An enabled policy with no zones, denied or unavailable location, or insufficient accuracy blocks outgoing calls in the browser. The location policy is public to the client.

**Browser location checks are not enforceable security controls.** A modified client or SIP app can bypass them. To restrict actual service usage, validate location or another trusted authorization signal in the provisioning and SIP routing infrastructure; consider that device location can be spoofed. Incoming calls and SIP registration are not restricted by this prototype.


## Connected contacts, messages, and administration

Once two users have registered, sign in and add another user's email as a contact. Select the contact to view the last 100 messages and send plain text messages. Messages are stored in PostgreSQL and retrieved through authenticated API routes. This is a basic server-hosted inbox: it has no push notifications, media attachments, calls through the messaging account, group chat, delivery receipts, or end-to-end encryption. A user can add any existing account by email; consent and blocking controls are still needed before public launch.

An administrator can see counts for users, stored messages, and active sessions, and set the default WSS URL offered in the dialer. Administrator access is checked on the server. No account is made administrator automatically. After registering a trusted administrator account, a database operator may promote that specific account with:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

Use an account email you control and verify the affected row. The public WSS URL is a connection hint, not a SIP credential or provisioning system. Keep the API on a private interface behind the same-origin HTTPS reverse proxy for a real deployment; configure `PUBLIC_ORIGIN` to the exact browser origin.

## Requested features still in development

The following are not implemented: WhatsApp-level end-to-end encryption, rich media and group messaging; Zoiper-level multi-account and native OS calling integration; Cash App-like wallet, balance, transfers, cards, identity checks, and regulated payment processing; passkeys/biometrics, OTP, PIN, and device binding. Browsers generally do not expose a reliable device MAC address to web applications. Payment features require a licensed provider or a compliant banking integration, immutable transaction ledger, reconciliation, dispute and fraud workflows, and regulatory review before real money is accepted. Do not enter real payment credentials into this prototype.

## Deployment status

The repository is on GitHub, but the account API, database, and SIP infrastructure have **not** been deployed to a public server. A production rollout needs HTTPS on the web/API origin, database backups and migrations, abuse protection across instances, password reset and email verification, monitored hosting, and secure SIP account provisioning. The current in-memory per-IP API rate limit is only a local safeguard.

Future scope includes native Android and iOS clients, push calling, transfers, voicemail, conferencing, recording, messaging, carrier routing, and operational controls. No Acrobits code or branding is included.
