# Google and phone contact import

Contacts are saved automatically after the user authorizes Google, chooses local
phone contacts, or selects a supported export file. Users can disable automatic
saving to review/select the preview first. Imports save to the signed-in user's
private address book; this does not invite contacts, send messages, expose another
tenant, or make external contacts SIP users. No Google token is saved in the
application database or browser storage.

Google:
1. Enable the Google People API in your Google Cloud project.
2. Create an OAuth Web client with authorized JavaScript origin
   `https://sip.dobhrap.com`. Configure the consent screen for
   `https://www.googleapis.com/auth/contacts.readonly`; add test users while testing
   and complete Google's publishing/verification requirements before public use.
3. Set `GOOGLE_CONTACTS_CLIENT_ID=YOUR_ID.apps.googleusercontent.com` in
   `/etc/olamide/secrets.env`. This browser token flow does not need a client secret.
4. Run `bash /opt/olamide/repo/deployment/deploy-user-login.sh` to rebuild/recreate API
   and web. Open Chats → New chat → Private phone and email address book → Import
   Google Contacts. Up to 500 contacts are loaded per Google import; repeated imports
   update existing name/email/phone records instead of creating duplicates.

Phone:
- A supported browser uses the system Contact Picker. A tap and contact selection
  are required; browsers cannot silently scan the phone address book at login.
- The native app uses @capacitor-community/contacts 8.0.0. Build a new Android/iOS
  app with the updated dependency, run Capacitor sync, and run
  `python3 apps/mobile/configure-contacts.py` after generating the iOS project.
  The download workflow runs the iOS configuration step automatically.
- A first native import requests OS Contacts permission. Later logins import
  authorized contacts once per session when automatic saving is enabled. Limited
  OS permission imports only the contacts the user allowed.
- Import at most 5,000 native contacts per operation; writes use batches of 500.
  Completed batches remain saved if a later batch fails; retry the remaining preview.
- vCard and Google/Outlook CSV exports remain available when direct access is missing.
  Selecting a file imports automatically with the toggle on. Files are limited to
  256 KB and 500 rows. Turn automatic saving off before choosing a file to preview.

Deploy the API/web update with:

```bash
cd /opt/olamide/repo
git pull --ff-only origin main && bash deployment/deploy-user-login.sh
```

Existing personal_address_book schema and owner-scoped transaction route are used;
no new contact database table is necessary. Rebuilding the server cannot grant OS
permission or enable native access in an already-installed old app binary.

## Configure after deployment in the GUI

Sign in as super admin, select the tenant, and open
`/admin#google-oauth-admin` (Super admin → Google Contacts OAuth). Enter the
OAuth Client ID, enable Google Contacts import, and Save OAuth settings.
The setting persists in tenant_settings and takes effect without a rebuild
or restart. Database settings override the environment fallback. Disabling
the saved setting disables import even when an environment client ID exists.
Tenant admins and ordinary users cannot read or write the admin setting.
The Client ID is a public OAuth identifier; do not paste a client secret here.
Google Cloud People API, consent screen, and authorized-origin setup are still
required. Reload contact settings or sign in again to refresh the user's client.
