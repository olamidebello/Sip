# User number porting through Flowroute

Users open **My profile → Port a number to Olamide**. This new workflow is separate from the historical Billing port-request draft form.

1. Check a US or Canadian +1 number's portability.
2. Enter the carrier account holder, service address, account number, optional transfer PIN and requested date. Business accounts also require the company name.
3. Confirm authority, save a draft, and upload a recent carrier bill (PDF, PNG or JPEG, up to 5 MB).
4. Explicitly authorize creation of the port order and acknowledge possible carrier charges. The background worker checks portability again, creates a Flowroute order, and uploads the document using Flowroute's signed S3 destination.
5. Review the actual LOA returned by Flowroute. Enter the authorized signer's name and title and authorize the transfer. The worker verifies that the carrier template has not changed before submitting the signature.
6. The worker polls authoritative carrier status every five minutes. Acceptance is displayed separately from completion. Carrier rejections require corrections to the existing order through support; this implementation never creates a replacement automatically.

Keep the losing-carrier service active until completion. Flowroute and the losing carrier determine approval and timing. The desired date is a request, not a guarantee. Completing a number port does not register the number for outbound SMS/10DLC. After completion, platform voice routing and any service billing remain administrator activation steps; this version does not assign free rental, create an unverified primary DID, or change live routing.

## Security and uncertain outcomes

Carrier credentials remain server-side. Existing `PROVIDER_CREDENTIAL_KEY` is required; the installer never replaces it. Account details, PINs, signatures and the temporary bill are encrypted with AES-GCM and request/tenant-bound associated data. The local document is removed from the encrypted payload after successful carrier upload. Public request responses omit those fields. Documents travel directly from the API to the carrier-provided HTTPS S3 URL; redirects and arbitrary upload destinations are rejected.

Requests are scoped by both tenant and user. Submission and signatures use a MySQL advisory lock to serialize actions across API replicas. Carrier creation is non-idempotent: `submitting` is stored before sending it. Timeouts and unrecognized/split carrier responses become `submission_unknown`; the worker never replays creation. LOA uncertainty is likewise held. This is conservative duplicate prevention, not a claim that the carrier supports idempotency keys.

Super administrators can list their tenant's requests at `GET /api/admin/number-porting`. To reconcile an uncertain submission, inspect the existing Flowroute order and POST `{ "providerOrderId": "12345" }` to `/api/admin/number-porting/REQUEST_UUID/reconcile`. The application retrieves carrier details and requires the exact request alias and number before attaching the order. No customer PII is exposed by the administrative list. Corrections, cancellations and carrier fees must be handled against the existing carrier order; no automatic cancellation is performed.

## Install on the production server

Fetch the feature files without replacing the production server/main files. Run `bash deployment/deploy-number-porting.sh` from `/opt/olamide/repo`. The launcher isolates Ansible from repository vault variables and acquires the standard deployment lock. It reads the running API's full Compose file list, preserving all existing mounts, countries/location/caller-ID/DID-storefront overrides, and the existing `.env`.

The additive installer validates known integration anchors, backs up only the server and UI files that change, then installs the route, migration, worker and profile hooks. Ansible builds both services and runs isolated mock-carrier tests before deployment. API health and unauthenticated access denial are verified afterward. New application tables are created on API startup. Installation does not submit a real transfer, sign an LOA, send email, change billing or replace provider credentials.

Prerequisites: Flowroute Porting API access, stored Flowroute API credentials (or the existing fallback environment keys), MySQL, Docker Compose, Ansible, and the provider encryption key. Public port-status callbacks are deliberately not trusted; authenticated polling is used instead. A database backup is recommended under the server's normal change procedure. The installer does not automatically roll back a failing API; source backups and prior Docker images remain available for operator recovery.

## Validation

- `node --test services/api/numberPorting.test.js`
- `node --test src/numberPorting.test.js` in `apps/web`
- `python -m unittest discover -s tools -p test_install_number_porting.py`
- `bash -n deployment/deploy-number-porting.sh`
- Ansible syntax check for `deploy/ansible/number-porting.yml`

No test calls a live carrier or submits a port. Live provider behavior and a completed real transfer must be verified during commissioning.

## Flowroute documentation

- https://developer.flowroute.com/api/porting/v2.0/check-number-portability/
- https://developer.flowroute.com/api/porting/v2.0/create-a-port-order/
- https://developer.flowroute.com/api/porting/v2.0/add-an-additional-document-to-an-existing-port-order/
- https://developer.flowroute.com/api/porting/v2.0/working-with-an-loa-letter-of-agency/
- https://developer.flowroute.com/api/porting/v2.0/submit-a-loa/
- https://developer.flowroute.com/api/porting/v2.0/view-port-order-status/
