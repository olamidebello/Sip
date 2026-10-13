# Reference contact sheet and keypad

The Calls contact picker opens a pink-header contact sheet with voice call, video invitation, message, favorite, edit and copy-address actions. Favorites, private aliases, notes and labels persist in owner-scoped MySQL contact_cards records. These edits do not change another user's shared profile or SIP identity. Selecting a contact never places a call automatically.

Voice call opens the full-screen dark keypad with the destination filled in. Digits, backspace, clear and in-call tones use the existing dialpad implementation. Call requires SIP connectivity, then the existing server authorization/geofence/subscription checks apply. Video opens the existing meeting creation/invitation flow. Registered contacts open SIP chat; international phone-only contacts open the SMS composer if enabled. Unsupported/non-international phone strings cannot open SMS. No WhatsApp connection or voicemail feature is supplied. This implements the screenshot's layout with Olamide services, not third-party WhatsApp buttons.

After deployment CI succeeds, pull main and run deployment/deploy-messenger-features.sh to apply the additive card table and rebuild API/web. A GUI-only install is insufficient for this database/API change. Verify the sheet, private save/reload, real calls, SMS and meeting invitations with two accounts.
