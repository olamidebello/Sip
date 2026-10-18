# Login profile-completion landing

Install `deployment/ansible/install-profile-completion.yml` with no active calls. It includes the preceding short-dial, calling sounds, encrypted communication and country/location deployment tasks. New readiness tests run in the existing country installer before containers are updated. No additional profile tables are required; existing user_profiles, user_service_countries and user_locales records are checked on the backend.

After password, LDAP or passkey login, or restoration of an existing session, `/api/account/profile-readiness` checks the signed-in account's required phone/address fields, selected service countries, primary country and language/currency preference record. Missing or invalid records default the landing page to Account / My profile, with a list of required fields and a Complete setup / Check again button. Required password-change and passkey setup flows retain priority. The profile and country forms already use the authenticated backend and can create a missing profile row. Saving service countries also sets initial locale defaults. Users may keep manually chosen valid language/currency preferences.

The completion button requests a fresh backend result. If incomplete, it remains on the profile and updates the required-field list. If complete, the banner is removed and normal home navigation resumes. A failed readiness request does not mark the profile complete. This is a login landing rule, not a new blanket service suspension or identity/biometric verification requirement. Existing permission, geofence, subscription and carrier authorization remain in force.

## Wired controls

- My profile / Manage bio data: authenticated GET/PUT `/api/account/biodata`, existing profile schema and validation.
- My profile / Service countries: authenticated GET/PUT `/api/account/service-countries`, country selection, primary-country validation and locale defaults.
- My profile / Complete setup: authenticated GET `/api/account/profile-readiness`, account landing and home navigation.
- Super admin / Admin / Geofencing / Automatic country codes: authenticated GET/PUT `/api/admin/short-dial`, tenant policy table, role checks, revision validation and security event.
- Dial / Place call: POST `/api/softphone/authorize`, optional GPS retry for short national numbers, then the existing call/SIP/billing routes.
- Existing profile/service event trackers remain available under My profile and super-admin Geofencing.

## Checks

Log in with a missing profile, missing country selection, invalid primary and missing locale. Verify each lands on My profile and that completing only one form does not pass other missing requirements. Complete both forms and recheck. Confirm existing complete users keep their normal landing, password/passkey setup still wins, and session restore follows the same check. Test backend failure and logout during a pending login check. Validate both normal-user and super-admin settings using two separate tenants on the deployed server.
