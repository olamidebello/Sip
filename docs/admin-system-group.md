# Admin system group

The existing `admin` role is now a managed system group, below `super_admin`.
System membership is the authoritative `users.role` field, independent of ordinary
feature groups such as Standard. Creating or renaming an ordinary group to Admin
does not grant an administrative role. Policies are scoped to the selected tenant.

Super Admin → Users & access → Admin group access manages membership, enables or
disables delegated access, and grants these permissions:

- `users.read`: view tenant users.
- `reports.read`: view/export reports.
- `cdr.read`: view call records.
- `plans.read`: view plans.
- `plans.write`: create/edit plans (off by default).
- `support.manage`: manage tenant support tickets.

Admin has a separate workspace with the granted tools. All other `/api/admin/`
actions are denied by default at the server entry point. Personal routes run with
ordinary-user authority; support receives administrative authority only with its
explicit grant. Super Admin retains tenant/role/group management, provider keys,
payments administration, server management and all unlisted operations. Individual
handlers' tenant and role checks continue to apply after this central gate.

Policies are read on each request, so revoking a grant or disabling the group takes
effect without a service restart. Existing Admin accounts inherit the restricted
default on deployment. Policy updates require a current revision and are audited.
Membership changes revoke application sessions and are audited. The GUI cannot
change the acting account's role or remove the last active Super Admin across active
tenants. It cannot appoint new Super Admins.

## Requested demotion

Deploy the updated application and demote **dg857641@gmail.com** to Admin:

```sh
ansible-pull -U https://github.com/olamidebello/Sip.git -C main \
  -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/admin-group-demote-local.yml
```

The role change runs only after successful application deployment. It stops if the
account does not exist, the schema is unavailable, or no other active Super Admin
would remain. No account is created by this command. For a deployed installation:

```sh
cd /opt/olamide/repo/deployment/docker
docker compose exec -T api node manage-admin-group.js dg857641@gmail.com admin
```

A root-only CLI action is recorded with a reserved system actor identifier. This
change is not an automatic startup migration; it occurs only through the explicit
playbook, CLI, or Super Admin GUI.

## Existing deployment blocker

The server reported `phase=local_changes`. Identify the edited files without printing
credentials or full diffs:

```sh
git -C /opt/olamide/repo status --short
git -C /opt/olamide/repo diff --stat
git -C /opt/olamide/repo diff --cached --stat
```

Reconcile those integrations before deployment. Do not use `git reset --hard` or
`git clean` against the live repository. Database/source backups alone do not prove
local integrations are compatible with a new release.
