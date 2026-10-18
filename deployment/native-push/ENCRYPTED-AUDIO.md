# Encrypted text and adaptive voice installation

Run `deployment/ansible/install-encrypted-audio.yml` with no active calls. This playbook builds/tests the new API and GUI, then installs country onboarding, location enforcement and their required resources using the existing playbooks. Preserve the country, location and caller-ID Compose overrides in future deployments. It creates `secure_chat_keys` and `secure_chat_messages` through startup migrations. It does not rewrite existing messages.

## Encrypted private text

Chat → choose contact → Encrypted private messages → Enable encryption on both accounts. Both users must add each other as account contacts. Compare the full displayed fingerprints in person or through a separately trusted call, then tick the verification checkbox. The application pins the first observed contact fingerprint on this browser and blocks sending when it changes. Recent messages refresh while the panel is open; Refresh retrieves the latest 50 messages. Standard chat remains available separately.

Keys are generated in the browser using Web Crypto P-256 ECDH. Per-message AES-256-GCM keys are derived with HKDF-SHA256 using random salts and identity/message context; random 96-bit IVs and authenticated context bind messages to their participants. The API stores public keys, ciphertext and routing metadata, never message plaintext or private keys. This is a separate encrypted one-to-one text feature, not encryption for existing chat, groups, attachments, SMS or email. Static identity keys do not provide forward secrecy. This implementation has not received an independent cryptographic audit. The recipient can copy decrypted text.

Private identity JWKs are stored in the browser's IndexedDB. Protect the device and origin: scripts running in the application origin can access keys and plaintext. This does not protect against compromised application JavaScript or devices. Fingerprint comparison is required because first-use server key distribution alone cannot prevent substitution.

Before clearing browser data or changing devices, use Download encrypted key backup with a strong separate passphrase of at least 12 characters. Backups use PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM. Keep the downloaded backup and passphrase safe. Restore imports the existing key and checks it against the registered public key. The API refuses silent replacement. Lost keys without a backup cannot be recovered by administrators. There is no automatic reset, key rotation or multi-device key replacement in this version. The event tracker records message IDs and participants, not plaintext or key material.

## Automatic voice adaptation

The calling interface displays negotiated codec, a target audio bitrate, estimated outgoing available bandwidth when the browser supplies it, and packet loss. The SIP session-description factory prefers browser-supported Opus, keeping G.722, G.711 and telephone-event fallbacks. It does not add codecs absent from the browser or transcode carrier media.

Every five seconds, call statistics guide an Opus sender cap of 12, 20, 32 or 48 kbps. Packet loss, jitter and RTT reduce the target promptly; higher targets require three favorable samples. Browser congestion control continues underneath these caps. Initial codec preference uses coarse connection hints if available; these are not an active speed test. No call-statistics history is uploaded.

Codec preference is applied before offers/answers. During an active call, bitrate is adjusted within the negotiated Opus codec, without forcing a mid-call codec switch or renegotiation. For fixed G.711/G.722 carrier/browser codecs the app reports the negotiated codec and leaves the sender bitrate alone. Unsupported bitrate controls fall back to browser management. This cannot guarantee voice quality on every network; connectivity, congestion, carrier codecs/transcoding and device hardware still matter. Mobile background suspension can pause statistics sampling.

## Acceptance

Enable keys for two test accounts, compare fingerprints, exchange encrypted text in both directions, inspect that the server stores ciphertext only, restore a backup on another browser and reject incorrect backups. Verify that normal users cannot read other conversations or contacts outside their workspace. Confirm legacy chat still works.

Test SIP calls on supported desktop/mobile browsers with a network shaper: observe Opus targets fall under congestion and recover gradually. Confirm fixed-codec carrier calls still connect, DTMF still works, and audio adaptation stops after hangup. Live carrier audio, actual browser encoder behavior and device backup/download behavior require acceptance on the target server and devices.
