# Inbound routing controls

Super administrators open Administrator > Inbound call & message routing. Policies are scoped to the current tenant and E.164 DID. Voice and messaging policies are independent. Default owner routes retain existing DID ownership; user routes select an active user in the same tenant; block routes suppress delivery. Restore DID owner to remove an override's effect.

Supported handlers: the server's existing flowrouteDidRouting.js voice handler and messagingWebhooks.js Flowroute SMS/MMS inbox handler. SMS chat/email copies follow the selected recipient's existing preferences and email verification. MMS forwarding copies, external-number forwarding, IVR, ring groups, DIDWW token ingress and arbitrary webhook destinations are not included. No carrier credentials or provider routes are modified.

An explicit routing rule cannot make an unassigned number routable. Existing carrier source/token checks remain in place. Runtime resolution rejects inactive or cross-tenant recipients. Updates require a version to reject stale edits and are recorded in security_events and inbound_routing_audit. Route tests are simulations; they do not place a call, send a message, check registration or prove media connectivity.

Deploy with deploy/ansible/inbound-routing-local.yml on the existing server. The installer checks all integration anchors before source writes and preserves server-local handlers. It backs up source/images, runs nine API policy tests and two GUI tests, builds both services and checks health. New schema tables are additive and retained if application rollback occurs. Validate a real inbound call and SMS after deployment.
