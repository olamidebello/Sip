# Requested ASTPP-style feature coverage

The provided catalog is recorded as 42 unique entries: 29 named add-ons, six additional premium entries (the premium PBX entry overlaps the named add-on), and seven combined platform capability groups. Administration → Overview & reports → Telecom feature catalog exposes implementation status, prerequisites and working links to existing control panels. Existing control links do not assert full feature parity; partial, missing and externally dependent features are labeled.

Run `bash deployment/deploy-telecom-features.sh` after exact-release CI passes. It backs up/migrates the existing application via the standard deployment, prepares private provider encryption, deploys the grouped catalog and inventories certificate/media/provider prerequisites. It installs standard certificate validation utilities. It does not issue provider account keys, import fictitious portability records, grant enterprise licenses or generate STIR/SHAKEN signing authority.

Optional native Community stages: `bash deployment/deploy-astpp-features.sh`. Kamailio prepaid integration: `bash deployment/deploy-kamailio-paid-calls.sh` in a maintenance window. No FreeSWITCH switch is installed. Native ASTPP and Olamide databases remain separate.

For additional PBX/media installation, the existing reviewed `pbx_node` role requires an official pinned Asterisk archive/checksum and complete configuration; an unreviewed sample cannot safely route production calls. Portability needs an approved dataset/API and an implemented lookup adapter. Provider account authorization, ACME/DNS ownership, signing certificates and live call acceptance cannot be inferred from file or process checks.

This is an implementation inventory and staged deployment of currently implemented components, not a claim that every advertised add-on or premium product has been rebuilt. New equivalents need domain-specific backend and GUI implementation, database changes, tests and controlled operational acceptance before being promoted from partial/pending.

## Optional reviewed PBX engine

The same installer can run the existing Asterisk build/configuration role with `-e telecom_install_pbx=true -e @/etc/olamide/pbx-reviewed.json`. That private input file must supply `pbx_source_archive`, its independently verified `pbx_source_sha256`, `pbx_version` and `pbx_config_source`. The role validates the digest, builds the engine, checks required runtime modules and enforces loopback-only signaling/management behind Kamailio. It does not supply caller routing or provider secrets by guessing. Without complete inputs, the PBX stage stops; default catalog deployment leaves existing PBX services unchanged. Use a maintenance window when enabling the optional engine.

## Caddy TLS inventory

The prerequisites check verifies the certificate actually served by the local HTTPS terminator on `127.0.0.1:443`, with SNI and hostname validation for `sip.dobhrap.com` and the system CA trust store. It works with Caddy's Docker-managed ACME certificates without assuming a host Certbot directory. `valid_for_at_least_14_days`, `expiring_within_14_days`, `verification_failed` and `unavailable` are distinct outcomes. Connection failures do not mean that a certificate is missing or expired. Public certificate expiry is reported; private keys and Caddy storage are never exported or modified. For a TLS terminator on another address, pass `--tls-host ADDRESS` to `tools/telecom_requirements.py`.

After updating, rerun only `python3 tools/telecom_requirements.py` from the checked-out server repository to refresh this read-only report. No certificate reissuance or application restart is required for this diagnostic fix. Other capability and provider-authentication statuses remain separate.
