# User navigation

The primary Chats, Updates, Communities, Calls, Money and Social icons stay on a single row; granted extras remain controlled by the existing navigation policy. Menus opens a searchable panel grouped into Chats & contacts, Calls & meetings, Money & services, Social & daily tools, Account & preferences, and Help & downloads. Contacts opens the existing import/search controls. Picking a destination closes the menu. Close or Escape returns focus to Menus.

Existing API actions and forms are preserved. Individual form links are kept inside their workspace instead of being repeated in the menu. Hidden features and administrative panels are omitted. Deploy the web GUI with `bash deployment/deploy-messaging-gui.sh` after release CI passes.

## Calling rates and location history

Calling rates are visible by default. Explicit group Hide or user Hide remains effective; a user override takes priority. No role or calling entitlement changes.

Use Account & preferences → Location history, or the Location history link in My profile. Save current location asks for browser permission and saves a single check-in to the signed-in account. History is scoped to the authenticated tenant and user and capped at 100 entries. Clear history deletes the account's check-ins. There is no background capture and no reconstruction of earlier locations. Browser-reported coordinates are not authoritative geofence or billing evidence. The database migration runs during API startup.
