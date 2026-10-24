# Background incoming calls

User controls: Account → Background incoming calls. Stay signed in, allow incoming-call notifications, and check the device's battery/background restrictions. The application opens Android's settings screens for the user; it does not override their choices.

Android uses Firebase notifications to alert a suspended app, then reconnects SIP when the user opens it. An ongoing answered call uses the existing microphone foreground service. No permanent microphone service is started for idle registration. Browser tabs can be suspended and do not provide the same background guarantee. Force-stopped applications must be reopened.

## Build and server prerequisites

1. Set the GitHub Actions repository secret `OLAMIDE_FIREBASE_ANDROID_JSON` to the Android Firebase application configuration for `com.dobhrap.olamide`. Do not put the server service-account private key in this secret or in the APK.
2. Run the Android Play preparation workflow and install the resulting APK. Without this secret the workflow explicitly warns that background incoming-call notifications are unavailable.
3. The server needs its matching private Firebase service account, native-push device registration API, job worker and trusted switch push-wake hooks. Existing server provisioning is documented in `deployment/native-push/README.md`. Its clean-checkout playbooks must not be used to overwrite a customized live checkout.
4. An incoming call must remain pending while the recipient wakes and registers. Immediate voicemail fallback on a DID route cannot deliver a suspended-device call; that route needs the reviewed push-wait/register-resume integration. The web lifecycle deployment does not change these switch routes or provision Firebase credentials.

Deploy the web lifecycle and readiness controls using `deploy/ansible/background-calls.yml`. It preserves source and the running web image for rollback. Application sessions are not deliberately closed when pages enter browser back-forward cache; resuming refreshes push device registration and wakes SIP reconnection. Repeated concurrent refreshes share one registration operation.

Acceptance: install the updated APK, enable notifications, sign in, background the app and lock the screen. Call the assigned DID from another phone, open the notification, answer and verify two-way audio. Repeat after network changes and after process eviction. Check declined and missed calls, logout revocation, DND and voicemail. Do not mark background delivery verified until these tests pass on the actual device.
