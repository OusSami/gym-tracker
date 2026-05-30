import { supabaseAdmin } from '../../lib/supabase'
export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

async function callGemini(apiKey, parts) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  )
  const data = await r.json()
  if (!r.ok || data.error) throw new Error(data?.error?.message || 'HTTP ' + r.status)
  return data?.candidates?.[0]?.content?.parts?.filter(p => p.text && !p.thought).map(p => p.text).join('') || ''
}

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'GET') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb.from('body_analyses').select('*').eq('user_id', userId).order('analyzed_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ analyses: data })
  }

  if (req.method === 'POST') {
    const { userId, imageBase64, imageMime, backImageBase64, backImageMime, userProfile, analysisDate } = req.body
    if (!userId || !imageBase64) return res.status(400).json({ error: 'Missing userId or image' })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' })

    const profileCtx = userProfile ? 'User info: age ' + (userProfile.age||'unknown') + ', weight ' + (userProfile.weight_kg||'unknown') + 'kg, height ' + (userProfile.height_cm||'unknown') + 'cm, fitness level ' + (userProfile.fitness_level||'unknown') + ', goal: ' + (userProfile.goal||'general') + '.' : ''

    const prompt = [
    'You are an expert sports physiotherapist and body composition analyst with 20+ years of experience. ${profileCtx}',
    '',
    'Analyze this physique photo carefully and provide a comprehensive assessment.',
    '',
    'Return ONLY a raw JSON object. No markdown, no backticks, no explanation.',
    '',
    '{',
    '  "overall_score": 0-100 (overall physique development),',
    '  "muscle_definition": 0-100 (muscle visibility and definition),',
    '  "symmetry_score": 0-100 (left/right and upper/lower body balance),',
    '  "body_fat_estimate": 5-40 (estimated body fat percentage),',
    '  "chest_dev": 0-10,',
    '  "back_dev": 0-10,',
    '  "shoulders_dev": 0-10,',
    '  "arms_dev": 0-10,',
    '  "core_dev": 0-10,',
    '  "legs_dev": 0-10,',
    '  "strengths": ["strength 1", "strength 2", "strength 3"],',
    '  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],',
    '  "recommendations": ["specific recommendation 1", "specific recommendation 2", "specific recommendation 3", "specific recommendation 4", "specific recommendation 5"],',
    '  "focus_muscles": ["muscle group to prioritize 1", "muscle group to prioritize 2", "muscle group to prioritize 3"],',
    '  "full_report": "Detailed 3-4 paragraph professional analysis covering: overall physique assessment, muscle development by group, body composition estimate, specific strengths and areas for improvement, and actionable training recommendations tailored to the user\'s goal."',
    '}'
  ].join('\n')

    // Build parts array - include back image if provided
    const parts = [{ text: prompt }, { inline_data: { mime_type: imageMime || 'image/jpeg', data: imageBase64 } }]
    if (backImageBase64) {
      parts.splice(1, 0, { text: 'Front view photo:' })
      parts.push({ text: 'Back view photo (use this for back, lats, glutes, rear delt assessment):' })
      parts.push({ inline_data: { mime_type: backImageMime || 'image/jpeg', data: backImageBase64 } })
    }

    let raw
    try {
      raw = await callGemini(apiKey, parts)
    } catch(err) {
      return res.status(500).json({ error: 'Gemini error: ' + err.message })
    }

    let analysis
    try {
      const cleaned = raw.replace(/```json|```/gi, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      analysis = JSON.parse(match ? match[0] : cleaned)
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response: ' + raw.slice(0, 200) })
    }

    // Upload image to Supabase Storage
    let imageUrl = null
    try {
      const buffer = Buffer.from(imageBase64, 'base64')
      const ext = (imageMime || 'image/jpeg').split('/')[1]
      const path = userId + '/' + Date.now() + '.' + ext
      const { error: uploadError } = await sb.storage.from('body-photos').upload(path, buffer, { contentType: imageMime || 'image/jpeg' })
      if (!uploadError) {
        const { data: urlData } = sb.storage.from('body-photos').getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }
    } catch(e) {}

    // Save to DB
    const { data: saved, error: saveError } = await sb.from('body_analyses').insert({
      user_id: userId,
      image_url: imageUrl,
      analyzed_at: analysisDate || new Date().toISOString().split('T')[0],
      overall_score: Math.round(analysis.overall_score) || 50,
      muscle_definition: Math.round(analysis.muscle_definition) || 50,
      symmetry_score: Math.round(analysis.symmetry_score) || 50,
      body_fat_estimate: parseFloat(analysis.body_fat_estimate) || 20,
      chest_dev: Math.min(10, Math.round(analysis.chest_dev)) || 5,
      back_dev: Math.min(10, Math.round(analysis.back_dev)) || 5,
      shoulders_dev: Math.min(10, Math.round(analysis.shoulders_dev)) || 5,
      arms_dev: Math.min(10, Math.round(analysis.arms_dev)) || 5,
      core_dev: Math.min(10, Math.round(analysis.core_dev)) || 5,
      legs_dev: Math.min(10, Math.round(analysis.legs_dev)) || 5,
      strengths: analysis.strengths || [],
      weaknesses: analysis.weaknesses || [],
      recommendations: analysis.recommendations || [],
      focus_muscles: analysis.focus_muscles || [],
      full_report: analysis.full_report || '',
    }).select().single()

    if (saveError) return res.status(500).json({ error: saveError.message })
    return res.status(200).json({ analysis: saved })
  }

  if (req.method === 'DELETE') {
    const { id, userId } = req.body
    const { data: a } = await sb.from('body_analyses').select('image_url').eq('id', id).single()
    if (a?.image_url) {
      const path = a.image_url.split('/body-photos/')[1]
      if (path) await sb.storage.from('body-photos').remove([path])
    }
    const { error } = await sb.from('body_analyses').delete().eq('id', id).eq('user_id', userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
