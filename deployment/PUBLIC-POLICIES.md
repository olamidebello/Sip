# Public Privacy and Terms pages

Exact public URLs:
- https://sip.dobhrap.com/privacy
- https://sip.dobhrap.com/terms

Both static pages work without login or JavaScript. Caddy serves their HTML
explicitly (including trailing-slash variants), instead of the application shell.
The pages are built from apps/web/public/privacy/index.html and terms/index.html.
Registration, public navigation, footer and Google contact import link to them.

Recommended operator review before public launch:
- Confirm the legal service operator and add a monitored public privacy/support
  email and any required business address; do not invent those details.
- Confirm actual infrastructure/provider access, hosting regions, retention periods,
  backup deletion, and an operational identity-verified deletion-request process.
- Confirm the prices, refunds, cancellation rules and any signed service terms
  applicable to the offers shown in the app. The page does not invent arbitration,
  a court venue, a liability cap, banking coverage or refund promises.
- Keep the disclosure aligned with deployed features; document material changes
  before using Google-derived contacts for a new purpose.
- Set these URLs in Google Auth Platform Branding (Privacy Policy and Terms of
  Service), authorize the domain, and complete applicable OAuth review requirements.

These pages describe existing features rather than claiming E2EE, emergency
calling, insured banking, native background readiness, or automatic number activation.
They are a starting policy for operator review, not a substitute for verifying the
service's actual practices or obtaining jurisdiction-specific legal advice.

Deploy once with git pull and deployment/deploy-user-login.sh, then verify:

```bash
curl --fail https://sip.dobhrap.com/privacy
curl --fail https://sip.dobhrap.com/terms
```
