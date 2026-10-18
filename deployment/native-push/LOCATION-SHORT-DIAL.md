# Location-aware short-number dialing

Install with `ansible-playbook -i localhost, -c local deployment/ansible/install-location-short-dial.yml`. This includes the preceding call sounds, encrypted audio/messages and country/location installers. Run without active calls because first-time switch configuration can require a restart. Preserve existing caller-ID, location and country-resource Compose overrides.

## Controls

**Super admin → Admin → Geofencing → Automatic country codes**:

- Enable automatic country-code prefixes (default Yes).
- Maximum digits to normalize: 4–9 (default 9, matching numbers less than ten digits).
- Allow saved primary country as fallback (default No). Turn this on only if using the profile country when current location is unavailable is desired. It can select a wrong country while traveling.
- Save and Refresh buttons use backend policy revision checks. Concurrent stale changes are rejected. Changes are tenant-scoped and logged in existing security events. Ordinary administrators cannot edit or read these controls.

## Dialing

The browser submits a short numeric destination to normal call authorization. Registered numeric SIP identities take precedence, including the existing cross-tenant denial. Otherwise the API looks for a fresh location lease bound to this user, tenant, session and IP; it can then accept a fresh browser location reading or use the configured trusted IP/VPN lookup. The saved primary country is used only when the administrator explicitly enabled that fallback. Profile address, language, phone country and browser language are not silently treated as physical location.

If a current country cannot be determined, the dialer requests device location once and retries. Permission denial, stale/uncertain readings or an ambiguous country produce a clear error; the user can dial a full international number beginning with `+`. Location supplied for normalization does not grant a geofence lease or bypass service restrictions. Browser coordinates can be approximate or spoofed, as documented for the existing location feature.

`libphonenumber-js` 1.13.15 uses country numbering metadata to form the E.164 destination and handle national trunk prefixes correctly, including the significant Italian zero. Examples: France `612345678` → `+33612345678`; Denmark `21234567` → `+4521234567`. An incomplete US seven-digit number still requires its area code; the implementation does not guess one. It checks possible number length, not subscriber existence or carrier acceptance.

Explicit `+` numbers, destinations of ten or more digits, and alphanumeric identities retain existing processing. One-to-three digit service/emergency codes are never blindly given an international prefix; they require an explicit service dial plan. The normal subscription, geofence, rates, caller-ID and switch authorization checks remain in force after normalization. The keypad, active-call identity and call history use the normalized destination.

This feature covers the platform browser and mobile WebView dialer via `/api/softphone/authorize`. Standalone third-party SIP clients that bypass this API must supply full international numbers or use their own configured dial plan; they are not silently normalized by this change.

New schema: `tenant_short_dial_policy`. Existing short-lived location tables and country boundaries are reused. No extra raw location history or telephone-number activity log is introduced. The API dependency and its lockfile are installed during the image build. The existing country deployment tests now validate normalization before updated containers are installed.

## Verification

Test one short national number inside its country, a registered numeric extension, a full `+` number and a ten-digit input. Test denied GPS, uncertain border readings and a missing current location with fallback off/on. Confirm the keypad and outgoing INVITE use the prefixed destination. Test each control as super admin and verify ordinary user/admin denial, tenant isolation and stale policy revision rejection. Confirm real calls are rated against the normalized international destination; live carrier acceptance remains a server/device check.
