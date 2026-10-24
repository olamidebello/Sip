# Preserve the locally modified SIP server

The live checkout contains custom carrier, billing, registration, UI and Compose
changes. The ordinary pull/deploy playbook correctly stops on `local_changes`.
Use this guarded additive rollout to install SMS quick signup, the limited Admin
system group and a visible Super Admin SIP trunks panel without replacing that
checkout or its configuration.

Run as root on the existing SIP server:

```sh
ansible-pull -U https://github.com/olamidebello/Sip.git -C main \
  -d /opt/olamide-deploy-controller -i localhost, -c local \
  deploy/ansible/local-features-preserve.yml
```

This command also applies the explicitly requested demotion of
**dg857641@gmail.com** to Admin after deployment succeeds. It revokes the account's
sessions and refuses to remove the last active Super Admin. A role-change refusal
does not roll back a successfully deployed application.

The rollout:

1. Locks deployment and creates root-only source, effective Compose, image and
   MySQL backups under `/opt/olamide/backups/local-features-*`.
2. Copies the installed source to a private staging directory, preserving local
   modifications and untracked integrations. It does not change the live Git HEAD,
   clean the checkout, upload files to GitHub or print environment contents.
3. Plans exact, narrow integration changes across eight shared source/test files.
   Unknown anchors or differing preexisting feature modules stop before writing any
   source. Existing Compose files, environment files, credentials and other local
   integrations are not promotion targets.
4. Builds distinct staged images, checks the local import graph without starting
   workers, runs the new backend and browser tests and the
   web production build, then applies additive schema setup.
5. Rechecks the touched live files and effective Compose configuration for concurrent
   edits, copies only the planned files, tags the validated images for the existing
   deployment and recreates API/web. MySQL, Kamailio and RTPengine are not recreated.
6. Verifies internal API and public HTTPS health. If promotion fails, it attempts to
   restore touched files and prior images; additive database schema remains. Detailed
   logs stay private. Do not delete the backups until acceptance is complete.

The stage may contain ignored private configuration, including old `.env` backups.
It is root-only and must not be committed, uploaded or shared as a debugging bundle.

The guarded installer supports the known registration/API bridge and navigation
integration shapes. It does not guess how to merge an unfamiliar implementation.
On failure, share only the `SIP_FEATURE_ERROR` and `SIP_FEATURE_DETAIL` lines. They
identify the stage and, for anchor failures, the source filename without exposing
SQL, passwords, environment values or full diffs.

After signing in as Super Admin, open **SIP & carriers → SIP trunks**. The panel
supports create, edit, delete, search, batch preview enable/disable, history and
credential-free export, and links to the existing carrier activation/checks panel.
Preview state is not evidence of a working SIP trunk or a commissioned carrier.
Carrier credentials and live activation remain in the existing protected carrier
controls. The new Admin group cannot use trunk administration.

For a clean checkout, the normal pull-and-deploy playbook remains available. This
additive rollout intentionally leaves Git showing local modifications.

Repository-wide API tests have existing failures for a missing country boundary
module, a billing fixture and route contracts. The focused feature tests, browser
suite, build and guarded staging tests pass. This rollout preserves installed
modules rather than replacing them with those unrelated baseline implementations;
the staged local import-graph check blocks promotion if an installed dependency is
missing. It does not prove carrier delivery or live call completion.
