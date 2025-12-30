-- Grant Admin Access to User
-- User ID from logs: 53091a9c-f60d-46a9-a4c1-84c225395fe2

INSERT INTO admin_users (user_id, email)
SELECT '53091a9c-f60d-46a9-a4c1-84c225395fe2', 'admin@aquarium.com'
WHERE NOT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = '53091a9c-f60d-46a9-a4c1-84c225395fe2'
);
