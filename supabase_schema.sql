-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: sensor_readings
-- Stores historical sensor data uploaded by ESP32 or generated for history.
CREATE TABLE IF NOT EXISTS sensor_readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    temperature DECIMAL(5, 2) NOT NULL, -- e.g. 26.50
    lux INTEGER NOT NULL,               -- e.g. 340
    water_level DECIMAL(5, 2) NOT NULL, -- Percentage, e.g. 82.00
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: device_state
-- Singleton table to store the current state of the aquarium controller.
-- We will enforce a single row logic via application or constraints if needed, 
-- but for now, we assume row with specific ID is the "main" controller.
CREATE TABLE IF NOT EXISTS device_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pump_active BOOLEAN DEFAULT FALSE,
    feeding_interval TEXT DEFAULT '4h', -- '4h', '8h', '12h', '24h'
    feeding_quantity INTEGER DEFAULT 1, -- 1, 2, 3 scoops
    last_fed_at TIMESTAMPTZ,
    next_feeding_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: admin_users
-- Whitelist of users who have admin access.
-- This links to Supabase internal auth.users via ID or Email.
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Link to Supabase Auth
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------

-- 1. Enable RLS on all tables
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Policies for sensor_readings
-- Everyone can view sensor history (Public Dashboard)
CREATE POLICY "Public Read Sensors" ON sensor_readings
    FOR SELECT USING (true);

-- Only authenticated devices/admins can insert (Service Role usually bypasses RLS, but for explicit safety)
-- Assuming ESP32 uses a specific Service Key or Admin user
CREATE POLICY "Admin Insert Sensors" ON sensor_readings
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM admin_users) OR 
        auth.role() = 'service_role'
    );

-- 3. Policies for device_state
-- Everyone can view the aquarium status
CREATE POLICY "Public Read Device State" ON device_state
    FOR SELECT USING (true);

-- Only Admins can change settings (Feed, Pump, etc.)
CREATE POLICY "Admin Update Device State" ON device_state
    FOR UPDATE USING (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );

-- 4. Policies for admin_users
-- Admins can view other admins (for management UI)
CREATE POLICY "Admins View Admins" ON admin_users
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );
-- (Optional) If you want manual insert of first admin, you might need to run SQL directly in dashboard to bypass this initially.

-- ---------------------------------------------------------
-- SAMPLE DATA GENERATION
-- ---------------------------------------------------------

-- 1. Insert Initial Device State
INSERT INTO device_state (id, pump_active, feeding_interval, feeding_quantity, last_fed_at, next_feeding_at)
VALUES (
    '00000000-0000-0000-0000-000000000001', -- Fixed ID for simplicity
    FALSE, 
    '4h', 
    1, 
    NOW() - INTERVAL '2 hours',
    NOW() + INTERVAL '2 hours'
);

-- 2. Insert Sample Admin (Placeholder)
-- You must replace this UUID with your actual Supabase User ID from the Auth tab.
-- INSERT INTO admin_users (user_id, email) VALUES ('YOUR_SUPABASE_USER_ID', 'admin@example.com');

-- 2. Insert 24 Hours of Sensor Readings (Hourly)
-- Generates a sine wave-like pattern for temperature to look realistic.
INSERT INTO sensor_readings (temperature, lux, water_level, created_at)
SELECT 
    26.0 + (1.5 * SIN((EXTRACT(EPOCH FROM series) / 3600) * (2 * 3.14159 / 24))), -- Temp oscillates between 24.5 and 27.5
    CASE 
        WHEN EXTRACT(HOUR FROM series) BETWEEN 8 AND 18 THEN 350 + (RANDOM() * 50)::INTEGER -- Day: High Lux
        ELSE 0 -- Night: 0 Lux
    END,
    80.0 + (RANDOM() * 5), -- Water level fluctuates slightly between 80-85%
    series
FROM generate_series(NOW() - INTERVAL '24 hours', NOW(), '1 hour') AS series;

-- 3. Insert specific "Latest" reading to match current moment
INSERT INTO sensor_readings (temperature, lux, water_level, created_at)
VALUES (28.6, 340, 82.0, NOW());
