import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  // Check DB connection by selecting a lightweight row
  const { data, error } = await supabase.from('device_state').select('id').limit(1);
  const dbOnline = !error;

  res.json({
    esp32_online: dbOnline, // Treating DB access as "online" for now. In real IoT, this would check last heartbeat.
    last_seen: new Date().toISOString()
  });
});

export default router;
