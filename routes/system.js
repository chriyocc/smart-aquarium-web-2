import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  // Check DB connection AND Device Heartbeat
  const { data: device, error } = await supabase
    .from('device_state')
    .select('last_seen')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();

  const dbOnline = !error;
  let deviceOnline = false;
  let lastSeen = null;

  if (device && device.last_seen) {
      lastSeen = device.last_seen;
      const diffMs = new Date() - new Date(lastSeen);
      if (diffMs < 60000) { // 60 seconds threshold
          deviceOnline = true;
      }
  }

  res.json({
    esp32_online: deviceOnline, 
    last_seen: lastSeen
  });
});

export default router;
