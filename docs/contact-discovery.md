# Contact discovery and registration alerts

After exact-head CI passes, deploy both subscriber delivery and discovery:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-contact-discovery.sh
```

The workspace directory supports name/email search and exact international profile phone search (e.g. +2348012345678, allowing spaces, parentheses and hyphens). User Privacy must enable discoverability. Results remain same-tenant, active users only; hidden presence is not revealed. Profile phone matches are discovery hints, not proof of number ownership and are never used for automatic SMS/call interception.

In-app alerts match saved imported contacts by exact email or an unambiguous international phone. They detect registered discoverable accounts on initial check and catch up when the app next opens; they do not claim each match registered just now. The MySQL ledger keeps one alert per owner/contact and persists dismissal. Polling every minute while signed in shows a Chats banner and a Settings list with Add to chats and Dismiss. Settings also provides an independent alert enable/disable switch. Discovery privacy changes suppress alerts from nondiscoverable users. Adding contacts requires an explicit button press.

The browser uses the existing authorized contact import pipeline. It cannot read or continuously monitor the phone's address book without permission/import. These are in-app alerts, not native OS push notifications. Disabling alerts hides them; re-enabling can redisplay previously unread matches. The installer uses the existing CI-gated backup/build/migration/restart workflow and includes subscriber SMS delivery and call controls. No provider credentials or phone verification are provisioned.

The web build also repairs CAPTCHA lifecycle: loading disables signup, refresh responses are generation-guarded, expired challenges refresh when the form is focused or submitted, failed signup obtains a new single-use challenge, and successful signup keeps its confirmation message. CAPTCHA validation is not bypassed.
