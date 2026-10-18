# DID shop implementation draft

This directory preserves work in progress. It is not connected to application startup and is not a production deployment.

Implemented draft modules cover Flowroute inventory search, retail DID quotes at provider cost plus 30 percent, authenticated order APIs, Stripe monthly subscriptions and verified-payment provisioning, primary DID selection, inbound routing, and user/admin screens.

JavaScript syntax checks and Python compilation passed before upload. Integration and payment lifecycle tests have not been completed.

Remaining work: wire startup migrations, routes, workers and profile navigation; complete wallet top-ups, available balance, external-call rate search and billing history; enforce a shared retail rate calculation for search and charging; finish administration and payment reconciliation; add tested Ansible deployment and end-to-end verification. Do not install individual draft modules into production.
