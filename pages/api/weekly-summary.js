import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId, weekStart } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    let q = sb.from('weekly_summaries').select('*').eq('user_id', userId).order('week_start', { ascending: false })
    if (weekStart) q = q.eq('week_start', weekStart)
    const { data } = await q.limit(1).maybeSingle()
    return res.status(200).json({ summary: data || null })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId, weekStart, sessions, meals, weightEntries, profile } = req.body
  if (!userId || !weekStart) return res.status(400).json({ error: 'Missing params' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

  // Build week summary data
  const totalSets = sessions.reduce((a, s) => a + (s.exercises?.reduce((b, e) => b + (e.sets?.length || 0), 0) || 0), 0)
  const totalVol = sessions.reduce((a, s) => a + (s.exercises?.reduce((b, e) => b + (e.sets?.reduce((c, st) => c + st.weight_kg * st.reps, 0) || 0), 0) || 0), 0)
  const muscleFreq = {}
  sessions.forEach(s => (s.muscles_trained || []).forEach(m => { muscleFreq[m] = (muscleFreq[m] || 0) + 1 }))
  const avgCals = meals.length ? Math.round(meals.reduce((a, m) => a + (m.total_calories || 0), 0) / Math.max(1, [...new Set(meals.map(m => m.meal_date))].length)) : 0
  const weightChange = weightEntries.length >= 2 ? Math.round((weightEntries[weightEntries.length-1].weight_kg - weightEntries[0].weight_kg) * 10) / 10 : null

  const prompt = [
    'You are an expert fitness coach and nutritionist. Analyze this athlete\'s week and provide a comprehensive weekly summary.',
    '',
    'WEEK: ' + weekStart,
    'SESSIONS: ' + sessions.length + ' workouts',
    'TOTAL SETS: ' + totalSets,
    'TOTAL VOLUME: ' + Math.round(totalVol / 1000) + 'k kg',
    'MUSCLES TRAINED: ' + Object.entries(muscleFreq).map(([m, n]) => m + ' x' + n).join(', '),
    'AVG DAILY CALORIES: ' + avgCals + ' kcal',
    weightChange !== null ? 'WEIGHT CHANGE: ' + (weightChange > 0 ? '+' : '') + weightChange + 'kg' : '',
    'GOAL: ' + (profile?.goal || 'general fitness'),
    '',
    'Return ONLY a raw JSON object with no markdown:',
    '{',
    '  "overall_score": 1-10,',
    '  "training_score": 1-10,',
    '  "nutrition_score": 1-10,',
    '  "summary": "2-3 sentence overview of the week",',
    '  "highlights": ["best thing 1", "best thing 2"],',
    '  "improvements": ["area to improve 1", "area to improve 2"],',
    '  "muscle_balance": "comment on which muscles were over/under trained",',
    '  "next_week_focus": ["priority 1 for next week", "priority 2"],',
    '  "recovery_tips": ["specific recovery suggestion"],',
    '  "motivation": "one powerful motivational sentence personalized to their week"',
    '}',
  ].join('\n')

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } } }) }
    )
    clearTimeout(timer)
    const data = await r.json()
    const raw = data?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('') || ''
    const match = raw.replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    const report = JSON.parse(match[0])

    await sb.from('weekly_summaries').upsert({ user_id: userId, week_start: weekStart, report }, { onConflict: 'user_id,week_start' })
    return res.status(200).json({ report })
  } catch(e) {
    return res.status(500).json({ error: 'Analysis failed: ' + e.message })
  }
}
