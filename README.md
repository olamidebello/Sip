# Olamide SIP

A development foundation for an independently built, branded SIP softphone.

## Current implementation

The browser client supports SIP registration over secure WebSocket, inbound and outbound WebRTC audio calls, answer/reject, hangup, hold/resume, and DTMF. It is a **development client**. It requires an existing SIP server configured for WSS and WebRTC with a trusted TLS certificate. The client does not provide a SIP switch, carrier routes, or telephone numbers.

```sh
cd apps/web
npm install
npm run dev
```

Open the local Vite URL and use a **test SIP account**. The app asks for a SIP URI, authorization username/password, and a WSS endpoint. Credentials stay in page memory; reloading clears them. Do not use production subscriber credentials with this development client.

## Target architecture

- Native Kotlin Android and Swift iOS apps with a properly licensed SIP/media engine, Android Telecom and iOS CallKit/PushKit integration.
- Kamailio edge/registrar and FreeSWITCH for call control, voicemail, conferencing, recording, and media services.
- Go provisioning and tenant APIs, PostgreSQL persistence, and a TypeScript operator portal.
- APNs/FCM push gateway, contact and messaging services, billing/CDR pipeline, fraud controls, and carrier interconnects.
- One Debian 12 server to start, with separable services and later SIP edge/media nodes. A target of 500 concurrent calls requires load testing with the selected codecs, recording, transcoding, and network path.

## Remaining work before service launch

1. Build and test the SIP infrastructure and secure provisioning on Debian 12.
2. Integrate native Android and iOS clients, including reliable background incoming calls.
3. Implement transfers, BLF, video, voicemail, conferences, rich messaging, recording, account management, and operator controls.
4. Connect Flowroute, DIDWW, and the Nigerian interconnect with separate routing tests.
5. Review SDK licenses, emergency calling, call recording consent, numbering and carrier requirements.
6. Run end-to-end, security, failover, and capacity tests.

No Acrobits code, branding, or assets are included. This repository is **not production ready** and has not been deployed to `sip.dobhrap.com`.
