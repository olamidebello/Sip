# Automatic repair of the requested SIP feature rollout

Run as root on the existing SIP server:

```sh
ansible-pull -U https://github.com/olamidebello/Sip.git -C main \
  -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/auto-repair-all.yml
```

This is the automatic repair entry point for the observed locally modified server,
SMS routing integration and server-router layout failures. It stages quick signup,
limited Admin access controls and visible Super Admin trunk management, builds and
tests the staged source, verifies application health, and then attempts the requested
**dg857641@gmail.com → Admin** role change. Last-Super-Admin protection remains active.

## Compatibility repair

The installer parses the installed JavaScript router with the vendored Acorn parser
instead of searching for one particular API-bridge line. It supports bridge-present
and bridge-absent layouts, const/let authentication declarations, extra authentication
checks, and quote/whitespace variants. Other known integration fragments are matched
by JavaScript tokens when their original formatting differs. The existing SMS routing
guard and recipient selection remain intact.

Router insertion follows the existing request limiter and retains the origin guard.
New protected feature routes enforce authentication, mandatory password changes and
passkey requirements. Existing personal routes receive scoped Admin authority; the
account identity endpoint retains the real role.

The parser uses the existing API image in a temporary network-isolated container
with a read-only filesystem and controller mount. It receives source through private
stdin/stdout pipes, evaluates no application code and needs no host Node installation
or package download. The standalone parser and its upstream license are included in
the repository.

## Deployment preservation

The existing [preservation rollout](local-features-preserve.md) provides source,
configuration, database and image backups; separate staging images; backend/browser
checks; dependency checks; narrow file promotion; concurrent-edit detection; and
restoration attempts on promotion failure. Local Git history, Compose/environment
files, carrier configuration and unrelated source integrations are retained.

All supported integration checks run before source promotion. Unsupported semantic
layouts, ambiguous matches, missing prerequisites or locally changed feature modules
are reported together where possible. These cases remain blocked for reconciliation;
the repair does not replace unknown local logic to make a check pass.

Share only the safe `SIP_FEATURE_ERROR` and `SIP_FEATURE_DETAIL` lines if a check stops.
For example, a `check=server_authenticated_router` result identifies a router shape
that needs review without printing the installed source or credentials.

Live SMS delivery and SIP carrier commissioning still require their own acceptance
tests after deployment; an HTTP health result alone does not verify those services.

## Diagnose a failed test run without rebuilding

If deployment stops at `backend_tests` or `browser_tests`, run:

```sh
ansible-pull -U https://github.com/olamidebello/Sip.git -C main \
  -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/diagnose-feature-tests.yml
```

This reads the latest feature-deployment logs and emits `SIP_FEATURE_TEST` records
containing public test identifiers and fixed error codes. It does not rebuild,
restart services, change database records, alter user roles or print SQL/error
payloads. Unknown test titles and private file paths are omitted. Future failed
rollouts emit these same summaries automatically and retain complete TAP logs in
the private backup directory.

For helper-version mismatches, diagnostics also include public source file/line
locations, recognized property/method identifiers and Git-compatible blob hashes of
five known helper files from the failed staging snapshot. These hashes identify the
tested implementation without printing its contents. Credentials, SQL parameters,
unknown identifiers and private filenames remain excluded.
