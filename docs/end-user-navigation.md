# End-user navigation and reference layout

The end-user default follows the supplied mobile references: **Chats, Updates, Communities, Calls**. Money and other business workspaces start hidden. Call shortcuts open contacts, scheduled calls, the existing SIP keypad, and saved favorites. Recent SIP call rows can redial; missed calls are highlighted. The Calls overflow offers Clear call log, Scheduled calls and Settings. Settings uses icon rows, a profile header, and working destinations for account, privacy, chats, notifications, linked sessions, lists, storage, appearance, language, accessibility, help and app releases. Invitation sharing uses the browser share sheet or a copyable public signup link.

## Super-admin control

Open Administration → Super admin → End-user navigation. Choose a user or group in the selected tenant, then set each extra page to Inherit, Allow or Hide. A user override wins over group settings. A group Hide wins over another group Allow. Without a grant, extras stay hidden. Save is revision checked; refresh after a conflict. Changes reach open browser sessions within 30 seconds and on login. Hidden pages cannot be opened through workspace or form-page navigation. Video invitation creation from a chat and joining a valid video invite remain available as part of calling when the existing meeting feature is enabled; the general Meetings menu stays an extra.

This is a presentation policy. Existing service feature checks and administrator roles remain authoritative on every backend action. Allowing a menu does not grant an administrator role, a paid plan, call-center access, or meeting privileges. Removing a menu does not revoke the underlying service permission; use Users & groups for that.

New additive MySQL tables:

- `user_navigation_policy` and `group_navigation_policy`: JSON overrides, revision and update timestamp; policies cascade on target deletion.
- `scheduled_calls`: private, user/tenant scoped scheduled SIP calls, maximum 100 per owner and tenant.
- `messenger_preferences`: account-scoped high contrast and reduced animation preferences.

Policy changes require super-admin authorization, are scoped to the selected tenant and recorded in security events. Scheduled calls are persisted reminders: users tap Call when ready. They do not automatically dial in the background, send push reminders, or reserve another participant's time. SIP call history contains browser-observed audio calls; video meetings keep their existing invitation workflow.

The UI retains Olamide identity and implements its own services. Meta account linking, Meta AI, WhatsApp subscriptions, WhatsApp backup/cloud sync and WhatsApp's private infrastructure are not implemented or presented as working integrations.

## Deploy

Wait for Deployment validation to pass for the exact GitHub main commit, then run on the server:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-messenger-features.sh
```

This full deployment backs up MySQL, builds API and web, applies additive migrations, restarts both and verifies public HTTPS health. It includes the SIP rate-limit/cooldown fixes. The web-only GUI installer is insufficient for these database and API additions.

After deploy, reload the browser. Verify ordinary-user four-tab defaults; allow Money for one user and Meetings for one group; verify another tenant cannot edit those policies; verify scheduled calls persist after reload and one user cannot remove another's; save contrast/animation preferences and check another account remains unaffected. Real-device two-user SIP and video media validation is still required.
