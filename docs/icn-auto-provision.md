# Automatically provision ICN activation information

On root@sip run:

```bash
ansible-pull \
  -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller \
  -i localhost, -c local \
  deploy/ansible/icn-outbound-auto.yml
```

No `-e @file` is needed. The playbook creates the missing
`/etc/olamide/icn-activation.yml` atomically with mode 0600. It queries existing
active Nigeria rentals, assigned inventory, matching owners and tenants, and paid
purchase invoices. It discovers tenant UUIDs and selects the lowest active owned
number per user when no preferred DID has been saved. Existing preferences,
explicit tenant scope, prefix tariffs and carrier settings are preserved. If the
activation file is absent, a previously deployed runtime ICN configuration is
used when present. Existing files are backed up under
`/opt/olamide/backups/icn-provision-*`. No rental, wallet or approval database row
is changed by the provisioning step.

The chosen defaults are 60/60 customer billing, one concurrent call and a maximum
funded duration of one hour. The fixed buy/sell NGN rates remain in the paid
adapter. The carrier's actual billing terms are not inferred from these defaults.
Caller-ID format remains unconfirmed unless already explicitly saved. Carrier
approval is false unless already recorded. Destination prefix categories are
copied only from saved settings; the screenshot does not contain a complete
prefix deck, so no guessed prefix categories are installed.

The playbook lists missing carrier approval, caller-ID format, tariff prefixes
or active paid rentals. It runs the full activation playbook automatically only
when those fields are present; the activation validator still checks values,
server state, source compatibility and staged switch configuration. Geographic
policies, ICN caller-DID allowlists and group voice permissions remain enforced.
Saving a configuration is not proof of carrier connectivity or live activation.

The helper runs in a temporary API container using the existing service database
configuration; credentials are not printed or copied into the activation file.
The running API and web services are not replaced during information discovery.
