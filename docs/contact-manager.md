# Simplified contact manager

Chats → New chat opens Find people with name/email/international-phone search focused. Search respects existing discoverability and tenant isolation. Add and chat saves the contact through the existing API and selects that conversation. New contact retains the existing email add form. Import contacts groups phone selection, Google authorization and CSV/vCard preview, selection and saving. Workspace CSV import/export sits inside an additional collapsed group. Privacy and forwarding settings are collapsed separately. Existing form elements and handlers are preserved rather than duplicated.

Only the selected workspace is displayed by the existing navigation router. Existing per-user/group navigation grants and administrative role checks remain in force. This release simplifies the contact area; it does not remove authorized services or claim all WhatsApp functionality. Device access still requires permission and native/browser support. Imported contacts are private address-book entries; they are not automatically registered app accounts.

After successful CI, pull main and run `bash deployment/deploy-messaging-gui.sh` under `/opt/olamide/repo`. No new database tables or API contracts are needed. Verify Find people → Add and chat, phone/file imports, select-all controls and saved privacy settings.
