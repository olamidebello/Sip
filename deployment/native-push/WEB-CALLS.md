# Browser incoming-call alerts

The browser subscribes only after the user clicks **Enable incoming-call notifications**. Previously granted subscriptions are renewed at login. Delivery uses the existing native-push job queue, authenticated SIP wake hook, session expiry, account/tenant checks, and DND suppression. Android FCM and iOS APNs paths remain separate.

Configure on the server as root:

```bash
python3 deployment/native-push/configure-web-push.py --email dobcalldemo@gmail.com
```

This generates and preserves VAPID keys under `/etc/olamide/native-push`, synchronizes a private hook token, and adds only the Web Push environment entry to the existing Compose file. It preserves custom ports and local presence changes. Rebuild `api` and `web`, run `node --test nativePush.test.js webPush.test.js` in the built API image, then recreate only those containers.

This does **not** install or restart SIP routing. The active registrar must invoke the authenticated wake endpoint and hold an authorized local call while its recipient re-registers. The repository's `olamide-push.cfg.j2` is a reference, not a complete drop-in configuration: media handling, record routing, authenticated REGISTER branch append, retransmissions, cancellation, timeout, and stale connections must be tested together. Do not claim background ringing is active until a real closed-page test succeeds.

Push notifications do not preserve the browser WebSocket or continue an active media call after the browser exits. Delivery depends on browser/OS push support and notification permission. Tapping an alert focuses or opens the same-origin app; the existing auto-registration logic reconnects it. Force-stopped browsers/apps and disabled OS notifications can prevent delivery.

Android additionally needs matching Firebase app configuration, a rebuilt native app with the push plugin, and a service-account file uploaded directly to the server. Do not commit credentials.

Verification:

1. Run API `nativePush.test.js` and `webPush.test.js` and web `browserPushClient.test.js` and `callPushWorker.test.js`.
2. Confirm unconfigured installations do not prompt for notification permission.
3. Sign in and explicitly enable notifications. Check registration succeeds without exposing endpoint tokens in UI/logs.
4. Test wake requests from the trusted local SIP hook. Confirm a notification appears with the page closed, opens the app, and the held call reaches the re-registered device.
5. Confirm logout/session expiry and DND block delivery, and cancellation/timeouts do not leave a ringing call.

Browser tests use mocked browser APIs and push delivery; they do not prove live provider delivery or SIP wake routing.
