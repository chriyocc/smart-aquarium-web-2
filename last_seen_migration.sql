-- Add last_seen column to device_state if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'device_state' AND column_name = 'last_seen') THEN
        ALTER TABLE device_state ADD COLUMN last_seen TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
