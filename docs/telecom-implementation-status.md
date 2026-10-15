# Telecom implementation and deployment status

This change adds production-path code and controls; it does not establish live provider, switch or payment acceptance.

## Added modules

| Module | Working code path | Acceptance still needed |
|---|---|---|
| Number normalization | One longest-prefix rewrite during paid-call authorization; validated normalized number handed to the switch | Updated paid-call route deployment and controlled test calls |
| Personalized and caller-ID rates | Longest-prefix overrides snapshot the reservation rate used during settlement | Controlled billed calls with authorized caller IDs |
| Rate groups | Enabled group catalog, account assignment and prefix rates consumed by paid-call authorization | Controlled billed calls; separate native database synchronization if used |
| Call types | Enabled type catalog, prefix classification and paid-call report grouping | Controlled calls and classification checks |
| International credit | Monthly settled charges and outstanding reservations constrain prepaid authorizations under the tenant billing lock | Credit exhaustion and month-boundary tests on the installed switch |
| Calling windows | UTC weekday and minute-of-day gates at authorization | Carrier selection by time window is still unfinished |
| Shadow billing | Rates snapshot at reservation; independent actual/shadow ledger commits with settlement | Trusted switch-event and retry acceptance |
| Country reports | Settled calls and USD charges grouped by configurable longest country/numbering-region prefix | Configure and validate authoritative prefix mappings |
| Scheduled reports | Durable scheduling, claims, stored summaries, retrieval, bounded mail retries and provider idempotency | Authorized mail credentials; provider/inbox acceptance |
| Email history | Report generation and provider acceptance attempts | Unified history for all other email flows is unfinished |
| Wallet refills | Immutable, tenant-scoped manual funding ledger with wallet locks, stable retry IDs and audit events | Administrator funding reconciliation; external settlement is not inferred |
| Platform branding | Visible Olamide SIP branding in app, native console and README | Rebuild/redeploy native console and application |

Financial policies use USD minor units. Rate precedence is longest destination prefix first; account rates precede caller-ID rates and group rates on equal prefixes. Group and call-type references must belong to the tenant and be enabled. Disabling a catalog entry prevents its dependent policy from being loaded. Normalization rewrites once and must produce an E.164 destination. Time windows use UTC, an inclusive start and exclusive end, and one same-day interval per destination prefix. Existing calls retain their snapshotted rate and shadow rate.

Scheduled reports go to the creating super administrator's current email. Disabled schedules and inactive/demoted administrators are rechecked before delivery. `accepted` means provider request acceptance, not proof of inbox delivery. Reports summarize complete UTC days; complete raw CDR export remains unfinished. Manual refills represent separately verified funding; the application does not create bank funds or mark provider settlement.

## Deployment

After exact-release CI succeeds, on the server:

```sh
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-astpp-application.sh
```

For the updated normalized-number handoff, deploy the paid-call route in the authorized maintenance window:

```sh
bash deployment/deploy-kamailio-paid-calls.sh
```

This validates the staged switch configuration before replacing the live configuration. Existing private credentials are retained. Report workers start with the API and require the existing `RESEND_API_KEY` and `RESEND_FROM` settings to send email. The native console branding filter changes HTML text and default logos; internal endpoints, upstream source and third-party license notices remain intact.

## Outstanding work

The capability catalog remains the authoritative item-by-item source. Unfinished features retain `partial`, `not_implemented` or `external_dependency`; this update does not relabel all capabilities as complete. Media/PBX engines, advanced failover, unified ACL enforcement, live dialog control, complete mobile/desktop clients, reseller accounting, tax assessment, all provider payment/SMS lifecycles, portability integrations, archive workers and other remaining catalog items require further implementation or authorized external resources. Live installation is blocked in this execution environment by unreachable SSH connectivity to the server.

