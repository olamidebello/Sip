# Optional native ASTPP services

Production Kamailio has its own deployment and readiness check. This optional installer starts only the native ASTPP web GUI and independent MySQL database. It does not install another SIP switch or replace Kamailio routing, credentials, subscriber data or media relay. Native ASTPP live calling and charging are not provided by this GUI/database installer.

After exact-release CI passes, run:

```sh
cd /opt/olamide/repo
git pull --ff-only origin main
bash deployment/deploy-native-astpp.sh
```

It preserves native keys and data, backs up an existing running native database, validates the release, checks Kamailio before and after, and verifies the private login page. If the optional installation fails, its command returns a failure; the independent production deployment remains usable. Do not delete native volumes or keys to retry.

Access through `ssh -L 8089:127.0.0.1:8089 root@154.29.77.102` and open `http://localhost:8089`. Generated login details are on the server in `/etc/olamide/native-astpp/operator.json`; keep them private. Run `bash deployment/check-astpp-commissioning.sh -e astpp_check_backend=native_astpp` for GUI/database readiness. The default check continues to use Kamailio.

The upstream pinned Community application and original schema supply the native menus. Installation now verifies menu records, permission profiles, role definitions and the account/trunk/gateway/routing/invoice/product/order tables. It does not reset existing operator menus or copy native records into Olamide. Enterprise add-ons and native live-switch functionality are outside this package.
