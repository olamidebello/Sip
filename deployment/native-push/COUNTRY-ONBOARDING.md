# Country onboarding and event tracker

Run `deployment/ansible/install-country-onboarding.yml` on the existing server with no active calls. It builds and tests API/web, downloads a SHA256-verified country polygon dataset, mounts it read-only, migrates tables through API startup, installs the existing location watchdog and verifies the application catalog. It preserves private IP lookup settings. It may restart Kamailio on a first location installation.

## User navigation

- Registration → Service countries: multiple selection, Select all, primary country. One country becomes primary automatically; multiple countries require an explicit primary.
- My profile → Service locations and profile: change service countries and primary country at any time. Saving sets language/currency preferences from the primary country; the existing Language, country and currency screen permits later manual changes. This does not translate interface text, convert balances, or change invoice/billing currencies.
- My profile → Manage bio data: maintain phone/address fields. Name/email remain in the existing account controls. No new biometric or date-of-birth collection is introduced. These are self-reported contact details, not identity or ownership verification.
- My profile → My event tracker: refresh or page older profile, country-selection, completeness and location-access transition events.
- Super admin → Admin / Geofencing / Service event tracker: workspace event history. Existing provisioning controls retain their deployment/provisioning history.

Existing accounts remain unrestricted by a personal country fence until they choose locations. No countries are inferred from an old address. Registration requires a selection for new accounts. The profile prompts existing users to complete location onboarding.

## Location rules

Country selections use actual country polygons rather than broad circles. The existing administrator geofence remains an additional restriction. Selecting all countries removes the personal country restriction but cannot remove the administrator's policy. Saving countries invalidates previous location leases through the existing policy fingerprint. VPN/GPS requirements and the 45-second lease apply to personal country restrictions too. All countries with no administrator fence requires no GPS.

The Natural Earth-derived dataset contains supported country/territory polygons for 237 of the 249 ISO country/territory entries in the catalog. Unsupported individual entries are labeled in the UI and rejected by the server, while Select all remains available. This cartographic dataset is not a statement of legal borders. Boundary tests use an uncertainty radius plus a 100-meter buffer; locations near borders/coastlines may be rejected. Browser positions may be approximate or spoofed and can stop when the OS suspends the browser. There is no native background GPS or biometric verification.

The boundary download is checksum-pinned: if upstream changes, installation fails rather than silently adopting new boundaries. For a reviewed replacement pass `country_boundary_url` and `country_boundary_checksum`. Preserve `/etc/olamide/compose.countries.yml`, `/etc/olamide/compose.location.yml` and `deployment/docker/compose.callerids.yml` for later deployments.

## Profile checks and history

The worker checks up to 100 active profiles each minute and cycles through the user population; it records changes to completeness and a last-check time. The signed-in profile screen refreshes every minute while visible and not being edited. This is a structural completeness check, not continuous verification of real-world biographical facts. Coordinates and device lease proofs are excluded from the event log. Only location allowed/denied transitions are logged, not every heartbeat.

New tables: `user_service_countries`, `user_service_events`, `user_profile_health`, `user_location_event_state`. Events are append-only through these routes, tenant-scoped, and cursor-paginated. No automatic deletion of history is introduced. Existing location coordinates still expire through the lease cleanup process. User locale preferences use the existing `user_locales` table.

## Data sources

Country polygons: https://github.com/datasets/geo-countries (Natural Earth; public-domain country data). SHA256: `392a03db8aa3ba82c105852655620129b11182b95dfc34ef046827ea7d0e5b8c`.

Language/currency defaults: Unicode CLDR 48 supplemental territoryInfo and currencyData, https://github.com/unicode-org/cldr-json . Generated from the most widely used national official/de facto official language where available, otherwise the largest reported language, and current tender currency. Multilingual/multicurrency defaults are initial preferences, not a claim of exclusivity. Data is provided under the Unicode License v3, https://www.unicode.org/license.txt .

## Acceptance checks

Register with one/multiple/all countries; reject a primary outside the selection. Verify primary changes update language/currency, and manual locale preferences can then be changed. Confirm selected country admission and outside-country rejection for API, calls and meetings, and test lease expiry. Confirm administrator circles still restrict users who select all. Verify the event tracker has no coordinates, tokens or passwords; normal users cannot read workspace events. Verify profile edits, missing-profile creation and ongoing completeness status. Test mobile browser permissions/background suspension and the real switch watchdog on the target host.
