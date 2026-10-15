# Operator requirements installation

Operator feature panels now link to server management. Super administrators can select an enabled switch node and click **Install Operator requirements**. The API creates a durable `operator_setup` job; the private worker renews its lease and reports completion or failure in the existing job history. Installation is asynchronous; “queued” does not mean “installed”.

## One-time application host bootstrap

After deployment CI passes for the exact checked-out release, run as root:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-advanced-astpp-navigation.sh
bash deployment/install-operator-requirements.sh --enable-gui-runner
```

The installer requires Debian 12+, Docker Compose, the deployed application and a root-owned `/etc/olamide/secrets.env` with private permissions, containing `DOMAIN` or `PUBLIC_ORIGIN`. It preserves an existing `DEPLOY_RUNNER_TOKEN`, generates one if absent, and reloads the API environment during bootstrap. It creates private worker configuration and enables `olamide-operator-runner.timer`. Keep only one local fleet worker timer active; an existing separately configured fleet runner can instead consume this new action after its code is updated.

Register this host under **Server & network operations**, using its IPv4 address as an enabled switch node. The private local binding defaults to the IPv4 resolved from the configured domain. Behind NAT or a CDN, set `OPERATOR_LOCAL_HOST` in the private secrets file to the server's registered IPv4 before bootstrap. Remote registered hosts require a trusted SSH known-host entry and a key with root or passwordless sudo access; the same validated release must already be present at `/opt/olamide/repo` there. GUI jobs do not pull a different release or accept shell commands.

## What is installed

Ansible installs ansible-core, Python, Git, curl, jq, OpenSSL, CA certificates and the SSH client. It checks that all 86 frontend feature records exactly match the backend catalog, and reports every incomplete feature. Repeated runs preserve secrets and request packages with `state: present`. Root installation is restricted to a fixed script and the exact release must have a successful deployment workflow. Failed installation output stays in private `/var/log/olamide/operator-*.log` files; the GUI receives a bounded summary without credentials.

## Remaining functionality

This installs supported management prerequisites; it does **not** implement every Operator feature. Taxes, invoice templates, shadow billing, scheduled reports and other catalog entries still require application code. Fax, CRM, payments, portability and STIR/SHAKEN need their corresponding integrations or approved provider credentials. The private native console retains its separate authentication and database. Configure switch modules through **Kamailio services**, provider credentials through **Carrier credentials**, and test real registration, media, paid calls and billing before considering those services operational.

Inspect worker status with `systemctl status olamide-operator-runner.timer` and `journalctl -u olamide-operator-runner.service`. Disable polling with `systemctl disable --now olamide-operator-runner.timer`; an already-running installation must finish before another begins.
