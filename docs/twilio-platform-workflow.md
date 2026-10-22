# Combined Twilio build workflow

`deploy/ansible/twilio-platform-local.yml` installs the **implemented** provider hub/roles, PIN/account OTP and new super-admin readiness report, in that order. It uses pinned reviewed source, source/image backups, tests, builds and health checks. Each stage holds the existing deployment lock while mutating application files. Failure stops later stages; successful earlier stages remain installed and retain their individual backups. This is not an atomic multi-stage rollback.

Default execution builds local code only. Set `twilio_provision_resources=true` using JSON extra vars to adopt/create supported Twilio resources with the encrypted keys already saved in the GUI. This provisions Verify services, Messaging Service, SIP trunk and IP authorization. It does not infer customer consent, buy DIDs, originate calls/messages or enable account authentication policies. Provide the existing Twilio termination domain with `twilio_domain` if a TK trunk is already configured.

Super admin > Providers & Routing > Twilio > Twilio feature readiness and controls shows all catalog products, current implementation/configuration status, account-check results and blockers. Existing hub forms still manage keys, four provider-role switches, product visibility/requirements, setup requests and cost-plus quotations. The report never exposes secrets or marks missing adapters as live merely because a profile is active.

**This workflow does not code or commission all Twilio products.** Twilio SIP termination, automated customer DID purchase/allocation, customer SMS/WhatsApp and least-cost routing remain missing runtime work. PBX/business registration/call-center onboarding and the single sign-in navigation also remain separate work. `twilio_require_all_live=true` deliberately fails until those requirements are actually implemented and accepted; it is not an override to force activation.

No live phone delivery, media acceptance, external regulatory approval or customer billing operation was tested during local development. A configured Verify Service also requires allowed destinations and actual successful delivery. WhatsApp requires business/sender onboarding and approved templates where applicable; those account approvals cannot be manufactured by an Ansible build.

Examples:

```sh
ansible-playbook -i localhost, -c local /root/twilio-platform-local.yml
ansible-playbook -i localhost, -c local /root/twilio-platform-local.yml \
  -e '{"twilio_provision_resources":true}'
```

Local test coverage includes protection against false live statuses, provider-role gating, super-admin authorization, safe rendering and read-only account checks. Existing child playbooks run their own backend/browser tests on the host before replacing running services. Host credentials are not passed as command-line arguments or printed by this workflow.
