import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()
  if (req.method === 'POST') {
    const { userId, subscription } = req.body
    if (!userId || !subscription) return res.status(400).json({ error: 'Missing params' })
    await sb.from('push_subscriptions').upsert(
      { user_id: userId, subscription },
      { onConflict: 'user_id' }
    )
    return res.status(200).json({ ok: true })
  }
  if (req.method === 'DELETE') {
    const { userId } = req.body
    if (userId) await sb.from('push_subscriptions').delete().eq('user_id', userId)
    return res.status(200).json({ ok: true })
  }
  return res.status(405).end()
}
