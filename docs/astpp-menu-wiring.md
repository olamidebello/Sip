# Exact ASTPP menu wiring and application catalog modules

The pinned ASTPP Community commit is `9479778d1c9a325fc28b0265575f256703626077`.
`deployment/native-astpp/menu-wiring.json` resolves all 51 navigation entries to their controller methods, module model files and literal references to upstream database tables. Fifty entries have controller methods. The `opensips/opensips_list/` entry has no upstream module and the GUI now displays that missing dependency instead of providing a broken link. Repeated Localizations entries intentionally preserve upstream navigation.

The manifest is a source inventory, not proof of working CRUD or production service integration. Table references discovered from literal names are not exhaustive. PHP runtime validation checks installed controllers, model files and referenced tables for each menu in sequence. Authenticated HTTP checks then load available menu pages (excluding Addons, whose upstream GET changes directory permissions) and reject login redirects, missing logout/session content and common PHP/database error pages. This does not exercise Ajax requests, create records, send messages, place calls or prove permissions beyond the native operator session.

## Install and check in order

On the application server:

```sh
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-astpp-application.sh
```

This uses the existing application deployment, migrations and dependency installation, followed by the isolated native GUI/database installation and ordered menu checks. Existing private database credentials and backups are preserved. Native ASTPP uses its separate MySQL database and PHP runtime. Access its GUI through the existing private SSH tunnel on port 8089. Kamailio remains the production switch. Native FreeSWITCH profiles, gateways and devices do not automatically configure Kamailio.

To repeat native checks after installation:

```sh
bash deployment/deploy-astpp-features.sh --tags native_menu_wiring,native_menu_http
```

An unavailable upstream module is reported explicitly. Failed checks for a supported module stop deployment. A successful source/schema or HTTP check never changes a feature to live-call accepted.

## Implemented application modules

| Application menu | API | Database | Behavior |
|---|---|---|---|
| Call types | `/api/admin/tariff-catalog/call-types` | `telecom_tariff_catalog` | List, create, edit, enable/disable |
| Rate groups | `/api/admin/tariff-catalog/rate-groups` | `telecom_tariff_catalog` | List, create, edit, enable/disable |

Both pages have actual forms connected to their API. Records are tenant scoped and super-admin restricted. Updates compare revision numbers; duplicate names return a conflict. Changes and security audit entries commit together. Lists are paginated. Records may be disabled instead of deleted. The normal startup migration creates the table and indexes. These catalogs are separate from native ASTPP `calltype`/`pricelists`: live rating, user assignment and synchronization remain pending, and coverage stays `partial`.

## Rebuild source evidence

Check out the exact upstream pin, then run:

```sh
python3 tools/build_astpp_menu_manifest.py --source /path/to/ASTPP --output deployment/native-astpp/menu-wiring.json
```

The generator rejects an upstream revision that differs from the runtime pin. Enterprise add-ons, external merchant/CRM/portability authorization and live billing/media acceptance remain separate implementation work.
