import express from "express";
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

// Helper to parse interval strings (e.g., '30s', '1m', '4h') into KEY milliseconds
const parseIntervalToMs = (intervalStr) => {
  if (!intervalStr) return 4 * 60 * 60 * 1000; // Default 4h

  // Try to match value and unit
  const match = intervalStr.match(/(\d+)([smh]?)/);
  if (!match) return 4 * 60 * 60 * 1000;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch(unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return value * 60 * 60 * 1000; // Default to hours if no unit (legacy)
  }
};


// Helper: Cancel any pending commands of a specific type (Superseding)
const cancelPendingCommands = async (type) => {
  const { error } = await supabase
    .from('command_queue')
    .update({ processed: true, processed_at: new Date() })
    .eq('type', type)
    .eq('processed', false);
  
  if (error) console.error(`Error canceling pending ${type} commands:`, error);
};

router.get("/latest", async (req, res) => {
  try {
    // 0. (Heartbeat) Update Last Seen for Device ID 1
    await supabase 
      .from('device_state')
      .update({ last_seen: new Date() })
      .eq('id', '00000000-0000-0000-0000-000000000001');

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

    // Expiration Logic: Check if command is older than 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const cmdTime = new Date(command.created_at);
    
    if (cmdTime < tenMinAgo) {
      // Mark expired command as processed so we don't get it again
      await supabase
        .from('command_queue')
        .update({ processed: true, processed_at: new Date() })
        .eq('id', command.id);
        
      // Return empty for this poll (next poll will get the next valid one)
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
  // (Optimization) Supersede old PUMP commands
  await cancelPendingCommands('PUMP');

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
      .select('next_feeding_at, feeding_interval')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (fetchError) return res.status(500).json({ error: fetchError.message });

    // 2. Calculate next feeding (Reset sync: NOW + interval)
    // User prefers schedule to drift based on actual feeding time.
    const intervalMs = parseIntervalToMs(device.feeding_interval);
    const now = new Date();
    const newNext = new Date(now.getTime() + intervalMs);

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
    // (Optimization) Supersede old FEED commands
    await cancelPendingCommands('FEED');

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
  // (Optimization) Supersede old LIGHT commands
  await cancelPendingCommands('LIGHT');

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



    // 3. Update settings and schedule
    const { error: dbError } = await supabase
      .from('device_state')
      .update(updates)
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (dbError) return res.status(500).json({ error: dbError.message });

    // 4. Queue CONFIG update for ESP32
    // (Optimization) Supersede old CONFIG commands
    await cancelPendingCommands('CONFIG');

    const { error: queueError } = await supabase
      .from('command_queue')
      .insert([{ 
          type: 'CONFIG', 
          value: { interval, quantity } 
      }]);

    if (queueError) return res.status(500).json({ error: queueError.message });

    res.json({ success: true, message: "Settings updated for future cycles" });

  } catch (err) {
    console.error("Update Feeding Settings Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint for Device to confirm it just fed automatically
router.post("/confirm-feed", async (req, res) => {
  try {
    // 1. Get current interval
    const { data: device, error: fetchError } = await supabase
      .from('device_state')
      .select('feeding_interval')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (fetchError) return res.status(500).json({ error: fetchError.message });

    // 2. Calculate next feeding
    const intervalMs = parseIntervalToMs(device.feeding_interval);
    const now = new Date();
    const newNext = new Date(now.getTime() + intervalMs);

    // 3. Update State
    const { error: dbError } = await supabase
      .from('device_state')
      .update({ 
        last_fed_at: now,
        next_feeding_at: newNext
      })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (dbError) return res.status(500).json({ error: dbError.message });

    console.log(`Feeding confirmed by device. Next feeding at: ${newNext.toISOString()}`);
    res.json({ success: true, next_feeding_at: newNext });

  } catch (err) {
    console.error("Confirm Feed Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