| Remaining feature | Status | Remaining work |
|---|---|---|
| Alarms | partial | Server monitoring exists; trunk and call-event alarms are incomplete. |
| Access Control | partial | Role and navigation permissions exist; portal/API IP rules need implementation. |
| Advanced SIP Routing | partial | Route preview and fraud rules exist; cause-based extension failover is not installed. |
| Automated CDRs | partial | Durable scheduled CDR summaries are implemented. Complete scheduled raw CDR exports and archive pipelines remain pending. |
| ACL Management | partial | Network controls exist; a unified SIP ACL module is incomplete. |
| Demand-Based Routing | partial | UTC weekday calling-window policies are enforced in paid-call authorization. Carrier selection by time window remains pending. |
| DID Call Transfer | not_implemented | Disposition-based DID failover is not installed. |
| Fax over IP | external_dependency | Requires a fax engine, storage and provider/media integration. |
| Fraud Detection | partial | Destination blocks and prepaid concurrency checks exist; anomaly detection is incomplete. |
| Local Number | partial | DID inventory exists; shared-DID service routing is incomplete. |
| Logs | partial | Operations controls exist; redacted live service-log streaming is incomplete. |
| Languages | partial | Language/locale settings exist; full interface translation coverage is incomplete. |
| Mailchimp | external_dependency | Requires an integration implementation and authorized Mailchimp credentials. |
| Multi-Tenant IP PBX | partial | Tenant-scoped PBX records exist; live IVR, queues and voicemail need a media/PBX engine. |
| Number Portability Service | partial | Port-request records exist; global portability lookup requires a data provider. |
| Ported Number—South Africa | external_dependency | Requires a South African portability dataset/API and implementation. |
| Payfast | external_dependency | Requires a signed webhook/payment integration and merchant credentials. |
| Rate Simulator | partial | A tariff route preview exists; it does not prove live switch rating. |
| Stripe Payment Gateway | partial | Stripe management exists; every advertised payment flow is not implemented. |
| Switch Monitoring | partial | Kamailio readiness exists. Native FreeSWITCH monitoring is outside the selected architecture. |
| Two-Factor Authentication | partial | Passkeys and OTP flows exist; exact vendor MFA parity is not established. |
| WHMCS integration | external_dependency | Requires a WHMCS connector and authorized API account. |
| Zoho CRM integration | external_dependency | Requires CRM connector implementation and OAuth authorization. |
| Salesforce integration | external_dependency | Requires CRM connector implementation and OAuth authorization. |
| STIR/SHAKEN | external_dependency | Requires approved signing credentials, certificate lifecycle and SIP integration. |
| Mobile Dialer | partial | App download controls exist; native background-calling acceptance remains separate. |
| PC Dialer | partial | Web calling exists; full desktop dialer parity is not established. |
| Prepaid & postpaid charging | partial | Kamailio prepaid deployment exists. Postpaid, prorating, bundles and surcharge rules remain incomplete. |
| DID lifecycle | partial | Inventory/provider controls exist; full purchase/release/recurring lifecycle depends on integrations. |
| Call center & autodialer | partial | PBX/call-center controls exist; live AMD, IVR, conferencing and interception need compatible engines. |
| SMS delivery & billing | partial | SMS endpoints exist; provider acceptance and full SMS rating remain incomplete. |
| Resellers & commissions | not_implemented | Tenant roles exist; hierarchical reseller rating, commissions and provider portals are incomplete. |
| Archive, purge & cron | not_implemented | Retention/archive workers and scheduled job administration are incomplete. |
| n8n integration | external_dependency | Requires authenticated workflow connectors and an n8n instance. |
| Overview | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Customers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Providers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Roles & permissions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| SIP devices & extensions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| IP authentication | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Caller IDs & CLI pools | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Switch servers | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Call barring | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Origination rates | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Rate decks | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Gateways | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Trunks | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Termination rates | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Routing strategies | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Invoices | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Charge history | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Packages & subscriptions | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Products & orders | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Inbound routes | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| DID inventory | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Vanity numbers | not_implemented | Vanity inventory classification is not implemented. |
| Port requests | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Call detail records | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Usage & financial summary | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Audit log | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Payment reports | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Commission reports | not_implemented | Reseller commission ledger and settlement require implementation. |
| Low balance report | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Email history | partial | Report mail attempts, retries and provider acceptance are visible. A unified delivery history across account verification, subscriber forwarding and all external mail remains pending. |
| Live calls & control | not_implemented | Live SIP dialog control requires switch RPC integration. |
| System settings | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Company profiles | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Templates | not_implemented | Dedicated invoice and email template editor requires implementation. |
| Taxes | not_implemented | Tax assessment and invoice tax lines require implementation. |
| Countries & currencies | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
| Database backup | not_implemented | Use reviewed database backup operations; no browser backup executor is installed. |
| Calling cards | not_implemented | Requires the native Olamide SIP calling-card application and supported switch integration. |
| Mass email | partial | Connected to existing tenant-scoped controls. Live service acceptance and exact Olamide SIP parity depend on the configured engine and provider. |
