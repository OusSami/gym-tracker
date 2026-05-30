export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { barcode, imageBase64, imageMime } = req.body

  // Must have at least a barcode number OR an image
  if (!barcode && !imageBase64) return res.status(400).json({ error: 'Missing barcode or image' })

  const lookupOFF = async (code) => {
    const r = await fetch(
      'https://world.openfoodfacts.org/api/v2/product/' + code + '?fields=product_name,nutriments,serving_size,quantity,brands',
      { headers: { 'User-Agent': 'GymTracker/1.0 (contact@gymtracker.app)' } }
    )
    const data = await r.json()
    if (data.status !== 1 || !data.product) return null
    const p = data.product
    const n = p.nutriments || {}
    const mealName = [p.brands, p.product_name].filter(Boolean).join(' - ') || 'Unknown Product'
    const portion  = p.serving_size || p.quantity || '100g'
    const cals  = Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0)
    const prot  = Math.round((n['proteins_serving']      || n['proteins_100g']      || 0) * 10) / 10
    const carbs = Math.round((n['carbohydrates_serving'] || n['carbohydrates_100g'] || 0) * 10) / 10
    const fat   = Math.round((n['fat_serving']           || n['fat_100g']           || 0) * 10) / 10
    const fiber = Math.round((n['fiber_serving']         || n['fiber_100g']         || 0) * 10) / 10
    const sugar = Math.round((n['sugars_serving']        || n['sugars_100g']        || 0) * 10) / 10
    const satFat= Math.round((n['saturated-fat_serving'] || n['saturated-fat_100g'] || 0) * 10) / 10
    const sodMg = Math.round((n['sodium_serving']        || n['sodium_100g']        || 0) * 1000)
    const potMg = Math.round((n['potassium_serving']     || n['potassium_100g']     || 0) * 1000)
    return {
      found: true,
      meal_name: mealName,
      portion_note: portion,
      total_calories: cals,
      protein_g: prot, carbs_g: carbs, fat_g: fat, fiber_g: fiber,
      sugar_g: sugar, saturated_fat_g: satFat,
      sodium_mg: sodMg, potassium_mg: potMg,
      // Build ingredients array so the editor can scale by portion
      ingredients: [{
        name: mealName,
        portion: portion,
        calories: cals, protein_g: prot, carbs_g: carbs, fat_g: fat, fiber_g: fiber,
      }],
      source: 'Open Food Facts',
    }
  }

  // 1. Direct barcode lookup
  if (barcode) {
    try {
      const result = await lookupOFF(barcode.trim())
      if (result) return res.status(200).json(result)
    } catch(e) {}
    return res.status(404).json({ found: false, error: 'Product not found. Try typing the barcode number or describe the meal.' })
  }

  // 2. Image scan: use Gemini to extract barcode from photo, then lookup
  if (imageBase64) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

    try {
      const gr = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Look at this image and find any barcode (EAN-13, UPC-A, QR code, etc). Return ONLY the numeric digits of the barcode, nothing else. If you cannot find a barcode, return the word "none".' },
              { inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } }
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 50, thinkingConfig: { thinkingBudget: 0 } }
          })
        }
      )
      const gd = await gr.json()
      const rawText = gd?.candidates?.[0]?.content?.parts?.find(p => p.text && !p.thought)?.text?.trim() || ''

      if (!rawText || rawText.toLowerCase() === 'none') {
        return res.status(404).json({ found: false, error: 'No barcode found in photo. Try getting closer or better lighting.' })
      }

      // Extract only digits
      const digits = rawText.replace(/[^0-9]/g, '')
      if (digits.length < 8) {
        return res.status(404).json({ found: false, error: 'Could not read barcode clearly. Try typing the number manually.' })
      }

      const result = await lookupOFF(digits)
      if (result) return res.status(200).json({ ...result, source: 'Open Food Facts (barcode: ' + digits + ')' })

      return res.status(404).json({ found: false, error: 'Barcode ' + digits + ' not found in database. Try typing it manually.' })
    } catch(e) {
      return res.status(500).json({ found: false, error: 'Scan failed: ' + e.message })
    }
  }

  return res.status(400).json({ error: 'Invalid request' })
}
