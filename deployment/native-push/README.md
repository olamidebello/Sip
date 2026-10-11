# Native call notifications and experience deployment

The rollout deploys existing Olamide GUI/messaging features, optional Android FCM notifications, and an optional Kamailio late-branch profile. It does not implement every WhatsApp feature or interoperate with WhatsApp.

Run from an Ansible controller with server SSH and private GitHub read access:

```bash
bash deployment/deploy-experience.sh /secure/inventory.ini /secure/native-push.local.yml
```

Start with `config.example.yml` and `inventory.example.ini`. Set `deployment_ref` to a release that passed CI. Firebase inputs must come from the same actual Firebase project: a service-account JSON with FCM send access, and Android `google-services.json` for `com.dobhrap.olamide`. The installer generates a 32-byte internal hook secret and synchronizes server secrets automatically. Private keys never go into the APK or repository. Optional `auto_provision_firebase: true` enables FCM/Firebase APIs in `firebase_project_id`, adds Firebase to that existing project, registers the Android app, creates/reuses a dedicated FCM sender service account, grants its FCM send role and downloads Android configuration. It uses the controller's already-authenticated gcloud identity and writes files to `firebase_credentials_dir`; set the two source file variables to those generated paths. Existing credentials are reused, not rotated on each run. Google project/IAM permission and organization policies allowing service-account keys are prerequisites; this does not create a Google account, invent cloud credentials or bypass cloud authorization.

The server playbook deploys API/GUI, runs additive migrations, and checks process readiness with application rollback. The mobile playbook uses an existing Node 22+, JDK 21 and Android SDK builder, installs the native plugin/service, and builds a debug APK. A signed release and device installation remain separate from deploying the server.

## Routing integration

Set `native_push_install_routing: true` only with a complete commissioned `native_push_routing_bundle` on the server. Its main `kamailio.cfg` must load tm, sl, registrar/usrloc and include `olamide-auth.cfg`. Place `# OLAMIDE_PUSH_LOOKUP_MISS` inside the failed local subscriber lookup branch, **after** identity/tenant authorization, record-route and initial RTPengine processing, and **before** replying 404/480. The installer wires the wake route there and appends SIP branches after authenticated REGISTER. Existing carrier ingress requires its own verified policy before invoking this route. No public unauthenticated caller may bypass authorization.

The include stores the pending INVITE for up to 45 seconds, calls the authenticated push endpoint, and uses TSILO to append a branch when the recipient registers. The existing media reply/branch/failure routes and CANCEL handling must remain intact in the complete profile. Syntax validation and runtime module checks use the existing Kamailio role with rollback. SIP syntax/process checks do not prove two-way audio or late-branch delivery.

## Android behavior and limits

After login the GUI obtains the Firebase device token through the native plugin and binds it to the authenticated user/session. A high-priority FCM data event invokes the native service while the app is backgrounded. It posts a generic incoming-call notification. Tapping opens the app, automatic SIP registration resumes, and the user answers through the app's incoming-call UI. Answered app calls start an Android foreground microphone service with an ongoing call notification; hangup/logout stops it. It starts only for active calls, after normal microphone permission, and cannot guarantee WebView/network behavior on every device. This profile does not implement Android Telecom ConnectionService. It does not auto-answer a call. Notification permission and normal Google Play services delivery are required; a force-stopped app cannot be guaranteed to wake.

Jobs are deduplicated per call/device, expire after 45 seconds, retry failures, suppress DND recipients, and skip inactive/expired sessions. Invalid Firebase tokens are removed. No message content or SIP password is included in push payloads. Closing a session prevents new job delivery, but an event already accepted by FCM cannot be recalled. Notification call cancellation is currently limited to local expiry; SIP CANCEL cancels the switch transaction but does not retract a delivered Android notification.

iOS APNs, PushKit and CallKit are not implemented by this Android profile. Stories/status media, end-to-end encryption and large group calls are not part of this rollout. Existing readiness information is written to `/opt/olamide/experience-readiness.json`.

## Acceptance

