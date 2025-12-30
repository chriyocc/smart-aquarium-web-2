import express from "express";
import { setCommand, getCommand } from "../mock/controlQueue.js";
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/latest", (req, res) => {
  const cmd = getCommand();
  if (!cmd) {
    return res.json({ has_command: false });
  }

  res.json({
    has_command: true,
    command: cmd
  });
});

router.post("/pump", requireAdmin, async (req, res) => {
  const { state } = req.body; // true/false

  // Update DB
  const { error } = await supabase
    .from('device_state')
    .update({ pump_active: state })
    .eq('id', '00000000-0000-0000-0000-000000000001'); // Singleton ID

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Still queue for ESP32
  const command = {
    type: "PUMP",
    value: state
  };
  setCommand(command);

  res.json({
    status: "queued",
    command
  });
});

router.post("/feed", requireAdmin, async (req, res) => {
  // Update DB Last Fed
  const { error } = await supabase
    .from('device_state')
    .update({ 
        last_fed_at: new Date(),
        // Calculate next feeding based on interval logic later (mocking simplified here)
     })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (error) res.status(500).json({ error });

  const command = {
    type: "FEED",
    value: "NOW"
  };

  setCommand(command);

  res.json({ status: "queued" });
});

router.post("/brightness", requireAdmin, async (req, res) => {
  const { value } = req.body; // 0-100

  // Update DB
  const { error } = await supabase
    .from('device_state')
    .update({ brightness: value })
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Queue command
  const command = {
    type: "LIGHT",
    value: value
  };
  setCommand(command);

  res.json({
    status: "queued",
    command
  });

});

router.post("/feeding-settings", requireAdmin, async (req, res) => {
  const { interval, quantity } = req.body;

  // Build update object dynamically
  const updates = {};
  if (interval !== undefined) updates.feeding_interval = interval;
  if (quantity !== undefined) updates.feeding_quantity = quantity;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }

  const { error } = await supabase
    .from('device_state')
    .update(updates)
    .eq('id', '00000000-0000-0000-0000-000000000001');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Also queue a config command for ESP32 if needed, 
  // or just let it sync next time it polls.
  // For now, let's assume ESP32 polls settings or we push a CONFIG command.
  const command = {
    type: "CONFIG",
    interval,
    quantity
  };
  setCommand(command);

  res.json({ success: true, command });
});

export default router;
