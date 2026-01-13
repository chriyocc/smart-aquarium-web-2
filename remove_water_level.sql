-- Migration: Remove water_level column
-- Run this in your Supabase SQL Editor

ALTER TABLE sensor_readings
DROP COLUMN IF EXISTS water_level;
