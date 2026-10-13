# Phone registration diagnostics

The Calls keypad and contact picker now display the full current connection message and update it as registration changes. Retry SIP connection wakes the existing automatic registration controller; it preserves rate-limit cooldown and does not reset credentials or switch policy.

Deploy the CI-approved GUI:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-messaging-gui.sh
```

Reload the phone page. If registration still fails, provide the full message now visible in the keypad. The previous server probe passed for its selected account; that does not prove every user/tenant/client transport. This diagnostic change does not claim to repair an unidentified registration rejection. Use the existing backed-up SIP repair only for its documented local-realm/authentication scope.
