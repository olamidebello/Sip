# Super administrator dialing rules

Open /?caller-id=1&dialing=1#admin as a super administrator, or select **Dialing rules & provisioning** on the Administrator screen.

- Choose workspace defaults or a user override. Refresh users loads up to 500 workspace users.
- Enable or disable seven-digit profile-prefix expansion, ten-digit country expansion, other national lengths, IDD removal, and trunk removal.
- Seven-digit expansion requires a saved international phone number matching the profile country. The first three national phone digits follow the country calling code.
- Recommended defaults sets all controls on in the form; Save settings applies them.
- Remove user override resumes workspace inheritance. New users inherit automatically.
- Preview uses the selected user's saved profile and saved rules. It never places a call or verifies carrier acceptance. Internal extensions and native emergency handoff remain separate.
- Recent history records administrator, scope, action and timestamp. Database events retain before/after settings.

Tables: dialing_policies (tenant and scope composite key, settings JSON, revision and administrator) and dialing_policy_events (tenant, scope, administrator, before/after settings and timestamp). Writes require super-admin access and use a tenant transaction lock plus revision checks.

Deploy with deploy/ansible/dialing-admin-local.yml. This playbook backs up source and MySQL, preserves local server integrations and Compose mounts, builds both services, tests normalization, creates the additive tables, and restarts API and web. The production MySQL migration and browser behavior must be verified after deployment; local checks use database mocks.
