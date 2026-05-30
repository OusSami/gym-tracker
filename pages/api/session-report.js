import { supabaseAdmin } from '../../lib/supabase'
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

async function callGemini(apiKey, text) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  )
  const data = await r.json()
  if (!r.ok || data.error) throw new Error(data?.error?.message || 'HTTP ' + r.status)
  return data?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('') || ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { sessionId, userId, exercises, muscles, duration } = req.body
  if (!sessionId || !exercises?.length) return res.status(400).json({ error: 'Missing data' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' })

  const exSummary = exercises.map(ex => {
    const totalVol = ex.sets.reduce((a, s) => a + s.weight * s.reps, 0)
    const maxW = Math.max(...ex.sets.map(s => s.weight))
    return '- ' + ex.name + ' (' + ex.muscle + '): ' + ex.sets.length + ' sets, max ' + maxW + 'kg, volume ' + Math.round(totalVol) + 'kg'
  }).join('\n')

  const muscleExercises = {}
  exercises.forEach(ex => {
    if (!muscleExercises[ex.muscle]) muscleExercises[ex.muscle] = []
    muscleExercises[ex.muscle].push(ex.name)
  })

  const coverageEntries = muscles.map(m => {
    return '"' + m + '": { "exercises_done": ' + JSON.stringify(muscleExercises[m] || []) + ', "coverage_score": 1-10, "note": "brief note" }'
  }).join(',\n    ')

  const prompt = [
    'You are an expert fitness coach analyzing a completed workout session.',
    '',
    'Session details:',
    '- Target muscles: ' + muscles.join(', '),
    '- Duration: ' + Math.round((duration || 0) / 60) + ' minutes',
    '- Exercises completed:',
    exSummary,
    '',
    'Analyze this session and return ONLY a raw JSON object (no markdown, no backticks):',
    '{',
    '  "overall_rating": 1-10,',
    '  "intensity_score": 1-10,',
    '  "volume_score": 1-10,',
    '  "balance_score": 1-10,',
    '  "summary": "2-3 sentence overall session assessment",',
    '  "what_went_well": ["specific positive 1", "specific positive 2"],',
    '  "what_to_improve": ["specific improvement 1", "specific improvement 2"],',
    '  "missing_exercises": ["exercise type missing if any"],',
    '  "muscle_coverage": {',
    '    ' + coverageEntries,
    '  },',
    '  "next_session_tips": ["tip 1", "tip 2"],',
    '  "estimated_calories": number',
    '}',
  ].join('\n')

  let raw, report
  try {
    raw = await callGemini(apiKey, prompt)
    const cleaned = raw.replace(/```json|```/gi, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    report = JSON.parse(match ? match[0] : cleaned)
  } catch(e) {
    return res.status(500).json({ error: 'AI parse error: ' + (raw || '').slice(0, 150) })
  }

  const sb = supabaseAdmin()
  await sb.from('sessions').update({ ai_report: report }).eq('id', sessionId)

  return res.status(200).json({ report })
}
