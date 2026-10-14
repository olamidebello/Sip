# Native ASTPP package

Upstream: iNextrix/ASTPP, Community V6.0, commit 9479778d1c9a325fc28b0265575f256703626077.
Upstream code is licensed under GNU Affero General Public License version 3.
Its original attribution and LICENSE are retained in the runtime and source download.

Olamide native-package wrappers © 2026 Olamide Olatayo Bello, AGPL-3.0-only.
Changes: isolated Docker web/database services, private runtime config, removal of seeded login sessions,
strong native administrator credentials, disabling seeded non-admin accounts, trigger definer portability, and serving index.php instead of the upstream root index.html, with fatal errors logged server-side instead of suppressed.
Source offer: /astpp-source.tar.gz in the private native web service. Runtime keys and database data are excluded.

The Olamide integrated carrier console is separate from the native ASTPP program and uses Olamide's APIs.
Native FreeSWITCH, RTP/media and authoritative charging are not deployed by this GUI package.
