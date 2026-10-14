# External social publishing

Run deployment/deploy-social-publishing.sh unattended after pulling a CI-approved main release. It uses the existing backup/build/migration/restart workflow and adds owner-scoped account and delivery tables. PROVIDER_CREDENTIAL_KEY is required for encrypted token storage. No external posts are sent by installation.

Social supports text-only publication to Facebook Pages, X and LinkedIn with explicit confirmation. Official login provisioning is described below; manual token entry remains available as an advanced option. Tokens are encrypted with tenant/user/provider-bound authenticated encryption. Lists never return tokens. Disconnect removes locally stored access; revoke authorization at the provider separately. Only the current owner can manage/publish through each stored connection.

Facebook uses Page identity and Page feed API v26.0; personal timelines are unsupported. X uses authenticated user identity and v2 post creation. Provider developer access/approval/scopes and charges are external requirements. The login-based provisioning section below supersedes manual-only setup. Automatic renewal, Instagram/TikTok and media uploads are not implemented. Profile links do not authorize publishing.

Delivery attempts use a user-scoped unique request ID and content hash. No automatic retries are performed after ambiguous failures; status unknown or sending means check the external account before creating another request. Changing the draft creates a new request ID. No external-account posting has been tested with live credentials in this development environment.

## Login-based token provisioning

Social now offers official OAuth login buttons for Facebook Pages, X and LinkedIn. Login and consent happen on provider websites. Codes are exchanged server-side and publishing tokens encrypted. Sip never asks for social passwords. Facebook users select an authorized Page. The first 100 returned Pages are offered.

Register `https://sip.dobhrap.com/social-oauth-callback.html` as the exact redirect URI in each developer app. Meta Pages publishing permissions and app approval are required. X uses a confidential OAuth 2.0 client with PKCE and publishing scopes. LinkedIn requires OpenID Connect sign-in and Share on LinkedIn products, granting `openid profile w_member_social`. User login cannot create developer apps or bypass provider approval and billing.

Create an Ansible Vault encrypted file outside the repository:

```yaml
social_oauth_apps:
  facebook:
    client_id: YOUR_META_APP_ID
    client_secret: YOUR_META_APP_SECRET
  x:
    client_id: YOUR_X_CLIENT_ID
    client_secret: YOUR_X_CLIENT_SECRET
  linkedin:
    client_id: YOUR_LINKEDIN_CLIENT_ID
    client_secret: YOUR_LINKEDIN_CLIENT_SECRET
```

After the release passes deployment CI:

```bash
cd /opt/olamide/repo
bash deployment/deploy-social-publishing.sh -e @/root/social-oauth.vault.yml --ask-vault-pass
```

Ansible configures the existing root-only environment files then runs backup, build, migration and restart. Unconfigured providers have disabled login buttons. The existing `PROVIDER_CREDENTIAL_KEY` must be preserved. OAuth states are owner/provider-bound, expire after ten minutes and are consumed once. Pending Facebook Page tokens expire after ten minutes. The callback accepts only the initiating same-origin popup.

Text publishing only. Reconnect when access expires; automatic renewal, Instagram, TikTok and media uploads are not implemented. Disconnect removes local tokens; revoke consent at the provider separately. Login does not publish anything. Each post requires confirmation. Live provider login and posting require approved apps and have not been tested in this development environment.
