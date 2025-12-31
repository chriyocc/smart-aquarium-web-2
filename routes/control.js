import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/latest", async (req, res) => {
  try {
    // Fetch the oldest unprocessed command
    const { data: command, error } = await supabase
      .from('command_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching latest command:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!command) {
      return res.json({ has_command: false });
    }

    // Mark as processed immediately
    const { error: updateError } = await supabase
      .from('command_queue')
      .update({ processed: true, processed_at: new Date() })
      .eq('id', command.id);

    if (updateError) {
      console.error("Error marking command as processed:", updateError);
      // We still return the command even if the mark-back fails, 
      // though this might lead to duplicates if polling is fast.
    }

    res.json({
      has_command: true,
      command: {
        type: command.type,
        value: command.value
      }
    });

  } catch (err) {
    console.error("Backend Exception /control/latest:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/pump", requireAdmin, async (req, res) => {
  const { state } = req.body; // true/false

  // 1. Update DB State
  const { error: dbError } = await supabase
    .from('device_state')
    .update({ pump_active: state })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (dbError) {
    return res.status(500).json({ error: dbError.message });
  }

  // 2. Queue for ESP32 in command_queue table
  const { error: queueError } = await supabase
    .from('command_queue')
    .insert([{ type: 'PUMP', value: state }]);

  if (queueError) {
    return res.status(500).json({ error: queueError.message });
  }

  res.json({
    status: "queued",
    command: { type: "PUMP", value: state }
  });
});

router.post("/feed", requireAdmin, async (req, res) => {
  // 1. Update Last Fed
  const { error: dbError } = await supabase
    .from('device_state')
    .update({ last_fed_at: new Date() })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (dbError) return res.status(500).json({ error: dbError.message });

  // 2. Queue command
  const { error: queueError } = await supabase
    .from('command_queue')
    .insert([{ type: 'FEED', value: 'NOW' }]);

  if (queueError) return res.status(500).json({ error: queueError.message });

  res.json({ status: "queued" });
});

router.post("/brightness", requireAdmin, async (req, res) => {
  const { value } = req.body;

  // 1. Update State
  const { error: dbError } = await supabase
    .from('device_state')
    .update({ brightness: value })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (dbError) return res.status(500).json({ error: dbError.message });

  // 2. Queue command
  const { error: queueError } = await supabase
    .from('command_queue')
    .insert([{ type: 'LIGHT', value: value }]);

  if (queueError) return res.status(500).json({ error: queueError.message });

  res.json({
    status: "queued",
    command: { type: "LIGHT", value }
  });
});

router.post("/feeding-settings", requireAdmin, async (req, res) => {
  const { interval, quantity } = req.body;

  const updates = {};
  if (interval !== undefined) updates.feeding_interval = interval;
  if (quantity !== undefined) updates.feeding_quantity = quantity;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }

  // 1. Update settings
  const { error: dbError } = await supabase
    .from('device_state')
    .update(updates)
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (dbError) return res.status(500).json({ error: dbError.message });

  // 2. Queue CONFIG update for ESP32
  const { error: queueError } = await supabase
    .from('command_queue')
    .insert([{ 
        type: 'CONFIG', 
        value: { interval, quantity } 
    }]);

  if (queueError) return res.status(500).json({ error: queueError.message });

  res.json({ success: true });
});

export default router;
