import { normalizeMuscle } from '../../lib/muscles'

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    maxDuration: 30, // Vercel: extend timeout to 30s for image analysis
  }
}

async function callGemini(apiKey, parts, temperature, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || 25000)

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: temperature || 0.1,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    )
    const data = await r.json()
    if (!r.ok || data.error) throw new Error(data?.error?.message || 'Gemini HTTP ' + r.status)
    const textParts = data?.candidates?.[0]?.content?.parts || []
    const text = textParts.filter(p => p.text && !p.thought).map(p => p.text).join('')
    if (!text) throw new Error('Empty response from Gemini')
    return text
  } finally {
    clearTimeout(timer)
  }
}

function parseExercises(raw) {
  const cleaned = raw.replace(/```json|```/gi, '').trim()
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  const parsed = JSON.parse(arrMatch ? arrMatch[0] : cleaned)
  if (!Array.isArray(parsed)) throw new Error('Not an array')
  return parsed.map(ex => {
    const rawMuscle = String(ex.muscle || 'Other')
    const rawPrimary = String(ex.primary_muscle || ex.primaryMuscle || ex.muscle || '')
    return {
      canonical:         String(ex.canonical || 'Unknown'),
      muscle:            rawMuscle,           // keep the group-level name as-is
      primary_muscle:    normalizeMuscle(rawPrimary), // normalize sub-muscle to our taxonomy
      secondary_muscles: Array.isArray(ex.secondary_muscles || ex.secondaryMuscles)
        ? (ex.secondary_muscles || ex.secondaryMuscles).map(s => normalizeMuscle(String(s))) : [],
      other_muscles:     Array.isArray(ex.other_muscles || ex.otherMuscles)
        ? (ex.other_muscles || ex.otherMuscles).map(s => normalizeMuscle(String(s))) : [],
      alternatives:      Array.isArray(ex.alternatives) ? ex.alternatives.map(String) : [],
      rawText:           String(ex.rawText || ''),
      isMachine:         Boolean(ex.isMachine),
      confidence:        String(ex.confidence || 'high'),
    }
  })
}

const SCHEMA = [
  'Return ONLY a valid JSON array. No markdown, no backticks, no text before or after the array.',
  'Each item in the array:',
  '{',
  '  "canonical": "Official exercise name in English",',
  '  "muscle": "One of: Chest|Back|Legs|Shoulders|Arms|Core|Cardio|Other",',
  '  "primary_muscle": "Most targeted sub-muscle e.g. Quads, Biceps, Lateral Deltoid",',
  '  "secondary_muscles": ["2nd most targeted sub-muscle"],',
  '  "other_muscles": ["stabilizers"],',
  '  "alternatives": ["alternative exercise if relevant"],',
  '  "rawText": "any text visible in image",',
  '  "isMachine": true or false,',
  '  "confidence": "high|medium|low"',
  '}',
  'If the image contains ANY gym equipment or exercise: identify it with at least confidence "low".',
  'Only return [] if the image has absolutely no connection to fitness or exercise.',
].join('\n')

function buildPrompt(type, mCtx, textInput) {
  if (type === 'text') {
    return [
      'You are an expert fitness coach.',
      'The user typed: "' + textInput + '"',
      'They are working on: ' + mCtx,
      '',
      'Identify the official exercise name. Be lenient: accept typos, abbreviations, informal names.',
      'Examples: "lateral raises" = Lateral Raise, "bp" = Barbell Bench Press, "leg ext" = Leg Extension',
      'Return confidence "high" for clear matches, "medium" for likely matches, "low" for guesses.',
      'Return 2-3 alternatives if ambiguous.',
      'Only return [] if completely unrelated to exercise.',
      '',
      SCHEMA,
    ].join('\n')
  }

  if (type === 'image') {
    return [
      'You are an expert fitness coach with excellent visual recognition.',
      'User target muscles: ' + mCtx,
      '',
      'Examine this image and identify every exercise or piece of gym equipment you can see.',
      'Be INCLUSIVE and CONFIDENT:',
      '- If you see a weight machine: name the primary exercise it is used for',
      '- If you see someone exercising: name that exercise',
      '- If there is a label, diagram, or text on the equipment: read it',
      '- Imperfect angles and lighting are OK - give your best identification',
      '- Provide at least one result if any gym-related content is visible',
      '',
      SCHEMA,
    ].join('\n')
  }

  if (type === 'reanalyze') {
    return [
      'You are an expert fitness coach. Look at this image again very carefully.',
      'User target muscles: ' + mCtx,
      '',
      'Your previous identification was rejected. Find a DIFFERENT answer:',
      '- Look for any text labels on the machine',
      '- Examine the shape and position of pads, handles, cables, seat',
      '- Consider the starting position this machine puts the body in',
      '- Think about what muscles this position would target',
      '',
      'Give your best ALTERNATIVE identification. You must return at least one result.',
      '',
      SCHEMA,
    ].join('\n')
  }

  // both
  return [
    'You are an expert fitness coach.',
    'User target muscles: ' + mCtx,
    'The user provided a photo AND typed: "' + textInput + '"',
    '',
    '1. Identify what is in the image',
    '2. Compare with what the user typed: "' + textInput + '"',
    '3. If they match: return once with confidence "high"',
    '4. If they differ: return both so the user can pick',
    '5. If image unclear but text is a valid exercise: return the text result with confidence "medium"',
    '',
    'Always include a result if the text describes a real exercise.',
    '',
    SCHEMA,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageBase64, imageMime, selectedMuscles, textInput, mode } = req.body

  if (!selectedMuscles?.length) return res.status(400).json({ error: 'No muscles selected' })
  if (!imageBase64 && !textInput) return res.status(400).json({ error: 'Provide an image or exercise name' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' })

  const mCtx = selectedMuscles.join(', ')
  const resolvedMode = mode || (imageBase64 && textInput ? 'both' : imageBase64 ? 'image' : 'text')
  const prompt = buildPrompt(resolvedMode, mCtx, textInput || '')
  const temp = resolvedMode === 'reanalyze' ? 0.4 : 0.1

  const parts = [{ text: prompt }]
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } })
  }

  let raw = ''
  try {
    raw = await callGemini(apiKey, parts, temp, 25000)
  } catch(err) {
    const msg = err.message || ''
    if (msg.includes('abort') || msg.toLowerCase().includes('timeout')) {
      return res.status(504).json({ error: 'Analysis timed out. Try a smaller photo or type the exercise name.' })
    }
    return res.status(500).json({ error: 'AI error: ' + msg })
  }

  let exercises
  try {
    exercises = parseExercises(raw)
  } catch(e) {
    return res.status(500).json({
      error: 'Could not read AI response.',
      raw: raw.slice(0, 400)
    })
  }

  return res.status(200).json({ exercises })
}
