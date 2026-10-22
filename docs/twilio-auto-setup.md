# Automatic Twilio Verify setup

Use Administrator > Providers & Routing > Twilio > Automatic Verify setup. Save Account SID and Auth Token first. Auto setup uses complete saved hub credentials, otherwise legacy verification credentials, otherwise API-container TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN. It never generates Twilio account credentials, mixes partial credentials across sources or exposes secrets. API-key-only credentials are insufficient for the existing caller verification adapter.

Setup checks account status, reuses the saved VA SID or an exactly named tenant-specific service, otherwise creates one with a deterministic persisted request key. It validates service account ownership, saves the SID encrypted, creates/checks the restricted disabled internal account and enables the local caller-verification policy. Defaults for a new policy are +1,+234 and 100 requests per tenant/day; existing policy limits are preserved unless explicitly supplied in the GUI. Existing per-user, per-number, cooldown and code attempt controls remain.

No verification call or message is placed by setup. Twilio funding/trial limitations, Verify geographical permissions and actual delivery still need a user test. The installer does not alter Twilio geo permissions, webhooks, senders, SIP routes, media ports or prices. This auto setup targets Verify; it does not auto-commission other Twilio products.

The CLI installer attempts setup only for an unambiguous active super-admin tenant. Set TWILIO_SETUP_TENANT_ID in the API environment for multiple tenants, or use the tenant-scoped GUI. If credentials are absent it reports action_required while leaving installation successful; save credentials in the GUI, then click Auto provision Verify settings.

Remote service creation is not repeated on ambiguous responses. Review inventory and save the correct existing SID if reconciliation is needed. If setup stops after validating credentials or creating a service, those encrypted settings and the remote service may remain for reuse; installation rollback cannot undo remote resource creation.

Tests use mocked provider requests/database doubles. Real service creation and call delivery require server validation.
