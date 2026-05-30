import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  // Simple admin check via email header (set by auth middleware)
  const adminEmail = process.env.ADMIN_EMAIL
  const requestEmail = req.headers['x-user-email']
  if (!requestEmail || requestEmail !== adminEmail)
    return res.status(403).json({ error: 'Forbidden' })

  const sb = supabaseAdmin()

  const { data: users, error: uErr } = await sb.from('profiles').select('*').order('created_at', { ascending: false })
  if (uErr) return res.status(500).json({ error: uErr.message })

  const { data: sessions, error: sErr } = await sb
    .from('sessions')
    .select('*, exercises(*, sets(*))')
    .order('created_at', { ascending: false })
  if (sErr) return res.status(500).json({ error: sErr.message })

  return res.status(200).json({ users, sessions })
}
