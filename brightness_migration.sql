-- Migration: Refactor Lux to Brightness

-- 1. Add 'brightness' column to 'device_state' table
-- Default to 80 (integer percentage)
ALTER TABLE device_state 
ADD COLUMN brightness INTEGER DEFAULT 80;

-- 2. Drop 'lux' column from 'sensor_readings' table
-- We no longer track read-only light levels
ALTER TABLE sensor_readings 
DROP COLUMN lux;

-- 3. Update RLS policies (if needed) - existing policies for device_state should cover the new column
-- but we might want to ensure public read is still allowed (it is, by "Enable read access for all users")
