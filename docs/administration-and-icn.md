# Administration, ICN and personal user experience

This is a cumulative preserving deployment for the geographic calling controls, SmoothDID, ICN, provider management, phone verification and personal appearance. It updates known integration anchors and stops on unknown source layouts. No host firewall rules, RTP ranges, external peering or live carrier activation are invented. Source and Docker images are backed up; additive database tables, inventory and staged provider/account records remain after rollback.

## Administration workspace

Tools are arranged dynamically under **Overview · Users & Tenants · Calling & Numbers · Providers & Routing · Billing & Marketplace · Reports · Security · System Settings**. The sidebar shows one category at a time, search finds tools across categories, favorites keep commonly used tools close, and breadcrumbs show the current category. Existing DOM nodes and handlers are preserved rather than copied. Role checks remain in the original controls and backend. Overview counts are available tool counts, not fabricated operational metrics.

Provider management has searchable/filterable/sorted pages, one detail editor at a time, add/edit/save/cancel, bulk suspension and CSV export. Company/display names are editable; provider IDs remain stable. Lifecycle is draft, enabled, suspended or removed. Removal is reversible catalog removal; historical DID assignments, rate decks, invoices and call records are retained. Re-enable/restore never silently commissions a switch. Suspension gates new outbound PSTN calls, customer Flowroute rate quotes, provisioning/activation adapters, direct external SMS submission and the existing local Flowroute REST helper where installed. It does not hang up existing calls or remove upstream carrier ingress. Use existing trunk deactivation controls to stop an external trunk. Arbitrary new carrier types require an implemented and commissioned termination adapter.

New providers are available as geographic/SmoothDID policy choices. Existing carrier summaries use edited display names; deleted providers are hidden from ordinary catalog views. Optimistic version checks and tenant-scoped audit snapshots protect edits.

## ICN supplied profile

- Company: **Interconnect Clearinghouse Nigeria Limited**; provider ID `icn`.
- SIP: **196.216.253.173:5060 UDP**; peering over public Internet.
- RTP media IP: **196.216.253.174**. The remote UDP media port range is not specified.
- Advertised codecs: **G.711 A-law / PCMA, G.711 µ-law / PCMU, G.723, G.729**. Listing does not prove successful codec negotiation or transcoding.
- Domestic prefixes: `01, 02, 09, 084, 080, 070, 090, 091, 081, 071`.
- Supplied prefix pattern: `^(?:01|02|09|084|080|070|090|091|081|071)[0-9]+$`. It deliberately does not claim to validate complete number lengths.

The profile creates a disabled PBX trunk and draft carrier profile. The super admin can configure current-location areas and exact caller DIDs, test eligibility and record ICN's confirmed outbound format: domestic `0…`, digits `234…`, or `+234…`. Until written confirmation, the format stays **unconfirmed**. Even a confirmed format does not activate ICN: source-IP authorization, remote media range, complete length rules, approved rates/capacity, codec interoperability and a commissioned switch adapter remain required. Both ICN's specialized UI and generic carrier activation remain honest about this block.

HP Inc remains a separate historical entry. The deploy changes only HP-only SmoothDID placeholder policy choices to ICN, preserving their areas, prices and allocations. Mixed-provider policies are left for explicit administrator review. Existing configured ICN trunks are preserved and must match the supplied disabled UDP profile before the stager reuses them. A display-name change does not change stable ICN identity.

## Caller DID verification and restricted service account

Account settings include **Caller DID & phone verification**. Selecting a purchased/assigned platform DID checks current ownership. Selecting an external DID starts a **Twilio Verify voice** challenge; the requesting user answers the call and enters the spoken code. Only a server-to-server approved result bound to the challenge's Verify SID, tenant, real user and exact number can confirm control and select the caller ID. A platform-managed number assigned to someone else cannot be claimed through voice verification.

The new user-selected ID is rechecked on every new paid call and still passes carrier identity, SmoothDID rental/geofence, provider-state, caller-allowlist and billing checks. Existing administrator-provisioned carrier identities remain under their existing authorization controls. Phone verification demonstrates control at that time; it does not establish legal title or grant the carrier's permission to present a caller ID. Verification lasts 90 days and can be revoked by the super admin.

**DID Verification Service** is created as a disabled internal user in the in-house block owner's workspace. It has no login credentials, wallet, SIP extension, subscription or group grants. Authenticated-session lookup excludes service principals, and the paid-call identity hook rejects them even if later linked to an ordinary identity. The service account marks this limited purpose; actual verification calls use the separately configured Twilio Verify service, not unrestricted SIP dialing from the dummy user.

Voice verification is disabled initially. Open **Security → DID verification service & restricted account** to save Twilio Account SID, Verify Service SID and Auth Token. Credentials use the existing API encryption master key and are write-only. A funded, voice-enabled Verify service is required; provider fees apply. Administrators explicitly allow country prefixes and set a daily workspace cap. The backend also limits requests to five per user/day, three per number/day and a one-minute cooldown, with five code attempts and ten-minute local expiry. Ambiguous call acceptance is never treated as successful verification or automatically resent. No actual verification call is placed by deployment or unit tests.

Official API references:
- https://www.twilio.com/docs/verify/api/verification
- https://www.twilio.com/docs/verify/api/verification-check

## Personal appearance and navigation

Account settings include **Make Olamide yours — style & layout**: classic dark, midnight, ocean, purple, light or system theme; accent; comfortable/compact spacing; text sizes; corner style; bottom/top tabs or desktop sidebar; preview, save and reset; reduced animation and opt-in/out swipe navigation. Settings are tenant/user scoped and versioned. Favorites are stored locally per administrator account.

Swipes require deliberate horizontal motion in noninteractive space, ignore browser edges, vertical scrolling and long holds, and do not run on forms, inputs, links, message lists, dialogs, admin tools or the call screen. They navigate only visible, policy-allowed main tabs. Gestures never send, delete, buy or grant access. Existing call controls, navigation permissions and mobile/browser VPN behavior remain unchanged.

## Validation limits

Unit/DOM tests cover 95 behaviors including provider states/rename/removal, preserved handlers and dynamic grouping, all supplied ICN prefixes and explicit format conversion, retained unique inventory/payment properties, voice-provider request/approval binding, quota and account restrictions, user-scoped appearance and swipe recognition. These use database doubles and mocked provider HTTP calls, not production MySQL concurrency or live telephone calls. The deployment checks syntax/builds in real API/web containers, verifies the unique DID index and initializes/stages records. Actual host deployment, carrier calls, media, device gestures and live verification delivery still require device/provider validation.
