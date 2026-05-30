import { supabaseAdmin } from '../../lib/supabase'
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId, date } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    let q = sb.from('meals').select('*').eq('user_id', userId).order('logged_at', { ascending: true })
    if (date) q = q.eq('meal_date', date)
    else q = q.eq('meal_date', new Date().toISOString().split('T')[0])
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    
    // Also get water
    let wq = sb.from('water_logs').select('*').eq('user_id', userId)
    if (date) wq = wq.eq('log_date', date)
    else wq = wq.eq('log_date', new Date().toISOString().split('T')[0])
    const { data: water } = await wq
    
    return res.status(200).json({ meals: data || [], water: water || [] })
  }

  if (req.method === 'POST') {
    const { userId, mealType, ...fields } = req.body
    if (!userId || !mealType) return res.status(400).json({ error: 'Missing required fields' })
    
    if (mealType === 'water') {
      const { data, error } = await sb.from('water_logs')
        .insert({ user_id: userId, amount_ml: fields.amount_ml || 250, log_date: fields.meal_date || new Date().toISOString().split('T')[0] })
        .select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ water: data })
    }

    const { data, error } = await sb.from('meals').insert({
      user_id: userId,
      meal_type: mealType,
      meal_name: fields.meal_name,
      meal_date: fields.meal_date || new Date().toISOString().split('T')[0],
      total_calories: fields.total_calories || 0,
      protein_g: fields.protein_g || 0,
      carbs_g: fields.carbs_g || 0,
      fat_g: fields.fat_g || 0,
      fiber_g: fields.fiber_g || 0,
      sugar_g: fields.sugar_g || 0,
      saturated_fat_g: fields.saturated_fat_g || 0,
      cholesterol_mg: fields.cholesterol_mg || 0,
      sodium_mg: fields.sodium_mg || 0,
      potassium_mg: fields.potassium_mg || 0,
      portion_note: fields.portion_note,
      health_score: fields.health_score,
      ingredients: fields.ingredients || null,
      vitamins: fields.vitamins || [],
      allergens: fields.allergens || [],
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ meal: data })
  }

  if (req.method === 'PATCH') {
    const { id, userId, ...fields } = req.body
    if (!id || !userId) return res.status(400).json({ error: 'Missing id or userId' })
    const allowed = ['meal_name','total_calories','protein_g','carbs_g','fat_g','fiber_g',
      'sugar_g','saturated_fat_g','polyunsaturated_fat_g','monounsaturated_fat_g',
      'trans_fat_g','cholesterol_mg','sodium_mg','potassium_mg',
      'vitamin_a_mcg','vitamin_c_mg','calcium_mg','iron_mg','portion_note']
    const updates = {}
    allowed.forEach(k => { if (fields[k] !== undefined) updates[k] = fields[k] })
    const { data, error } = await sb.from('meals').update(updates).eq('id', id).eq('user_id', userId).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ meal: data })
  }

  if (req.method === 'DELETE') {
    const { id, type, userId } = req.body
    if (type === 'water') {
      const { error } = await sb.from('water_logs').delete().eq('id', id).eq('user_id', userId)
      if (error) return res.status(500).json({ error: error.message })
    } else {
      const { error } = await sb.from('meals').delete().eq('id', id).eq('user_id', userId)
      if (error) return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
