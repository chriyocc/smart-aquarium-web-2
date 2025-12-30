-- Migration: Add Feeding Settings Columns (if missing)

-- 1. Add 'feeding_interval' column to 'device_state' table
-- Default to '4h'
ALTER TABLE device_state 
ADD COLUMN IF NOT EXISTS feeding_interval TEXT DEFAULT '4h';

-- 2. Add 'feeding_quantity' column to 'device_state' table
-- Default to 1 (scoop)
ALTER TABLE device_state 
ADD COLUMN IF NOT EXISTS feeding_quantity INTEGER DEFAULT 1;

-- 3. Just to be safe, grant permissions again (though likely persisted)
GRANT ALL ON TABLE device_state TO authenticated;
GRANT ALL ON TABLE device_state TO service_role;
