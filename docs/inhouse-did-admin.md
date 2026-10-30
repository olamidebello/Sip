# Super-admin in-house DID inventory

Open Billing → Super admin: in-house DID activation and retention → In-house DID inventory and manual assignment.

Provision a starting +23420315… number and 1–1000 consecutive numbers in one licensed block. The selected workspace must have an allocated_ncc entitlement in did_requested_blocks. Existing numbers, owners, reservations and prices are preserved. New inventory has zero setup/monthly charges; new groups start with routing disabled until commissioned.

Find a number, select an available DID and subscriber (or enter the exact subscriber UUID), add an audit reason and apply Assign. Active subscription and verified Nigeria number are required; the existing per-number cooldown and first-call policy remain enforced. Manual assignment does not charge a wallet or create an invoice. It does not replace an existing assignment.

Enable/disable is limited to unassigned, unreserved inventory outside quarantine. Reclaim remains governed by the existing activity policy. All changes are scoped to the selected workspace, transactional and audited with actor, target and reason.

Deploy on the SIP server after active calls finish:

```bash
ansible-pull -U https://github.com/olamidebello/Sip.git \\
  -C main -d /opt/olamide-deploy-controller \\
  -i localhost, -c local \\
  deploy/ansible/inhouse-did-admin.yml
```

Refresh the app after deployment. Search returns up to 1000 matching inventory records; search a specific number to locate rows beyond the first page. No carrier provisioning, call, SMS or alert broadcast is initiated by these controls.
