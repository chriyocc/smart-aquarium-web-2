import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// Helper to parse interval strings (e.g., '12h', '12 Hours') into hours
const parseIntervalToHours = (intervalStr) => {
  if (!intervalStr) return 4; // Default
  const match = intervalStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 4;
};

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
  try {
    // 1. Get current state to know the current schedule
    const { data: device, error: fetchError } = await supabase
      .from('device_state')
      .select('next_feeding_at', 'feeding_interval')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (fetchError) return res.status(500).json({ error: fetchError.message });

    // 2. Calculate next feeding (maintain sync: current_next + interval)
    const intervalHours = parseIntervalToHours(device.feeding_interval);
    const currentNext = new Date(device.next_feeding_at || new Date());
    const newNext = new Date(currentNext.getTime() + (intervalHours * 60 * 60 * 1000));

    // 3. Update Last Fed and Next Feeding
    const { error: dbError } = await supabase
      .from('device_state')
      .update({ 
        last_fed_at: new Date(),
        next_feeding_at: newNext
      })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (dbError) return res.status(500).json({ error: dbError.message });

    // 4. Queue command
    const { error: queueError } = await supabase
      .from('command_queue')
      .insert([{ type: 'FEED', value: 'NOW' }]);

    if (queueError) return res.status(500).json({ error: queueError.message });

    res.json({ status: "queued", next_feeding_at: newNext });

  } catch (err) {
    console.error("Manual Feed Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
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

  try {
    const updates = {};
    if (interval !== undefined) updates.feeding_interval = interval;
    if (quantity !== undefined) updates.feeding_quantity = quantity;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No settings provided" });
    }

    // 1. Get last_fed_at to recalculate the next move
    const { data: device, error: fetchError } = await supabase
      .from('device_state')
      .select('last_fed_at')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (fetchError) return res.status(500).json({ error: fetchError.message });

    // 2. Recalculate next_feeding_at if interval changed
    if (interval) {
        const intervalHours = parseIntervalToHours(interval);
        const lastFed = new Date(device.last_fed_at || new Date());
        updates.next_feeding_at = new Date(lastFed.getTime() + (intervalHours * 60 * 60 * 1000));
    }

    // 3. Update settings and schedule
    const { error: dbError } = await supabase
      .from('device_state')
      .update(updates)
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (dbError) return res.status(500).json({ error: dbError.message });

    // 4. Queue CONFIG update for ESP32
    const { error: queueError } = await supabase
      .from('command_queue')
      .insert([{ 
          type: 'CONFIG', 
          value: { interval, quantity } 
      }]);

    if (queueError) return res.status(500).json({ error: queueError.message });

    res.json({ success: true, next_feeding_at: updates.next_feeding_at });

  } catch (err) {
    console.error("Update Feeding Settings Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
