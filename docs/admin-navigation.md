# Administration navigation

The administration menu groups existing panels into Overview & reports, Users & access, SIP & carriers, Rates & billing, Payments & wallets, Security & integrations, Appearance & communication, and System & operations. Each destination appears once. Search matches both menu names and category names. The current category and page appear above the menu.

Desktop uses a persistent sidebar. On phones, open Administration menu, choose a destination, and the menu closes to leave room for its controls. Back to chats returns to the user workspace; Sign out uses the existing logout action. Individual form pages remain accessible within their panels and through existing deep links, without repeating every form in the main navigation.

Existing role visibility, navigation policy, backend permissions, forms and API handlers are preserved. Super-admin-only integrations are omitted from the administrator menu. No database migration is added.

After deployment CI passes, run from `/opt/olamide/repo`:

```sh
git pull --ff-only origin main
bash deployment/deploy-messaging-gui.sh
```
