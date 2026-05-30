export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

async function callGemini(apiKey, parts) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3000, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  )
  const data = await r.json()
  if (!r.ok || data.error) throw new Error(data?.error?.message || 'HTTP ' + r.status)
  return data?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('') || ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageBase64, imageMime, textInput, mealType } = req.body
  if (!imageBase64 && !textInput) return res.status(400).json({ error: 'Need image or text' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

  const inputSource = imageBase64 && textInput ? 'the meal photo and description below'
    : imageBase64 ? 'the meal photo' : 'this meal description: "' + textInput + '"'

  const prompt = [
    'You are an expert clinical dietitian and food scientist with access to USDA FoodData Central and international nutrition databases.',
    '',
    'Analyze ' + inputSource + ' and provide scientifically accurate nutritional data.',
    textInput && imageBase64 ? 'User description: "' + textInput + '"' : '',
    'Meal type: ' + (mealType || 'unknown'),
    '',
    'CRITICAL INSTRUCTIONS:',
    '- Use USDA FoodData Central reference values where possible',
    '- Estimate portion sizes visually if photo provided - be realistic (e.g. a plate of pasta is approx 300-400g)',
    '- Calculate each nutrient independently, not from approximations',
    '- For fats: split total fat into saturated, polyunsaturated, monounsaturated, trans',
    '- For vitamins/minerals: use standard reference values per food item',
    '- Be precise - do not round to convenient numbers',
    '- If image is unclear for a specific nutrient, use the most common preparation method',
    '',
    'Return ONLY a raw JSON object. No markdown, no backticks, no explanation outside JSON.',
    '',
    '{',
    '  "meal_name": "Descriptive official name",',
    '  "meal_type": "' + (mealType || 'snack') + '",',
    '  "portion_note": "e.g. 1 plate approx 380g or 2 slices 120g",',
    '  "total_calories": integer,',
    '  "protein_g": number (1 decimal),',
    '  "carbs_g": number (1 decimal),',
    '  "fat_g": number (1 decimal),',
    '  "fiber_g": number (1 decimal),',
    '  "sugar_g": number (1 decimal),',
    '  "saturated_fat_g": number (1 decimal),',
    '  "polyunsaturated_fat_g": number (1 decimal),',
    '  "monounsaturated_fat_g": number (1 decimal),',
    '  "trans_fat_g": number (1 decimal),',
    '  "cholesterol_mg": integer,',
    '  "sodium_mg": integer,',
    '  "potassium_mg": integer,',
    '  "vitamin_a_mcg": integer,',
    '  "vitamin_c_mg": number (1 decimal),',
    '  "calcium_mg": integer,',
    '  "iron_mg": number (1 decimal),',
    '  "health_score": integer 1-10,',
    '  "health_tips": ["specific tip 1", "tip 2"],',
    '  "meal_balance": "1-2 sentence nutritional assessment",',
    '  "glycemic_index": "low|medium|high",',
    '  "allergens": ["gluten", "dairy", "nuts"],',
    '  "vitamins": ["Vitamin A", "Vitamin C"],',
    '  "ingredients": [',
    '    { "name": "ingredient name", "portion": "e.g. 150g", "calories": integer, "protein_g": number, "carbs_g": number, "fat_g": number }',
    '  ]',
    '}',
  ].filter(Boolean).join('\n')

  const parts = [{ text: prompt }]
  if (imageBase64) parts.push({ inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } })

  try {
    const raw = await callGemini(apiKey, parts)
    const cleaned = raw.replace(/```json|```/gi, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON found in response')
    const data = JSON.parse(match[0])
    // Cross-validate calories
    const calcCal = (data.protein_g || 0) * 4 + (data.carbs_g || 0) * 4 + (data.fat_g || 0) * 9
    if (data.total_calories && Math.abs(data.total_calories - calcCal) > data.total_calories * 0.3) {
      data.total_calories = Math.round(calcCal)
    }
    return res.status(200).json(data)
  } catch(e) {
    return res.status(500).json({ error: 'Analysis failed: ' + e.message })
  }
}
