# Advanced super-admin feature menus

Seven ASTPP-style menu groups cover all 42 entries in the backend capability catalog: accounts/security, monitoring/reports, routing/numbers, communications/PBX, billing/payments, external integrations and portals/experience. Each feature has a direct `/admin#telecom-feature-ID` destination, current-page selection, category search and keyboard/mobile navigation. The detail page loads its status from the authenticated backend, supports refresh and links to working related controls when available. These advanced panels are restricted to super administrators, including direct hash navigation.

After exact-release CI passes, run:

```sh
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-advanced-astpp-navigation.sh
```

The installer deploys the current application, database migrations, grouped menus and prerequisite checks, then reports implemented versus incomplete/external features. It does not label a missing backend as installed simply because a menu exists. No enterprise module, portability adapter, fax engine or signing certificate is generated from the public feature name. Kamailio remains the production switch; the optional native GUI and PBX installation paths remain separate.

## Implemented Account Range

The Account Range page now has actual backend/database functionality: configure a tenant's numeric reference range, enable/disable new assignment, and assign the next available number to an active workspace user. Assignments are stable on retries. A locked counter and unique constraints prevent duplicate allocations. Exhaustion and bounds that exclude existing assignments are rejected; revision checks prevent stale configuration writes. Changes create security audit events. These reference numbers are independent of SIP usernames and native ASTPP customer IDs. Allocation is explicit through the admin page, not automatically applied to every new registration.

## Build and deploy implemented application components

`bash deployment/deploy-astpp-application.sh` pulls the release and runs the advanced application/API/database deployment followed by the isolated native Community GUI/database stages. Each stage uses its normal backups and CI gate. The command stops if the checked-out release changes between stages. Use `--without-native` for the Olamide/Kamailio application alone. `--with-paid-calls` additionally runs the existing validated paid-call cutover; use that option only in a maintenance window because it may restart Kamailio. The script does not write missing application code or install unimplemented vendor add-ons.
