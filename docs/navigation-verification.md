# Navigation and backend wiring

Workspace roots are derived from the menu destinations so new panels participate in
screen switching. A shared fragment router handles menu, configuration and form-group
links, nested targets, keyboard activation, direct links and browser history. Form routes
preserve the selected form; returning to its workspace clears form-only visibility.
Hidden forms are omitted from the menu, and rebuilding a menu does not duplicate links.

User, administrator and super-administrator permissions still control panel visibility.
The API independently checks authentication, tenant membership and action permissions.
Personal activity requests now enter the authenticated router. Quick-link persistence
accepts the same permitted destinations, including credentials, products and monitoring.

Run `npm test` and `npm run build` in `apps/web`, and `npm test` in `services/api`.
The DOM integration tests bundle the real application, click every role's menu, check
visible button/form handler registration, exercise form and nested-panel navigation,
verify history restoration, and confirm preference saves call the API. The backend route
contract checks GUI endpoint families against the authenticated server dispatcher.
Provider, device, payment and SSH operations require their configured services; these
checks use mocked HTTP responses and do not place calls, buy numbers or charge cards.
