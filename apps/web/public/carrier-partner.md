# Olamide carrier partner integration requirements

The downloadable Olamide Android preview is a WebView client with a native carrier authorization check and a user-confirmed display-name control. It cannot gain carrier privileges merely by installation. The control works only when the mobile operator has authorized this exact APK signing certificate on the SIM/eSIM. It does not serve as the system default dialer or place emergency cellular calls.

The public debug APK is not a carrier-authorized release. The package workflow publishes `olamide-carrier-signed.apk` only when all four GitHub Actions secrets are configured: `CARRIER_KEYSTORE_B64`, `CARRIER_KEY_ALIAS`, `CARRIER_KEYSTORE_PASSWORD`, and `CARRIER_KEY_PASSWORD`. Provision the corresponding signing certificate with the operator first; never commit a keystore or passwords. The build verifies the APK signature. Physical device and carrier acceptance testing remain necessary.

## Carrier-controlled delivery prerequisites

1. Obtain written authorization from the mobile network operator and identify the SIM/eSIM profiles and subscription IDs that may display the Olamide network brand. Android carrier privilege rules depend on signing certificates installed on those profiles. The app must verify privileges for each subscription at runtime; never request or store a carrier signing key in this repository.
2. Build and test a native Android phone app with `ACTION_DIAL`, `InCallService`, Telecom role request, full incoming and ongoing call UI, audio routing, emergency-call handling, accessibility, and device-specific regression testing before offering the default phone app option. The current SIP WebView cannot fulfill this role.
3. Separately integrate SIP registration, push notifications, incoming call handling, call continuity, SBC and carrier routes, plus authoritative provisioning and CDR reconciliation. Test operator interconnect and emergency routing with the carrier before production.
4. If the carrier authorizes subscription branding, the native bridge checks `hasCarrierPrivileges()` and calls `setOperatorBrandOverride("Olamide")` after an explicit device confirmation. It offers a separate restore action. Android controls the displayed network text; this does not replace a carrier logo on arbitrary phones. This implementation currently addresses the default SIM only.
5. Publish signed Android builds through an approved channel with explicit versioning and rollback. The public debug APK is a development preview, not a carrier edition. Sign a stable production release key separately and coordinate its certificate fingerprint with the carrier.

Contact your carrier integration team with the authorized SIM/eSIM test profiles, Android device models, provisioning interfaces, and emergency calling requirements before commissioning a carrier build.
