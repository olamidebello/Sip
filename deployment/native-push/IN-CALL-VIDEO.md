# Upgrade an active voice call to video

The active call's Video button sends a same-dialog consent request to the other Olamide softphone. Accepting triggers SIP re-INVITE with video on that existing call. Declining, timing out or rejecting negotiation retains voice audio. Unrelated INFO requests keep the previous DTMF handler.

The screen shows remote video, a muted local preview, camera on/off, flip camera, microphone mute and end-call controls. Camera capture requires consent. Turning off the camera stops its track; ending the call releases camera media, including a late permission result. Reacquired audio preserves microphone mute before it is attached to the peer connection.

Compatibility is pinned to SIP.js 0.21.2. The application already reads SimpleUser's internal session; this adapter also guards its media factory to prevent camera capture without consent. Re-test this integration before upgrading SIP.js. Both participants need the updated Olamide client and video-capable browsers/devices. This is an Olamide implementation of familiar voice-to-video interaction, not WhatsApp interoperability.

Deployment:

1. Run `python3 deployment/native-push/install-video-renegotiation.py`. This validates a candidate, preserving active SIP routing.
2. Build the web image with existing Compose configuration. Do not overwrite the server's private environment files or custom port mappings.
3. After validation, run the installer with `--apply` to back up routing and restart Kamailio. This briefly interrupts SIP connectivity.
4. Recreate only `web`; refresh both softphones and wait for registration.
5. Make a voice call and tap Video. Verify the receiver can decline with voice uninterrupted, then retry and accept. Verify video both ways, audio both ways, camera off/on, microphone mute, flip camera, hangup and permission denial.

The server patch processes SDP offers and replies during in-dialog re-INVITEs. It does not delete the audio relay when a video offer is rejected. RTPengine capabilities, codecs and real device connectivity require a live test.

Validation performed in development: 13 controller and DOM tests, JS syntax checks and Python compilation. No live two-device camera or production RTPengine test was available.
