import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb.from('workout_templates').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ templates: data || [] })
  }

  if (req.method === 'POST') {
    const { userId, name, muscles, exercises } = req.body
    if (!userId || !name) return res.status(400).json({ error: 'Missing userId or name' })
    const { data, error } = await sb.from('workout_templates').insert({ user_id: userId, name, muscles: muscles || [], exercises: exercises || [] }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ template: data })
  }

  if (req.method === 'PUT') {
    const { userId, id, name, muscles, exercises } = req.body
    if (!userId || !id) return res.status(400).json({ error: 'Missing userId or id' })
    const { data, error } = await sb.from('workout_templates').update({ name, muscles: muscles||[], exercises: exercises||[] }).eq('id', id).eq('user_id', userId).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ template: data })
  }

  if (req.method === 'DELETE') {
    const { id, userId } = req.body
    if (!id || !userId) return res.status(400).json({ error: 'Missing id or userId' })
    await sb.from('workout_templates').delete().eq('id', id).eq('user_id', userId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
