# User DID ordering

Signed-in users can search available Flowroute and DIDWW numbers in Billing → Available numbers. Flowroute supports number prefixes and pages of 20 results. DIDWW supports number-contains searches and refreshes a random selection; its available-DID endpoint does not support pagination. Provider credentials stay in the API environment. An administrator must activate each carrier for the tenant before searches or requests are allowed.

Both providers use a fixed USD selling price of buying price × 1.30, rounded upward to the next cent, independently for setup and monthly rental. Provider pricing rules and legacy tenant markup overrides cannot change this policy. Existing requests retain their price snapshots; in-house pricing remains editable.

Users accept fulfillment terms and the displayed setup and monthly prices before creating an order request. The API checks the selected number and SKU against fresh provider inventory and rejects a changed price. The initial invoice includes setup plus the first month. Duplicate open requests for the same user, provider and number are rejected under a user-row transaction lock. Provider inventory IDs, SKU IDs, buying costs and selling costs are recorded for fulfillment review. Inventory remains unreserved and can sell out before fulfillment.

An order request does not purchase a number at the carrier, activate an inbound SIP route, or start automatic recurring billing. The GUI makes this pending status explicit. Carrier purchasing, regulatory review, route commissioning, renewal billing and refunds require a separate fulfillment workflow. Do not advertise a pending request as an active DID.

Required private environment configuration:
- Flowroute: `FLOWROUTE_ACCESS_KEY`, `FLOWROUTE_SECRET_KEY`.
- DIDWW: `DIDWW_API_KEY`, `DIDWW_API_ENV` (`sandbox` or `production`), `DIDWW_ACCOUNT_CURRENCY=USD`. DIDWW must enable `/v3/available_dids` on the account. Inventory requiring end-user registration is excluded from self-service selections.

Provider references:
- https://developer.flowroute.com/api/numbers/v2.1/search-for-purchasable-phone-numbers/
- https://doc.didww.com/api3/2026-04-16/coverage-resources/available-did/get-available-dids.html

After pulling and rebuilding the API and web images, startup adds the inventory/SKU columns automatically. No private credentials or carrier purchases are performed by migrations.
