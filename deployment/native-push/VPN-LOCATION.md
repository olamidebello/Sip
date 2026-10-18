# VPN permissions and geofence enforcement

Install on the existing Kamailio/RTPengine host, with no active calls:

```bash
ansible-playbook -i localhost, -c local deployment/ansible/install-vpn-location.yml
```

The playbook builds the API/web, tests location and billing behavior, creates tables through API startup migration, validates and backs up the switch configuration, installs internal dialog tracking, restores the saved Flowroute trunk after a switch restart, and enables `olamide-location-watchdog.service`. It preserves existing geofence zones and leaves geofencing disabled if no policy exists.

## GUI

- **My profile → Allows VPN:** default Yes; effective value is visible to every user. Only super administrators can change it.
- **Admin → Geofencing → VPN and location access:** set user overrides or group policies. A user override wins. Without a user override, any group denial wins; otherwise Yes is the default. Use the inherit checkbox to remove an override.
- **Admin → Geofencing:** only super administrators can configure or disable geofences, preventing restricted accounts from clearing their own restrictions.
- **Location banner → Enable location / Retry:** grant the browser permission or retry a failed location check.

## Enforcement

With no enabled, populated geofence, services remain available everywhere and device location is not requested. When a geofence is active:

- VPN allowed: the app requests high-accuracy device location, uses a movement watcher, and obtains a fresh reading every 15 seconds. The server validates coordinates, uncertainty, age and zone membership and issues a 45-second session/IP-bound lease.
- VPN disabled: the server requires trusted IP/VPN classification and IP geolocation. A missing or failed provider blocks geofenced service; client claims about its IP or VPN status are ignored.
- Protected HTTP service calls validate the current policy and lease. Authentication/account recovery and super-admin configuration remain accessible so an administrator can repair a policy.
- SIP call admission validates a caller device proof carried by the app, binds it to its location session, and validates recipient leases for internal calls. Plain SIP clients without a location-capable companion cannot make geofenced calls. A host watchdog evaluates tracked confirmed dialogs every five seconds and sends BYE when location permission expires or becomes invalid. Existing dialog/billing events settle terminated calls.
- Meeting sockets validate the current lease every five seconds and on messages.
- Policy changes invalidate leases automatically through a policy fingerprint.
- Expired coordinate records are deleted every 30 seconds. Only the latest short-lived session reading is retained. IP addresses are hashed in lease records. No location history is added.

Browser location is reported by the device location API, not proof of physical GPS. Browser/OS background suspension or denied permission prevents fresh readings, so geofenced service pauses. This feature cannot turn on GPS hardware or override OS permissions. It does not guarantee detection of every VPN or GPS-spoofing tool.

## Optional trusted IP/VPN lookup

Default-Yes users use device location without any IP lookup provider. To permit VPN-disabled accounts while a geofence is enabled, supply a trusted server-side lookup endpoint in a private Ansible variables file:

```yaml
location_ip_lookup_url: https://your-trusted-location-service.example/lookup
location_ip_lookup_token: your-private-token
```

Run with `-e @/etc/olamide/location-vars.yml`. The endpoint receives a GET request with a server-derived `ip` query parameter and optional `Authorization: Bearer ...`. It must return:

```json
{"latitude":32.8,"longitude":-96.8,"accuracy":10000,"isVpn":false}
```

Accuracy is an uncertainty radius in meters. IP locations are often too coarse for small geofences; the existing maximum-accuracy setting and zone radius must be suitable. Set `isVpn` from a trustworthy classification source. Redirects and client-provided endpoints are not accepted. HTTPS is required except for loopback or the optional internal host `location-ip`.

The playbook saves this runtime override privately at `/etc/olamide/compose.location.yml`. Include it, alongside `compose.callerids.yml`, in later API deployments. Rerunning without lookup variables preserves the existing override. There is no bundled commercial VPN classification dataset or native background-GPS implementation.

## Verify

1. With geofencing disabled, deny browser location permission and verify services still work.
2. Enable a suitable zone using a super-admin account. Verify an ordinary user cannot change VPN or zone policy.
3. Test inside/outside and low-accuracy readings; stop location permission and verify API, meeting and SIP restrictions after lease expiry.
4. Check `systemctl status olamide-location-watchdog` and its journal. Test an internal and a carrier call on the actual switch; RPC format and device audio/permissions need live acceptance testing.
5. Test group inheritance, explicit user overrides, and removal of overrides.
