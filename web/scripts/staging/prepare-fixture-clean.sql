-- Prepare a clean local/staging DB by removing local fixture rows.
-- DO NOT run against production.
-- Safe for databases seeded with convex_id / emails prefixed local_ or staging_e2e_.

BEGIN;

-- Order respects FKs where possible; cascade where Prisma uses Restrict may need manual care.
-- Prefer deleting by user id for fixture users.

DELETE FROM password_reset_tokens
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM sessions
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM auth_audit_events
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM profile_audit_events
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM auth_accounts
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM profiles
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM preferences
WHERE user_id IN (
  SELECT id FROM users
  WHERE convex_id LIKE 'local_%'
     OR convex_id LIKE 'staging_e2e_%'
     OR email_normalized LIKE 'local_%'
     OR email_normalized LIKE 'staging.e2e.%'
);

DELETE FROM users
WHERE convex_id LIKE 'local_%'
   OR convex_id LIKE 'staging_e2e_%'
   OR email_normalized LIKE 'local_%'
   OR email_normalized LIKE 'staging.e2e.%';

COMMIT;
