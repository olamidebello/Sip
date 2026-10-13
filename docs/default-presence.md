# Default user availability

New public registrations start Available, searchable within their workspace, and sharing their presence. Users can choose Away, Busy, Invisible or DND, turn off search, and turn off presence sharing using existing Privacy controls. Forwarded calls/messages still require separate consent.

The additive migration changes column defaults and creates defaults only for users without a presence row. INSERT IGNORE preserves every existing saved privacy/presence choice. Signup inserts the row in the same account transaction; the settings endpoint also initializes missing rows for other account sources. Available is a user availability setting, not proof of an online SIP registrar contact.

After exact-head deployment CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-contact-discovery.sh
```

Verify a newly registered user appears Available in workspace discovery, then opt out and confirm absence. Existing DND/invisible/private rows must remain unchanged after repeated migrations.
