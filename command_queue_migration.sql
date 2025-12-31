-- Create a table to store commands for the ESP32
CREATE TABLE IF NOT EXISTS command_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,         -- e.g. 'PUMP', 'FEED', 'LIGHT', 'CONFIG'
    value JSONB,                -- Store value or complex settings
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE command_queue ENABLE ROW LEVEL SECURITY;

-- Allow public read (ESP32 might read this if it doesn't have an auth token yet, 
-- but better to restrict to Service Role/Admins)
CREATE POLICY "Service Role Access" ON command_queue
    FOR ALL USING (auth.role() = 'service_role');

-- Allow admins full control
CREATE POLICY "Admins Full Access" ON command_queue
    FOR ALL USING (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );
