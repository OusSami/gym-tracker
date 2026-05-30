import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    // Try to fetch profile - if it doesn't exist, create it first
    let { data, error } = await sb.from('profiles').select('*').eq('id', userId).single()

    if (error && error.code === 'PGRST116') {
      // Row not found - create it (trigger may not have fired)
      const { data: newRow, error: insertErr } = await sb.from('profiles')
        .insert({ id: userId, unit_system: 'metric', fitness_level: 'beginner', goal: 'general', onboarded: false })
        .select().single()
      if (insertErr) {
        console.error('Profile insert error:', insertErr.message)
        return res.status(500).json({ error: insertErr.message })
      }
      return res.status(200).json({ profile: newRow })
    }

    if (error) {
      console.error('Profile fetch error:', error.message, error.code)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ profile: data })
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const { userId, ...fields } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    const allowed = ['unit_system','birthday','fitness_level','weight_kg','height_cm','goal','onboarded','full_name','email','sex']
    const updates = {}
    allowed.forEach(k => {
      if (fields[k] !== undefined && fields[k] !== null) {
        // Allow empty string to clear a field, but not undefined/null
        updates[k] = fields[k] === '' ? null : fields[k]
      }
    })

    console.log('Profile upsert for', userId, ':', updates)

    // Record weight history if weight changed
    if (updates.weight_kg && parseFloat(updates.weight_kg) > 0) {
      await sb.from('weight_history').insert({ user_id: userId, weight_kg: parseFloat(updates.weight_kg) })
        .then(({error: e}) => { if (e) console.error('Weight history error:', e.message) })
    }

    const { data, error } = await sb.from('profiles')
      .upsert({ id: userId, ...updates }, { onConflict: 'id' })
      .select().single()

    if (error) {
      console.error('Profile upsert error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ profile: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
