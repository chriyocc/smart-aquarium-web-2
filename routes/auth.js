import express from "express";
import { supabase } from "../lib/supabase.js";

const router = express.Router();

router.get("/role/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Uses Service Role Key (Bypasses RLS)
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error("Backend Role Check Error:", error);
      return res.status(500).json({ error: error.message });
    }

    const role = data ? 'admin' : 'viewer';
    res.json({ role });
    
  } catch (err) {
    console.error("Backend Role Check Exception:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
