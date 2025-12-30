import { supabase } from '../lib/supabase.js';

export const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // 1. Verify Token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // 2. Verify Admin Status in Database (Bypass RLS via Service Key)
    const { data: adminRow, error: dbError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError || !adminRow) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Attach user to request for downstream use
    req.user = user;
    next();

  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
