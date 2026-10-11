# Carrier-grade acceptance gates for Kamailio

This project is not carrier-grade merely because Kamailio and RTPengine install. Do not advertise capacity, reliability, or billing correctness until the following gates are met with measured evidence.

| Area | Required behavior | Evidence before cutover |
| --- | --- | --- |
| SIP edge | REGISTER/INVITE authenticated by tenant realm; reject spoofed From, cross-tenant access, replayed nonce, malformed SIP and unknown peers | Automated negative SIP tests and packet captures |
| Media | RTPengine offer/answer/delete, SRTP/DTLS for WebRTC, NAT traversal, one-way-audio checks, relay exhaustion behavior | Calls across cellular, residential NAT and carrier trunk |
| Resilience | Two independent SIP nodes, shared registrations or failover strategy, health-based DNS/load balancer, media node failover policy | Node-kill and network-partition drills |
| Routing | Tenant DID ownership, explicit emergency treatment, fraud blocks, carrier failover, route loop prevention and tariff effective windows | Inbound/outbound test matrix per provider |
| Charging | Account balance reservations, max call duration, durable CDR ingestion, duplicate-event handling, carrier reconciliation and refund logic | CDR-to-invoice reconciliation on forced disconnects |
| Capacity | Target 500 concurrent calls with measured CPU, memory, latency, packet loss and quality under representative codecs | Repeatable sustained load test with headroom |
| Security | Secret rotation, least-privilege DB/API accounts, TLS renewal, SSH/firewall allowlists, audit logs, backup restore | Pen test, rotation drill, restore drill |
| Operations | Structured metrics and alerts, tracing by call ID, deployment canary, rollback and maintenance process | Alert drill, rollback drill and on-call runbook |

## Current state

The draft branch contains a private API authorization/route adapter and a package staging playbook. It lacks live Kamailio signaling configuration, media server, carrier connections, DID cutover and the measurements above. The staging playbook prevents the new packages from auto-starting; it does not switch traffic. Keep the existing service path until the acceptance evidence is complete.
