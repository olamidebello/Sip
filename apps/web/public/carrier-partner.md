# Olamide carrier partner integration requirements

The downloadable Olamide Android preview is a WebView client. It does not have carrier privileges, change a device's SIM/network branding, serve as the system default dialer, or place emergency cellular calls.

## Carrier-controlled delivery prerequisites

1. Obtain written authorization from the mobile network operator and identify the SIM/eSIM profiles and subscription IDs that may display the Olamide network brand. Android carrier privilege rules depend on signing certificates installed on those profiles. The app must verify privileges for each subscription at runtime; never request or store a carrier signing key in this repository.
2. Build and test a native Android phone app with `ACTION_DIAL`, `InCallService`, Telecom role request, full incoming and ongoing call UI, audio routing, emergency-call handling, accessibility, and device-specific regression testing before offering the default phone app option. The current SIP WebView cannot fulfill this role.
3. Separately integrate SIP registration, push notifications, incoming call handling, call continuity, SBC and carrier routes, plus authoritative provisioning and CDR reconciliation. Test operator interconnect and emergency routing with the carrier before production.
4. If the carrier authorizes subscription branding, use Android carrier-privileged APIs only for the authorized SIM/eSIM. An ordinary downloadable APK cannot change a network's displayed name or logo on arbitrary phones.
5. Publish signed Android builds through an approved channel with explicit versioning and rollback. The public debug APK is a development preview, not a carrier edition.

Contact your carrier integration team with the authorized SIM/eSIM test profiles, Android device models, provisioning interfaces, and emergency calling requirements before commissioning a carrier build.
