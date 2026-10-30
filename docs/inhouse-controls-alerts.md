# In-house activation controls and System Alerts

Deploy on the SIP host (154.29.77.102), after active calls finish:

```sh
ansible-pull -U https://github.com/olamidebello/Sip.git \
  -C main -d /opt/olamide-deploy-controller \
  -i localhost, -c local \
  deploy/ansible/inhouse-controls-alerts.yml
```

The playbook patches recognized live sources, stages and validates Kamailio,
backs up source and running API/web images, runs API tests, rebuilds both images,
and checks health. Failed deployment restores files and promoted images where
possible and prints fixed diagnostic codes. Database migrations are additive;
rollback does not delete new tables or erase committed records.

Refresh the app and open Billing as a super administrator. The activation panel
controls allocation availability, the first-call requirement, verification
receiver and code limits, cooldown, retention, minimum activity and quarantine.
Defaults require a completed answered paid call to the verified Nigerian number
and one allocation per Nigerian number in thirty days. Existing assignments are
grandfathered. Existing cooldown records retain their original expiry.

The System Alerts administration panel sends plain-text in-app alerts to all
active accounts, a group, or one account in the selected workspace. Preview the
recipient count, then confirm. Recipient membership is snapshotted on send;
changed membership requires another preview. Idempotency keys prevent duplicate
inserts on retries. History supports withdrawal. This feature does not send SMS,
email or push notifications. No messages are sent by deployment.

Subscribers see an Alerts section with severity filters, unread counts and
read/dismiss controls. Read/dismiss state lasts for the current page session.
The feed polls every sixty seconds and is scoped to the authenticated account.
Only safe summaries are displayed; private deployment logs are not broadcast.

Carrier commissioning, reviewed ICN tariff prefixes and funded wallet access
are still required for the first external call. This playbook does not invent
carrier approvals or bypass prepaid billing.
