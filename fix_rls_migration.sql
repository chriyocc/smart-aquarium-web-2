-- Fix Recursive RLS Policy on admin_users table

-- 1. Drop the problematic recursive policy
DROP POLICY IF EXISTS "Admins View Admins" ON admin_users;

-- 2. Create a safe policy: Users can ONLY see their own row
-- This breaks the recursion because checking "auth.uid() = user_id" does not require a subquery on the table itself.
CREATE POLICY "View Own Admin Status" ON admin_users
    FOR SELECT
    USING (auth.uid() = user_id);

-- 3. Allow Service Role full access (just in case)
-- (Service role usually bypasses RLS, but explicit policies help clarity)
-- Note: 'service_role' key logic usually bypasses RLS automatically.
