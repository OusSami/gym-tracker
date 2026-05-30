import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb
      .from('weight_history')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ entries: data || [] })
  }

  if (req.method === 'POST') {
    const { userId, weight_kg, recorded_at, unit_system } = req.body
    if (!userId || !weight_kg) return res.status(400).json({ error: 'Missing userId or weight' })

    const weightInKg = unit_system === 'imperial'
      ? Math.round(parseFloat(weight_kg) * 0.453592 * 10) / 10
      : Math.round(parseFloat(weight_kg) * 10) / 10

    const date = recorded_at || new Date().toISOString().split('T')[0]

    // Upsert by date - one entry per day
    const { data: existing } = await sb
      .from('weight_history')
      .select('id')
      .eq('user_id', userId)
      .eq('recorded_at', date)
      .single()

    let entry
    if (existing) {
      const { data } = await sb.from('weight_history')
        .update({ weight_kg: weightInKg })
        .eq('id', existing.id)
        .select().single()
      entry = data
    } else {
      const { data } = await sb.from('weight_history')
        .insert({ user_id: userId, weight_kg: weightInKg, recorded_at: date })
        .select().single()
      entry = data
    }

    // Also update the current weight in profiles
    await sb.from('profiles').update({ weight_kg: weightInKg }).eq('id', userId)

    return res.status(200).json({ entry })
  }

  if (req.method === 'DELETE') {
    const { id, userId } = req.body
    if (!id || !userId) return res.status(400).json({ error: 'Missing id or userId' })
    const { error } = await sb.from('weight_history').delete().eq('id', id).eq('user_id', userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