Install the APK on a real Android device, grant notifications, sign in, background it, and call it from an authorized same-tenant account. Confirm notification delivery, tap-to-open, SIP re-registration, retained INVITE, answer, two-way audio and hangup. Repeat after network changes and test caller cancellation, 45-second timeout, DND, blocked identities, logout and revoked sessions. These tests require real Firebase, SSH, a commissioned SIP profile and physical devices.

Official implementation references: [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Android FCM delivery](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Kamailio TSILO](https://www.kamailio.org/docs/modules/5.8.x/modules/tsilo.html), [Kamailio async HTTP](https://www.kamailio.org/docs/modules/5.8.x/modules/http_async_client.html).

## iOS native system call screen and credential provisioning

Use `deployment/ansible/native-system-calls.yml` for the combined Android/Firebase
backend, Apple APNs provider and signed iOS CallKit build:

```bash
ansible-playbook -i /secure/inventory.ini deployment/ansible/native-system-calls.yml -e @/secure/native-push.local.yml
```

The playbook uses a fixed `deployment_ref`; optional `auto_provision_firebase`
creates/reuses the Firebase service account and downloads the Android configuration
using your already authorized Google project. Server hook credentials and per-user
SIP credentials are generated automatically by the existing provisioning flows.
APNs uses a separate Apple P-256 `.p8` key, key ID and team ID. These are packaged
into a private `/etc/olamide/native-push/apns.json` provider file and mounted read-only
into the API. Apple does not use the Firebase service-account JSON for VoIP pushes.
No private keys, device tokens or SIP passwords are committed or printed.

You must supply an authorized Apple Developer APNs key with permission for
`com.dobhrap.olamide`, enable Push Notifications for that app identifier, and authorize
Xcode signing on the `ios_builders` Mac. Install Xcode, Node, Ruby and the `xcodeproj`
gem on that builder first. The playbook configures capabilities, automatic signing,
Swift sources, the bridge controller and a signed `.xcarchive`; it does not create an
Apple Developer membership, obtain an APNs key from an unauthorized account, export
an IPA or submit an App Store release. macOS/Xcode and physical iPhones are required.
Use separate server/build environments for sandbox and production APNs tokens.

The Swift bridge starts PushKit at application launch and reports incoming VoIP calls
immediately through CallKit. Native answer/end events wait for the matching SIP Call-ID;
unrelated calls are never answered. The answer action is fulfilled only after SIP
reports a connected call, otherwise it fails after 15 seconds. Expired/unanswered
calls close automatically. Backend transport uses authenticated HTTP/2 APNs, ES256
provider tokens, a fixed `.voip` topic and zero notification expiry. Device registration
remains bound to the authenticated user, tenant and live session; logout disables calls.

**Production limit:** the current SIP.js media engine runs in WKWebView. CallKit UI and
PushKit alone cannot provide reliable signaling/media when iOS suspends that WebView.
A native SIP/media engine and CallKit audio-session integration must be implemented
and physically verified before production release. The combined playbook blocks
`apns_environment: production` unless `ios_native_media_verified: true`; this flag
records completed acceptance, and does not implement the missing engine. Test app
termination, lock screen, Bluetooth, cellular-call interruptions, canceled calls,
revoked sessions and bidirectional audio. Swift/Xcode builds cannot be validated on a
Linux controller. Android continues to use its native notifications/foreground-call
profile; Android Telecom/default-dialer integration is not added by this iOS profile.

For a dedicated non-administrative server login, run
`deployment/ansible/native-server-access.yml` through your existing authorized admin
SSH connection. It generates/reuses an Ed25519 key under `firebase_credentials_dir`,
creates `olamide-deploy`, and adds the public key without replacing existing access.
It grants no sudo or Docker membership. Privileged deployments still use your existing
administrator connection. Host key verification stays enabled. A script cannot create
server access before an administrator authorizes the connection.

References: [Apple PushKit and CallKit](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit),
[APNs request protocol](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns),
[Capacitor native iOS plugins](https://capacitorjs.com/docs/ios/custom-code).
