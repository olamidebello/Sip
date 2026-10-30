# Call credit alerts

Deploy `deploy/ansible/call-credit-alerts.yml` on root@sip with no active calls.
This guarded update builds the web bundle and stages a switch response mapping;
it does not change tariffs, wallet charging, funding providers or DID policies.
Prior source, API/web images and switch configuration are backed up and restored
on failed promotion. No live call or payment is automatically initiated.

Before a paid call, the authenticated wallet endpoint supplies available USD
credit. Zero credit opens a top-up dialog and cancels that dial attempt. Positive
balances below USD 1 show a warning without blocking the call. Free internal calls
skip the wallet gate. Failed reads and unsupported currencies do not invent a
balance verdict; the server's existing reservation checks remain authoritative.

An authenticated switch billing response beginning with “Insufficient credit”
maps to SIP 402, which opens the same top-up prompt after rate-specific rejection.
The SIP callback is added using SimpleUser's existing inviter/invite options.
Unknown customized call/bridge layouts are rejected rather than overwritten.

The top-up button opens Billing. It does not enable an unconfigured payment
provider, perform automatic funding, retry a call or make a charge. The user
completes funding through their configured billing controls and dials again.
After calls, the available balance is checked again without opening a modal.
The default USD 1 threshold is a UI warning, not an estimate of minutes remaining.

Use `deploy/ansible/inhouse-failure-summary.yml` to display fixed error codes for
the latest private in-house/credit deployment log without exposing its contents.
UI behavior, SIP 402 interoperability and provider-funded top-ups need live tests.
