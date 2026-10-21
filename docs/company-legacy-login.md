# Company Legacy Password Login

## Confirmed Code Gap

Creating a registry account through `/api/users` does not create a Supabase Auth
identity. Previously `/api/login` verified a legacy password after an Auth
failure but always returned `AUTH_ACCOUNT_NOT_READY`. This blocked unprovisioned
companies even when their current registry password was correct.

## Controlled First Login

Normal Supabase login remains first. Company logins also try a stable internal
identity derived from their registry ID. It is independent of contact-email
edits and shared business contact addresses.

Only when the provider returns invalid credentials AND the current server-side
registry password verifies may a company account migrate. Staff, inactive,
unknown and ambiguous accounts do not use this migration. A complete paginated
Auth-directory lookup checks registry binding, Auth ID, username and email.
An existing identity, failed lookup or incomplete lookup prevents creation.

For an absent identity, server-only `auth.admin.createUser` receives the password
the company just verified. No new password is invented or printed. The internal
alias is confirmed as a username identity; this does not confirm ownership of
the company's contact email. Trusted app metadata binds the signed identity to
the existing registry row. The server resolves that binding on subsequent API
calls and rejects a missing registry row.

Supabase still issues the session and enforces password policy. There is no
unsigned legacy session, public password/hash lookup or browser-held service
key. A short password rejected by provider policy still needs administrator
assistance. Directory lookups are only performed for verified migration attempts,
not every ordinary successful login.

## Existing Auth Accounts

No existing password, ban, MFA setting or email-confirmation state is changed.
An existing conflicting Auth account still returns the administrator-review
message rather than resetting its password from potentially stale legacy data.
The former `/api/provision-auth-session` reset endpoint now returns HTTP 410;
current application clients already use `/api/login`.

Password-change verification uses the same server login path rather than guessing
an Auth address from editable contact details. After an Auth password change,
the new password can sign in through the stable alias even if a subsequent
registry-hash update failed. The old registry password cannot reset that identity.

## Verification And Rollout

- `npm run auth:check`: normal username/email login, role/account states and failures.
- `npm run auth:company-check`: synthetic first-login migration, signed sessions,
  changed passwords, stale-password rejection, contact edits, collisions and
  directory pagination. No production account is read or changed.
- Build, lint and `npm run routing:check` verify the actual server bundle and the
  retired provisioning route.

No SQL migration is required. Deployment requires owner approval. Deployment
itself does not bulk-create accounts: migration occurs when an eligible company
subsequently logs in. A specific affected username/error is still needed to
confirm whether a live account is missing, conflicting, inactive or failing for
another reason. Never request or log its password.

Provider reference: https://supabase.com/docs/reference/javascript/auth-admin-createuser
