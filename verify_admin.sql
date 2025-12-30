-- Verify Admin Users
-- Run this to see who is actually an admin in the database.

SELECT * FROM admin_users;

-- Check specifically for your ID (replace with the ID from your console logs if different)
SELECT * FROM admin_users WHERE user_id = '53091a9c-f60d-46a9-a4c1-84c225395fe2';
