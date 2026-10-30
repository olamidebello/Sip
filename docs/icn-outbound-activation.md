# ICN outbound activation readiness

Run on root@sip:

```bash
ansible-pull -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller \
  -i localhost, -c local deploy/ansible/icn-outbound-preflight.yml
```

This is a read-only preflight, not a live activation script. It intentionally
returns failure because the repository currently has no commissioned ICN
termination adapter. It prints fixed readiness fields without printing private
Kamailio configuration or credentials.

Known peer: 196.216.253.173:5060/UDP. Carrier media IP: 196.216.253.174.
Local public signaling/media IP: 154.29.77.102. Local RTP range: 30000–40000/UDP.
Destination national formatting comes from the supplied ICN form. Caller-ID
format, carrier source-IP authorization, carrier RTP range and billing intervals
remain unconfirmed.

A complete activation implementation must preserve purchased DID ownership,
tenant isolation, geographic policy, call concurrency, wallet reservation and
settlement. USD display-only FX must not silently become a billing rate.
Do not mark the trunk commissioned or enable a direct SIP bypass before those
parts exist. This playbook makes no billable test calls and changes no services.
