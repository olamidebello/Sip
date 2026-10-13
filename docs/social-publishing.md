# External social publishing

Run deployment/deploy-social-publishing.sh unattended after pulling a CI-approved main release. It uses the existing backup/build/migration/restart workflow and adds owner-scoped account and delivery tables. PROVIDER_CREDENTIAL_KEY is required for encrypted token storage. No external posts are sent by installation.

Social → Post to Facebook Pages and X supports text-only publication after account-token verification and an explicit confirmation checkbox. A user manually supplies a Facebook Page access token or X OAuth user access token obtained with provider publishing permissions. Tokens are encrypted with tenant/user/provider-bound authenticated encryption. Lists never return tokens. Disconnect removes locally stored access; revoke authorization at the provider separately. Only the current owner can manage/publish through each stored connection.

Facebook uses Page identity and Page feed API v26.0; personal timelines are unsupported. X uses authenticated user identity and v2 post creation. Provider developer access/approval/scopes and charges are external requirements. OAuth redirect flows, automatic token renewal, Instagram/LinkedIn/TikTok publishing and media attachments are not implemented. Profile links do not authorize publishing.

Delivery attempts use a user-scoped unique request ID and content hash. No automatic retries are performed after ambiguous failures; status unknown or sending means check the external account before creating another request. Changing the draft creates a new request ID. No external-account posting has been tested with live credentials in this development environment.
