-- Optional staging anonymization stub.
-- DO NOT run against production.
-- Review and expand before use.

-- Example (commented):
-- UPDATE users
-- SET email = 'user_' || id::text || '@staging.invalid',
--     email_normalized = 'user_' || id::text || '@staging.invalid'
-- WHERE email_normalized NOT LIKE '%@staging.invalid';

SELECT 1 AS anonymize_stub;
