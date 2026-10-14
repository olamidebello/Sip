# ASTPP navigation and backend coverage

The super-admin Administration menu includes core ASTPP navigation groups plus the existing add-on groups. Each submenu has a unique deep link, searchable label, implementation status and a link to related existing controls. Navigation does not install the commercial ASTPP package.

## Integrated records

Customer, carrier, extension, trunk, rate, inbound-route, plan, locale, CDR and report screens load their existing authenticated API endpoints. Edits use the related existing controls and their existing validation and authorization.

New read endpoints:

- `/api/admin/telecom/resources/invoices`: tenant invoices.
- `/api/admin/telecom/resources/charges`: PSTN reservations and settled call charges.
- `/api/admin/telecom/resources/audit`: tenant security events.
- `/api/admin/telecom/resources/low-balances`: wallet balances below `thresholdCents` (default 1000).

All four require admin or super-admin access. Pagination uses `limit` (1–200, default 100) and `offset` (0–100000). SQL binds tenant and pagination values and explicitly selects public columns. Results are bounded snapshots, not proof of service delivery or payment settlement. Data errors appear on the page; no sample data is substituted.

## Deployment

Use the existing `deploy/ansible/advanced-astpp-navigation.yml` deployment chain; it now checks frontend/backend catalog equality without fixing the catalog size at 42. This change adds no database migration. Existing PSTN, wallet, invoice and security migrations must have completed.

## Remaining implementation

The catalog retains explicit gaps for reseller hierarchy/commissions, calling cards, caller-ID billing, rate-group administration, number localization, automated reporting, fax/PBX media, portability data, STIR/SHAKEN credentials and CRM connectors. These require implementation and/or approved external services. Full ASTPP parity and full live-call acceptance are not claimed.

Run the API telecom resource tests and browser navigation tests before deployment. Verify live provider calling, two-way audio, credit enforcement and settlement separately on the target environment.
