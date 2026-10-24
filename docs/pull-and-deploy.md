# Pull and deploy SIP on an existing server

Run as root on the existing Debian SIP server. This updates the application from
`olamidebello/Sip` main. Docker Compose and the populated installation at
`/opt/olamide/repo` must already exist. For a new server use `deployment/install-all.sh`.

```sh
apt-get update
apt-get install -y ansible git
ansible-pull -U https://github.com/olamidebello/Sip.git -C main \
  -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/pull-and-deploy.yml
```

The controller checkout is separate from the live application. The playbook takes
the application deployment lock, fetches main, requires a clean fast-forwardable
server checkout, makes private source/configuration and MySQL backups, tags the
running API/web images, and rebuilds those two services. MySQL, SIP/RTP services,
and stored credentials are retained. Public HTTPS and internal API health checks
must pass. No carrier order or test SMS is sent.

If the live checkout contains edits or untracked files, deployment stops before
changing application files. Reconcile those integrations into Git first; this
playbook never resets, cleans, stashes, or overwrites them automatically.

On failure after checkout, the old source commit and, when necessary, saved images
are restored using the previous effective Compose configuration. Database schema
migrations are not automatically reversed. Backups remain under
`/opt/olamide/backups/pull-deploy-*` with root-only access; review migrations before
using a release requiring a database restore. A running app and a working MySQL
dump are required before deployment. Running again rebuilds and checks the release.

Detailed command output is saved to a root-only `/opt/olamide/backups/deploy-log-*`
file. Ansible displays a safe `SIP_DEPLOY_ERROR` phase and that log path on failure.
For example, `local_changes` means server edits need reconciliation; `git_fetch`
means the Git fetch failed; `container_build` means the image build failed.
Do not share private logs without reviewing them for credentials.
For an interactive run with the same private logging:

```sh
bash /opt/olamide-deploy-controller/deployment/pull-and-deploy.sh
```

This deploys code already on main. It does not implement the pending SMS quick-signup feature.
