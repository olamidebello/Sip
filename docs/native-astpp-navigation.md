# Native ASTPP navigation

Super admins have a searchable `Native ASTPP` menu hierarchy alongside the Olamide controls. Labels, group/subgroup names, relative console routes and ordering come from `menu_modules` in the upstream Community V6.0 database at commit `9479778d1c9a325fc28b0265575f256703626077`, filtered by the upstream Administrator (`-1`) menu permissions. The 6.0.1 Activity Report addition is included. Duplicate records for the same group/subgroup/route are collapsed; routes appearing in different groups remain visible.

Sources:
- https://github.com/iNextrix/ASTPP/blob/9479778d1c9a325fc28b0265575f256703626077/database/astpp-6.0.sql
- https://github.com/iNextrix/ASTPP/blob/9479778d1c9a325fc28b0265575f256703626077/database/astpp-6.0.1.sql

Each entry opens a dedicated Olamide panel with a link to the exact native console route. Connect an SSH tunnel to server port 8089 and authenticate with the native operator account. Native authentication and authorization still apply. No credentials are passed through URLs. This menu does not install the native application or connect native balances, routing or switch services to Kamailio.

The catalog is a pinned Community snapshot, not an Enterprise menu export. Licensed add-ons and other versions can add or alter menus. The existing telecom feature catalog remains available separately and continues to report implementation status from the backend.
