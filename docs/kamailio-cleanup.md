# Kamailio-only production

Production uses Kamailio and RTPengine. Removed the optional switch cluster installer/profile, GUI shortcut, inventory rows and legacy XML carrier backend. Existing database tables and historical migration IDs are retained to preserve data. Native ASTPP is optional and independent; its upstream routes and attribution are retained. The carrier-console deployment no longer installs its GUI/database.

Run from `/opt/olamide/repo`:

```sh
git pull --ff-only origin main
bash deployment/deploy-carrier-console.sh
bash deployment/check-astpp-commissioning.sh
```

The default readiness check now tests the configured Kamailio private RPC socket and carrier table. It does not require a native ASTPP GUI or another switch. The commissioning flag alone does not prove calls, media or charging.

This release removes repository deployment paths; it does not delete server recordings, databases, packages or running containers. Inspect any previously installed auxiliary switch before decommissioning it. Do not stop a process carrying calls.
