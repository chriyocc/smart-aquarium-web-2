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

  res.json({
    temperature: reading.temperature,
    brightness: device?.brightness,
    water_level: reading.water_level,
    pump_status: device?.pump_active ? "ON" : "OFF",
    feeding: {
      next_feeding: device?.next_feeding_at,
      interval: device?.feeding_interval,
      quantity: device?.feeding_quantity,
      last_fed: device?.last_fed_at
    },
    last_updated: reading.created_at
  });
});

router.get("/history", async (req, res) => {
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .order('created_at', { ascending: true }) 
    .limit(24);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ data }); // Frontend expects { data: [...] }
});

router.post("/upload", async (req, res) => {
  const { temperature, water_level } = req.body;
  
  const { error } = await supabase
    .from('sensor_readings')
    .insert([
      { temperature, water_level }
    ]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

export default router;
