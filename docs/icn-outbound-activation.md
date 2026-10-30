# ICN outbound activation

The full paid ICN adapter and deployment playbook are now implemented.
Use [ICN paid outbound routing](icn-outbound-paid-routing.md) for configuration,
deployment, wallet accounting, rollback and live acceptance instructions.

Deploy with `deploy/ansible/icn-outbound-activate.yml` and a reviewed activation
variables file. The older `icn-outbound-preflight.yml` is read-only and reports
installed files/hooks. It does not activate service or place calls.
