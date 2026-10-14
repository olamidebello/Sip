# Carrier console and native ASTPP GUI

Two interfaces are supplied:

1. Olamide Administration → Carriers & termination: a unified carrier console using Olamide's authenticated, tenant-scoped APIs. Trunks, acknowledged gateway state, scheduled buying/selling rates, fraud blocks and route preview are shown in searchable tables with dashboard counts. Management buttons open the existing live-bound forms, preserving their handlers and database validation. Super admins also manage encrypted Flowroute credentials and private adapter targets. Trunk preview states and tariff simulations remain labeled as previews; real calls require commissioned switch routing and charging.
2. The genuine ASTPP Community V6.0 web application from iNextrix/ASTPP, pinned to commit `9479778d1c9a325fc28b0265575f256703626077`. It uses its own native database, original GUI and login. Its database is not shared with Olamide, and data/credentials are not synchronized automatically. This package deploys the native web GUI/database, not native FreeSWITCH/media/charging. Those require a separate commissioning workflow before native termination calls are available. Enterprise/V7 paid modules are not installed.

## Unattended deployment

After deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-carrier-console.sh
```

The installer imports the existing full application deployment, database backup, schema migrations and exact-commit CI gate. It prepares provider encryption and deploys the carrier console. It then builds the pinned ASTPP web application and starts a separate MySQL database in Docker project `olamide-native-astpp`. Native services publish only HTTP `127.0.0.1:8089`; no database or SIP ports are published. Existing SIP registration and carrier adapters are not replaced.

Native keys and passwords are generated once in `/etc/olamide/native-astpp`, mode 0700, with private files mode 0600. ASTPP's seeded admin password is replaced with a random strong password, seeded non-admin accounts are disabled, and sample session rows are removed. Future starts preserve operator account changes and the existing encryption keys.

## Native access

From an operator computer, forward the private GUI:

```bash
ssh -L 8089:127.0.0.1:8089 root@154.29.77.102
```

Open `http://localhost:8089` on that computer. A mobile SSH client with port forwarding can provide the same local tunnel. Read `/etc/olamide/native-astpp/operator.json` on the server for the generated native operator login; do not send those credentials through chat or commit them. Native V6 uses a legacy PHP 7.4 runtime and legacy password/session compatibility. Keep it private through SSH; this installer does not publish the legacy GUI to the Internet. Its source download is `/astpp-source.tar.gz` within the native interface and excludes runtime keys and database contents.

## Verification and limits

CI builds and starts the actual native GUI/database and verifies an operator login and the trunk, gateway and termination-rate list/create pages. The installer checks the native login page. Native and Olamide databases are separate: editing an ASTPP gateway does not automatically update an Olamide gateway. The integrated console retains Flowroute as the default outbound provider, with no automatic carrier fallback.

A successful page/login or adapter acknowledgment is not a two-way media, DTMF, live billing, credit-cutoff, emergency-calling or capacity acceptance test. Native switch/media commissioning and account reconciliation are outstanding integrations. Back up the native database and private key directory together before modifying the pinned version. Do not delete its database volume to upgrade.

Upstream references: https://github.com/iNextrix/ASTPP and https://inextrix.atlassian.net/wiki/spaces/ASTPP7/pages/579177821
Native source retains ASTPP's AGPL-3.0 license and attribution. Olamide's carrier console is an independent interface using Olamide APIs; it is not an exact copy of the native ASTPP GUI.

## Next-stage commissioning inventory

## Kamailio production

See [Kamailio cleanup](kamailio-cleanup.md). Carrier-console deployment now installs only the integrated Kamailio console. Native ASTPP requires its separate explicit installer. The readiness checker defaults to Kamailio and tests private RPC without requiring the optional native GUI.
