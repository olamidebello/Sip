# User addresses in location capture reports

The Super Admin location report now shows a **Current profile address** column.
It combines address lines 1 and 2, city, state/region, postal code and country from
the selected user's current profile. Missing profiles or empty addresses retain the
check-in and display **Not provided**.

The address is not reverse-geocoded from GPS and is not a historical address snapshot.
The report retains the original latitude, longitude, accuracy and capture timestamp.
Its CSV includes the combined address and individual address fields, with CSV quoting
and spreadsheet-formula protection for user-supplied text.

Location-report access remains limited to Super Admin in the selected tenant. The
profile is joined through the tenant-bound report user; no request-supplied tenant or
user identifier changes report access. Existing consent, retention and audit behavior
is retained. No new address lookup provider or API key is needed.

The `auto-repair-all.yml` rollout includes this update while preserving unrelated
server changes. If deployment stops at backend tests, first use the read-only
[feature-test diagnostic playbook](auto-repair-all.md) to retrieve safe failure names.
