import { supabaseAdmin } from '../../lib/supabase'

const GEMINI_KEY = process.env.GEMINI_API_KEY

function getPeriodKey(type, from) {
  const d = new Date(from + 'T12:00:00')
  if (type === 'week') return from
  if (type === 'month') return from.slice(0, 7)
  if (type === 'quarter') {
    const q = Math.floor(d.getMonth() / 3) + 1
    return `${d.getFullYear()}-Q${q}`
  }
  if (type === 'halfyear') return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`
  if (type === 'year') return String(d.getFullYear())
  if (type === 'alltime') return 'alltime'
  return from // custom
}

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId, periodType, periodKey } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    let q = sb.from('analysis_reports').select('*').eq('user_id', userId)
    if (periodType) q = q.eq('period_type', periodType)
    if (periodKey) q = q.eq('period_key', periodKey)
    q = q.order('generated_at', { ascending: false })
    const { data } = await q.limit(1).maybeSingle()
    return res.status(200).json({ report: data || null })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { userId, periodType, periodFrom, periodTo, sessions, meals, weightEntries, profile, force } = req.body
  if (!userId || !periodType || !periodFrom || !periodTo)
    return res.status(400).json({ error: 'Missing params' })

  const periodKey = getPeriodKey(periodType, periodFrom)

  // Check if recent report exists (within 1 hour) unless force=true
  if (!force) {
    const { data: existing } = await sb.from('analysis_reports')
      .select('id, generated_at, report')
      .eq('user_id', userId).eq('period_type', periodType).eq('period_key', periodKey)
      .maybeSingle()
    if (existing) {
      const age = Date.now() - new Date(existing.generated_at).getTime()
      if (age < 3600000) return res.status(200).json({ report: existing.report, cached: true })
    }
  }

  if (!GEMINI_KEY) return res.status(500).json({ error: 'No API key' })

  // Build comprehensive data summary
  const totalSets = sessions.reduce((a, s) => a + (s.exercises?.reduce((b, e) => b + (e.sets?.length || 0), 0) || 0), 0)
  const totalVol = sessions.reduce((a, s) => a + (s.exercises?.reduce((b, e) => b + (e.sets?.reduce((c, st) => c + (st.weight_kg || 0) * (st.reps || 0), 0) || 0), 0) || 0), 0)
  const totalReps = sessions.reduce((a, s) => a + (s.exercises?.reduce((b, e) => b + (e.sets?.reduce((c, st) => c + (st.reps || 0), 0) || 0), 0) || 0), 0)
  
  // Muscle breakdown
  const muscleMap = {}
  sessions.forEach(s => {
    s.exercises?.forEach(ex => {
      const m = ex.muscle || 'Other'
      if (!muscleMap[m]) muscleMap[m] = { sessions: 0, sets: 0, vol: 0, exercises: new Set() }
      muscleMap[m].sets += ex.sets?.length || 0
      muscleMap[m].vol += ex.sets?.reduce((a, st) => a + (st.weight_kg || 0) * (st.reps || 0), 0) || 0
      muscleMap[m].exercises.add(ex.name)
    })
    ;(s.muscles_trained || []).forEach(m => {
      if (!muscleMap[m]) muscleMap[m] = { sessions: 0, sets: 0, vol: 0, exercises: new Set() }
      muscleMap[m].sessions++
    })
  })
  const muscleData = Object.entries(muscleMap).map(([m, d]) => ({
    muscle: m, sessions: d.sessions, sets: d.sets,
    vol: Math.round(d.vol), exercises: [...d.exercises].join(', ')
  })).sort((a, b) => b.sets - a.sets)

  // Personal bests
  const pbs = {}
  sessions.forEach(s => s.exercises?.forEach(ex => {
    ex.sets?.forEach(st => {
      if ((st.weight_kg || 0) > 0) {
        if (!pbs[ex.name] || st.weight_kg > pbs[ex.name]) pbs[ex.name] = st.weight_kg
      }
    })
  }))

  // Nutrition summary
  const mealDays = [...new Set(meals.map(m => m.meal_date || m.created_at?.split('T')[0]))].length || 1
  const totalCals = meals.reduce((a, m) => a + (m.total_calories || 0), 0)
  const totalProtein = meals.reduce((a, m) => a + (m.total_protein_g || 0), 0)
  const totalCarbs = meals.reduce((a, m) => a + (m.total_carbs_g || 0), 0)
  const totalFat = meals.reduce((a, m) => a + (m.total_fat_g || 0), 0)
  const avgCals = Math.round(totalCals / mealDays)
  const avgProtein = Math.round(totalProtein / mealDays)
  const avgCarbs = Math.round(totalCarbs / mealDays)
  const avgFat = Math.round(totalFat / mealDays)

  // Weight trend
  const wEntries = weightEntries.filter(w => w.date >= periodFrom && w.date <= periodTo).sort((a,b) => a.date.localeCompare(b.date))
  const weightChange = wEntries.length >= 2 ? Math.round((wEntries[wEntries.length-1].weight_kg - wEntries[0].weight_kg) * 10) / 10 : null

  const periodLabel = periodType === 'week' ? 'week' : periodType === 'month' ? 'month' : periodType === 'quarter' ? 'quarter' : periodType === 'halfyear' ? '6-month period' : periodType === 'year' ? 'year' : 'period'

  const prompt = `You are an elite fitness coach and sports scientist. Generate a COMPREHENSIVE ${periodLabel} analysis report for an athlete.

PERIOD: ${periodFrom} to ${periodTo}
GOAL: ${profile?.goal || 'general fitness'}
TRAINING:
- Sessions: ${sessions.length}
- Total sets: ${totalSets}
- Total volume: ${Math.round(totalVol)}kg
- Total reps: ${totalReps}
- Avg sets/session: ${sessions.length ? Math.round(totalSets/sessions.length) : 0}
MUSCLE BREAKDOWN: ${JSON.stringify(muscleData.slice(0, 10))}
PERSONAL BESTS THIS PERIOD: ${JSON.stringify(Object.entries(pbs).slice(0, 10).map(([n,w]) => n+': '+w+'kg'))}
NUTRITION (${mealDays} days logged):
- Avg calories: ${avgCals} kcal/day
- Avg protein: ${avgProtein}g/day
- Avg carbs: ${avgCarbs}g/day
- Avg fat: ${avgFat}g/day
WEIGHT: ${weightChange !== null ? (weightChange > 0 ? '+' : '') + weightChange + 'kg' : 'No data'}

Return ONLY a raw JSON object (no markdown, no backticks):
{
  "overall_score": 1-10,
  "training_score": 1-10,
  "nutrition_score": 1-10,
  "consistency_score": 1-10,
  "summary": "3-4 sentence executive summary of the period",
  "training_analysis": {
    "strengths": ["specific strength 1", "specific strength 2"],
    "weaknesses": ["specific weakness 1", "specific weakness 2"],
    "muscle_balance": "detailed comment on muscle balance, over/under trained groups",
    "volume_assessment": "was the volume appropriate for the goal?",
    "intensity_assessment": "comment on intensity and progression",
    "recommendations": ["actionable recommendation 1", "actionable recommendation 2", "recommendation 3"]
  },
  "nutrition_analysis": {
    "calorie_assessment": "are calories appropriate for the goal?",
    "protein_assessment": "is protein intake sufficient? Give specific targets",
    "macro_balance": "comment on carb/fat/protein split",
    "recommendations": ["nutrition recommendation 1", "nutrition recommendation 2"]
  },
  "weight_analysis": "comment on weight trend and what it means for the goal",
  "highlights": ["best achievement 1", "best achievement 2", "best achievement 3"],
  "areas_to_improve": ["improvement 1", "improvement 2", "improvement 3"],
  "next_period_plan": ["priority 1 for next ${periodLabel}", "priority 2", "priority 3"],
  "exercise_recommendations": ["exercise to add/increase 1", "exercise recommendation 2"],
  "recovery_tips": ["recovery tip 1", "recovery tip 2"],
  "motivation": "one powerful personalized motivational statement"
}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55000)
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 } } }) }
    )
    clearTimeout(timer)
    const data = await r.json()
    const raw = (data?.candidates?.[0]?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('')
    const match = raw.replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON')
    const report = JSON.parse(match[0])

    // Store report
    await sb.from('analysis_reports').upsert({
      user_id: userId, period_type: periodType, period_key: periodKey,
      period_from: periodFrom, period_to: periodTo, report,
      generated_at: new Date().toISOString()
    }, { onConflict: 'user_id,period_type,period_key' })

    return res.status(200).json({ report })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
