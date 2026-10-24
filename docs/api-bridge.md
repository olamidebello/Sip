# Application API bridge

Deploy with `deploy/ansible/api-bridge-local.yml`. Requires the installed hosted-account integration, Docker Compose, and the grouped administration workspace. Deployment backs up sources/images, runs backend/UI tests, creates the additive key table, checks health and verifies that anonymous bridge requests return 401. It does not create API keys or make remote purchases.

Open **Administration > System Settings > API bridge & application keys** (or search Administration for “API bridge”). Create a key with a label, expiry (1–365 days) and explicit scopes. The complete key is shown once; only a SHA-256 hash and short display prefix are stored. Copy the assigned instance UUID too. Test keys with `status:read`; create and test a replacement before revoking an old key. Keys apply to the super administrator's currently selected tenant. Suspended tenants, revoked keys and expired keys cannot authenticate.

Send keys in `Authorization: Bearer obk_...` over HTTPS, never in query strings or browser public code. Keep keys server-side in the connecting application's secret store. Status: `GET https://sip.dobhrap.com/api/bridge/v1/status`, scope `status:read`. A successful response reports `status: ready` and the assigned instance ID. Limits: 60 accepted requests/minute/key, in addition to existing server limits. No generic proxy or arbitrary upstream URL is exposed. Revocation stops subsequent authentication; already accepted requests may complete.

`POST /api/bridge/v1/accounts`, scope `accounts:provision`, uses the existing hosted-account provisioner. JSON fields:

- `instance`: the UUID assigned to this key (a different instance is rejected).
- `owner`, `tenant`: external numeric identifiers, 1–18 digits; repeat the same identifiers for idempotent account lookup.
- `kind`: `personal` or `organization`.
- `role`: `user` (personal) or `user`/`admin` (organization); never `super_admin`.
- `email`, `name`, optional `company`.
- `password`: a server-generated base64url string of 32–128 characters; do not reuse an end user's existing password.

New organizations receive a separate internal SIP tenant; users receive an internal SIP account and organizational users receive a PBX extension. Existing email accounts are not automatically linked or taken over. Existing mapped accounts are not password-reset by replay. PSTN calling, carrier commissioning, DID purchases, SMS, payment APIs and AI providers are separate integrations. This bridge does not grant them.

The legacy shared-token hosted-account endpoint remains available for existing integrations. New keys use a server-generated instance identity and therefore do not silently adopt legacy instance mappings. Management endpoints require a super-admin session: GET/POST `/api/admin/api-bridge/keys`, POST `/api/admin/api-bridge/revoke` with an `id`. A key can create a replacement for its own instance through super-admin management using `rotateFrom`; API-key authentication itself cannot manage keys.
