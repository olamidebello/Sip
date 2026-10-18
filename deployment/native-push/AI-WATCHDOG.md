# AI platform watchdog

Install after the working profile DID/SMS release:

```
ansible-playbook -i localhost, -c local deployment/ansible/install-ai-watchdog.yml
```

The playbook builds API and GUI, validates tests, preserves previous running images using the tested filesystem recovery helper, installs additive database tables and activates a host service plus a regression timer. API startup failures restore previous API/web images. It does not restart Kamailio during deployment.

## Super-admin navigation

Admin → Carrier controls → AI platform watchdog. This provides current service health, observed UI/control/navigation events, API error codes, recovery attempts, AI analysis jobs, event acknowledgements and older-event pagination. Settings control interface telemetry, automatic recovery and AI analysis with a limit of 0–24 analyses per tenant per hour (default 6). Host service recovery is controlled by the super admin in `WATCHDOG_HOST_TENANT`, defaulting to the platform's original tenant. Other super admins manage their own tenant's telemetry and AI analysis.

## Monitoring and recovery

The host checks Docker, API, web HTTPS, MySQL container state, TURN, Kamailio, RTPengine and the location enforcement watchdog about every 20 seconds. Database table readability and disk capacity are monitored. Events spool privately in `/var/lib/olamide-watchdog/events.sqlite` when the application/database is unavailable and upload when restored. Dashboard heartbeats become stale after two minutes; scheduled test results have a twenty-minute freshness threshold.

Known failed API, web, TURN, Kamailio, RTPengine and location services can be restarted after three consecutive failed observations, with a ten-minute cooldown and at most two attempts per component per hour. Docker and MySQL are never automatically restarted. API/web recovery pauses if MySQL is unavailable. The deployment lock prevents watchdog recovery during deployments. Kamailio configuration is validated before restart and the saved Flowroute carrier table is restored afterward. A successful restart request is logged separately from the next health result.

The last authorized recovery policy may be cached for up to one hour during an API outage. Systemd restarts the host watchdog itself if it exits. Maintenance uses the same `/run/olamide-update.lock` convention as deployments. Service restarts can interrupt affected sessions; the failure threshold and cooldown reduce unnecessary recovery.

Every fifteen minutes a timer runs fixed API/billing/DID and GUI regression suites in isolated containers with networking disabled, resource limits and no production credentials. A failing regression produces an event for investigation. These suites cover selected implemented flows; they do not automatically operate every business function or prove live carrier/payment acceptance.

## UI telemetry and privacy

The browser observes clicked controls, submitted forms, navigation changes, broken hash targets, control inventory counts, API failure status and JavaScript error categories. It never records field values, message bodies, passwords, GPS coordinates, authorization headers or exception text. Observations are bounded in batches; they are not guaranteed delivery during browser shutdown or disconnection. A click/submission is not treated as functional success. Events are retained for thirty days.

## AI analysis

AI receives only the last sixty error/warning event types, component identifiers, fixed codes and HTTP statuses. Actor identities, request bodies, raw logs and credentials are excluded. The Responses request uses `store:false` and a 700-token output cap. AI suggests diagnoses and review steps; it has no tools and cannot execute commands, modify configuration, purchase numbers, send messages or change balances. Automatic recovery is implemented separately through fixed allowlisted rules.

The server's existing `OPENAI_API_KEY` or `OPENAI_SUPPORT_API_KEY` is reused, as authorized. The Compose launcher reads the running API container's existing key into its child process environment without printing it or writing a secret file. The existing support model is preserved, defaulting to `gpt-4.1-mini` where none is configured. Key availability is reported only as a boolean. Live model access and quota must be verified on the server; a missing/invalid key produces an unavailable analysis state while deterministic monitoring continues.

Preserve `/etc/olamide/compose.watchdog.yml` alongside caller-ID, location, country and DID overrides on future deployments. Watchdog units are `olamide-platform-watchdog.service`, `olamide-watchdog-checks.service` and `olamide-watchdog-checks.timer`. To pause recovery, use the super-admin setting; for host maintenance, stop the watchdog service and checks timer or hold the shared deployment lock. The watchdog does not generate or deploy source-code fixes for arbitrary bugs.
