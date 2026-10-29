# Automatic ICN dollar display

Deploy `deploy/ansible/icn-fx-display.yml` on SIP server 154.29.77.102. This patches recognized API and web entry points without replacing their customized contents, backs up sources/images, runs tests, and rebuilds API/web. SQL creates one reference-quote cache table; rollback restores source/images, not database rows.

The API checks the fixed tradeNAIRA parallel-market JSON feed every 30 minutes. Source documentation: https://tradenaira.com/rates-api/ . The provider describes daily source updates and a free beta with visible attribution, which is included in the GUI. This is an indicative parallel-market reference, not a guaranteed executable dealer quote. The live source response has not been verified in the development environment; the first valid response must be confirmed after deployment.

Only `parallel.USD` is accepted; there is no fallback to official/CBN rates. The source timestamp must be supplied in timestamp, updated_at, last_updated, updated, or as_of, and no older than 36 hours. Invalid, stale or unavailable source responses retain the last validated quote but stale quotes produce no USD prices. No invented starting rate is installed.

Conversion: USD/minute = NGN/minute / NGN per USD. Display precision is six decimals. User-supplied GSM prices remain 4.45 NGN buy / 8.00 NGN sell; other networks 5.25 NGN buy / 10.00 NGN sell. Ordinary users see selling rates; super admins also see costs. The card appears under Outbound calling rates, refreshing every minute while the page runs. Data is persisted in MySQL across restarts.

This feature does not create an active ICN rate deck, deduct money, change existing USD billing or commission the trunk. Call-time FX snapshots, NGN wallet billing or an approved USD charging tariff require a separate billing implementation.
