import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb.from('custom_meals').select('*').eq('user_id', userId).order('times_used', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ meals: data || [] })
  }

  if (req.method === 'POST') {
    const { userId, ...meal } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb.from('custom_meals').insert({
      user_id: userId,
      meal_name: meal.meal_name,
      meal_type: meal.meal_type || 'snack',
      total_calories: meal.total_calories || 0,
      protein_g: meal.protein_g || 0,
      carbs_g: meal.carbs_g || 0,
      fat_g: meal.fat_g || 0,
      fiber_g: meal.fiber_g || 0,
      sugar_g: meal.sugar_g || 0,
      saturated_fat_g: meal.saturated_fat_g || 0,
      sodium_mg: meal.sodium_mg || 0,
      potassium_mg: meal.potassium_mg || 0,
      portion_note: meal.portion_note || '',
      ingredients: meal.ingredients || null,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ meal: data })
  }

  if (req.method === 'PATCH') {
    // Increment times_used
    const { id } = req.body
    await sb.rpc('increment_meal_usage', { meal_id: id }).catch(() => {})
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { id, userId } = req.body
    await sb.from('custom_meals').delete().eq('id', id).eq('user_id', userId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
