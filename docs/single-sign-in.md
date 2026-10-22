# One sign-in and one create-account entry

The header and public account navigation expose only Sign in and Create account. User, administrator and super-administrator choices are removed. All local accounts use `/api/login`; role and tenant come from the authenticated database record, never the chosen page or request payload. New public registrations explicitly insert `role='user'` so the database default or an extra signup field cannot assign elevated privileges.

Passkeys remain a method on the same login screen. Directory authentication remains inside the common sign-in page under a collapsed Organization directory section; directory credentials retain their existing backend and tenant policy. Legacy role/directory sign-in page URLs redirect to `/pages/login`. This does not infer an LDAP tenant from an email domain or merge accounts across tenants.

The rollout first installs the previously implemented account PIN/phone OTP code and migrations, then applies preserving source edits and builds/tests both images. The existing identity database is retained. No duplicate account store or second role table is introduced. A metadata-only post-deployment audit verifies 15 shared tables for tenants/users, profiles/groups, sessions, CAPTCHA/email legacy verification, passkeys, encrypted provider settings and account PIN/OTP policy/challenges. Existing startup migrations own schema creation; absent required columns fail the audit with exact names.

Phone verification policies default off and require an enabled Twilio hub plus a separate account Verify Service in the super-admin GUI. Existing PIN/OTP verification is preserved, with the phone-verification forms kept visible during the signup page flow. No admin account is created or promoted. No production call, message or Twilio purchase is made by this deployment.

Each installation stage has independent source/image backups. If the second stage fails, the successful shared-authentication prerequisite remains installed. Additive tables are retained. Full database and actual Twilio delivery acceptance must be checked on the host; local tests do not substitute for those live results.
