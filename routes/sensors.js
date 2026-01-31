import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/latest", async (req, res) => {
  // 1. Get latest reading
  const { data: reading, error: readingError } = await supabase
    .from('sensor_readings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (readingError) {
    console.error('Error fetching reading:', readingError);
    // Fallback or error? For now, 500
    return res.status(500).json({ error: readingError.message });
  }

  // 2. Get device state (pump, feeding settings)
  const { data: device, error: deviceError } = await supabase
    .from('device_state')
    .select('*')
    .limit(1)
    .single();
    
  if (deviceError) {
    console.error('Error fetching device:', deviceError);
  }

  // 3. Get last pump toggle time
  const { data: lastPumpCmd } = await supabase
    .from('command_queue')
    .select('created_at')
    .eq('type', 'PUMP')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({
    temperature: reading.temperature,
    brightness: device?.brightness,
    pump_status: device?.pump_active ? "ON" : "OFF",
    feeding: {
      next_feeding: device?.next_feeding_at,
      interval: device?.feeding_interval,
      quantity: device?.feeding_quantity,
      last_fed: device?.last_fed_at
    },
    last_updated: reading.created_at,
    last_pump_toggle: lastPumpCmd?.created_at
  });
});

router.get("/history", async (req, res) => {
  const { range } = req.query; // '24h', '7d', '30d'
  
  // Calculate start time based on range
  let startTime = new Date();
  if (range === '7d') {
    startTime.setDate(startTime.getDate() - 7);
  } else if (range === '30d') {
    startTime.setDate(startTime.getDate() - 30);
  } else {
    // Default to 24h
    startTime.setHours(startTime.getHours() - 24);
  }

  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .gte('created_at', startTime.toISOString())
    .order('created_at', { ascending: true }) 
    .limit(500); // Increased limit for longer ranges

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ data }); // Frontend expects { data: [...] }
});

// Helper: Cancel any pending commands of a specific type
const cancelPendingCommands = async (type) => {
  const { error } = await supabase
    .from('command_queue')
    .update({ processed: true, processed_at: new Date() })
    .eq('type', type)
    .eq('processed', false);
    
  if (error) console.error(`Error canceling pending ${type} commands:`, error);
};

router.post("/upload", async (req, res) => {
  const { temperature } = req.body;
  
  // 1. Insert Sensor Reading
  const { error } = await supabase
    .from('sensor_readings')
    .insert([
      { temperature }
    ]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 2. Auto-Pump Logic (Threshold > 28°C)
  if (temperature > 28.0) {
    try {
      // Check if pump is already ON to avoid spamming
      const { data: device } = await supabase
        .from('device_state')
        .select('pump_active')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (device && !device.pump_active) {
        console.log(`Temp ${temperature}°C > 28°C. Auto-activating pump.`);

        // A. Update State
        await supabase
          .from('device_state')
          .update({ pump_active: true })
          .eq('id', '00000000-0000-0000-0000-000000000001');

        // B. Queue Command
        await cancelPendingCommands('PUMP');
        await supabase
          .from('command_queue')
          .insert([{ type: 'PUMP', value: 'ON' }]);
      }
    } catch (err) {
      console.error("Auto-Pump Check Error:", err);
      // Don't fail the upload just because auto-logic failed
    }
  }

  res.json({ success: true });
});

export default router;
