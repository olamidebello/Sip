# Money navigation and chat action menu

Money appears next to Calls by default. Explicit super admin group/user Hide policies still apply, and wallet service entitlement checks remain enforced. Existing Money supports internal USD transfers, requests, receive activity and provider-gated invoice checkout.

The chat currency icon appears immediately after Video. It reflects the saved preferred currency using its narrow symbol (for example USD $, NGN ₦ or EUR €). The icon is a preference indicator; the current internal ledger still settles only USD. Changing the icon does not perform currency conversion.

The icon opens Send money, Request money, Share card. Send/Request preselect the current chat contact in the existing confirmed wallet flow. Share card calls the authenticated /api/wallet/payment-card endpoint for the owner's name/email and appends an Olamide payment-profile card to the draft. It never sends the message automatically, and does not replace existing draft text. It is not a bank debit card and contains no PAN, CVV or banking credentials. Logout/contact changes discard late responses.

Cash out remains unavailable: provider credentials verification does not implement deposits/withdrawals. Usable virtual debit cards require approved issuer programs. Stripe Issuing account activation is required for its card program; Flutterwave's documented virtual-card service requires support activation and does not establish availability of a NGN program. Both regions were requested, but real issuance, provider-enforced spending controls, freeze/unfreeze and secure card details remain unimplemented pending an approved issuer integration. No fake card numbers are generated. Cards, deposits, withdrawals, banking, investments, loans and tax filing are not provided by an Ansible build or this UI release.

After exact-head CI passes:

```bash
cd /opt/olamide/repo &&
git pull --ff-only origin main &&
bash deployment/deploy-chat-money.sh
```

The existing Ansible workflow backs up MySQL and builds/migrates/restarts the full application. No new database table is needed for the payment-profile card; it uses the authenticated existing user and the existing wallet ledger. Test a five-tab default, explicit Money hide, preferred-currency changes, selected-contact Pay/Request, card draft preview and no transfers on menu clicks. Live withdrawal/card-provider activation is not performed by this installer.
