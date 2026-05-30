import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  // GET — load stored report for a date
  if (req.method === 'GET') {
    const { userId, date } = req.query
    if (!userId || !date) return res.status(400).json({ error: 'Missing userId or date' })
    const { data } = await sb.from('daily_nutrition_reports')
      .select('report, meals_hash, updated_at')
      .eq('user_id', userId).eq('report_date', date).single()
    return res.status(200).json({ report: data?.report || null, meals_hash: data?.meals_hash || null, updated_at: data?.updated_at || null })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { meals, water_ml, goals, date, userId } = req.body
  if (!meals?.length) return res.status(400).json({ error: 'No meals to analyze' })
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

  // Build stable hash from meals so we can detect if anything changed
  const mealsHash = meals.map(m => m.id + ':' + m.total_calories).join('|')

  const totalCal   = meals.reduce((a, m) => a + (m.total_calories || 0), 0)
  const totalProt  = meals.reduce((a, m) => a + (m.protein_g || 0), 0)
  const totalCarbs = meals.reduce((a, m) => a + (m.carbs_g || 0), 0)
  const totalFat   = meals.reduce((a, m) => a + (m.fat_g || 0), 0)
  const totalFiber = meals.reduce((a, m) => a + (m.fiber_g || 0), 0)
  const totalSugar = meals.reduce((a, m) => a + (m.sugar_g || 0), 0)
  const totalSodium = meals.reduce((a, m) => a + (m.sodium_mg || 0), 0)

  const byType = {}
  meals.forEach(m => {
    if (!byType[m.meal_type]) byType[m.meal_type] = []
    byType[m.meal_type].push(m)
  })

  const mealSummary = Object.entries(byType).map(([type, mls]) => {
    const cal   = mls.reduce((a, m) => a + (m.total_calories || 0), 0)
    const prot  = mls.reduce((a, m) => a + (m.protein_g || 0), 0)
    const carbs = mls.reduce((a, m) => a + (m.carbs_g || 0), 0)
    const fat   = mls.reduce((a, m) => a + (m.fat_g || 0), 0)
    const items = mls.map(m => m.meal_name || 'Unknown').join(', ')
    return type.toUpperCase() + ': ' + items + ' (' + Math.round(cal) + ' kcal, P:' + Math.round(prot) + 'g, C:' + Math.round(carbs) + 'g, F:' + Math.round(fat) + 'g)'
  }).join('\n')

  const goalsText = goals
    ? 'Daily goals: ' + goals.calories + ' kcal, Protein ' + goals.protein_g + 'g, Carbs ' + goals.carbs_g + 'g, Fat ' + goals.fat_g + 'g, Fiber ' + goals.fiber_g + 'g'
    : 'No personalized goals set (use general WHO/NIH guidelines)'

  const prompt = [
    'You are an expert clinical dietitian. Analyze this full day of eating.',
    '',
    'DATE: ' + (date || 'today'),
    '',
    'MEALS:',
    mealSummary,
    '',
    'TOTALS: Calories ' + Math.round(totalCal) + ' kcal, Protein ' + Math.round(totalProt) + 'g, Carbs ' + Math.round(totalCarbs) + 'g, Fat ' + Math.round(totalFat) + 'g, Fiber ' + Math.round(totalFiber) + 'g, Sugar ' + Math.round(totalSugar) + 'g, Sodium ' + Math.round(totalSodium) + 'mg, Water ' + (water_ml || 0) + 'ml',
    '',
    goalsText,
    '',
    'Return ONLY a raw JSON object, no markdown, no backticks.',
    '{',
    '  "overall_score": 1-10 integer,',
    '  "calorie_assessment": "under|on_track|over",',
    '  "summary": "2-3 sentence overall day assessment",',
    '  "meal_reports": {',
    '    "breakfast": { "score": 1-10, "assessment": "sentence", "positives": ["item"], "improvements": ["item"] },',
    '    "lunch":     { "score": 1-10, "assessment": "sentence", "positives": ["item"], "improvements": ["item"] },',
    '    "dinner":    { "score": 1-10, "assessment": "sentence", "positives": ["item"], "improvements": ["item"] },',
    '    "snack":     { "score": 1-10, "assessment": "sentence", "positives": ["item"], "improvements": ["item"] }',
    '  },',
    '  "macros_balance": { "protein_status": "deficient|adequate|excellent", "carbs_status": "low|optimal|high", "fat_status": "low|optimal|high", "fiber_status": "deficient|adequate|good" },',
    '  "nutrients_of_concern": ["e.g. Vitamin C low"],',
    '  "what_went_well": ["specific positive 1", "specific positive 2"],',
    '  "improvements": ["specific improvement 1", "improvement 2"],',
    '  "tomorrow_tips": ["tip 1", "tip 2"],',
    '  "hydration_status": "poor|low|adequate|good",',
    '  "meal_timing_note": "comment on meal timing distribution"',
    '}',
  ].join('\n')

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    )
    clearTimeout(timer)
    const data = await r.json()
    if (!r.ok || data.error) throw new Error(data?.error?.message || 'Gemini error')
    const raw = data?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('') || ''
    const cleaned = raw.replace(/```json|```/gi, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    const report = JSON.parse(match[0])

    // Persist to Supabase (upsert — overwrite if re-analyzing)
    await sb.from('daily_nutrition_reports').upsert({
      user_id: userId,
      report_date: date || new Date().toISOString().split('T')[0],
      report,
      meals_hash: mealsHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,report_date' })

    return res.status(200).json({ report, meals_hash: mealsHash })
  } catch(e) {
    return res.status(500).json({ error: 'Analysis failed: ' + e.message })
  }
}
