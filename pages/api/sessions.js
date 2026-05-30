import { supabaseAdmin } from '../../lib/supabase'
export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  // ── GET ──
  if (req.method === 'GET') {
    const { userId, sessionId } = req.query
    if (sessionId) {
      const { data, error } = await sb.from('sessions').select('*, exercises(*, sets(*))').eq('id', sessionId).single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ session: data })
    }
    if (!userId) return res.status(400).json({ error: 'Missing userId' })
    const { data, error } = await sb.from('sessions').select('*, exercises(*, sets(*))')
      .eq('user_id', userId).order('session_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ sessions: data })
  }

  // ── POST: create session immediately (called at session start) ──
  if (req.method === 'POST') {
    const { userId, muscles, imageBase64, imageMime, exercises, sessionDate, sessionDuration, createOnly } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    // If createOnly=true, just create an empty session shell and return the ID
    if (createOnly) {
      const { data: session, error } = await sb.from('sessions')
        .insert({ user_id: userId, muscles_trained: muscles||[], image_url: null,
          session_date: sessionDate || new Date().toISOString().split('T')[0], duration_seconds: 0 })
        .select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ sessionId: session.id })
    }

    // Full save at end
    let imageUrl = null
    if (imageBase64) {
      const buffer = Buffer.from(imageBase64, 'base64')
      const ext = (imageMime || 'image/jpeg').split('/')[1]
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await sb.storage.from('workout-photos').upload(path, buffer, { contentType: imageMime || 'image/jpeg' })
      if (!uploadError) {
        const { data: urlData } = sb.storage.from('workout-photos').getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }
    }

    const { data: session, error: sessErr } = await sb.from('sessions')
      .insert({ user_id: userId, muscles_trained: muscles, image_url: imageUrl,
        session_date: sessionDate || new Date().toISOString().split('T')[0], duration_seconds: sessionDuration || 0,
        warmup_duration_seconds: req.body.warmupDuration || 0, warmup_skipped: req.body.warmupSkipped || false,
        warmup_exercises: req.body.warmupExercises || [], stretch_exercises: req.body.stretchExercises || [],
        stretch_duration_seconds: req.body.stretchDuration || 0, stretch_skipped: req.body.stretchSkipped || false })
      .select().single()
    if (sessErr) return res.status(500).json({ error: sessErr.message })

    for (const ex of (exercises||[])) {
      const { data: exRow, error: exErr } = await sb.from('exercises')
        .insert({ session_id: session.id, name: ex.name, muscle: ex.muscle, duration_seconds: ex.duration || 0 })
        .select().single()
      if (exErr) continue
      if (ex.sets?.length) {
        await sb.from('sets').insert(ex.sets.map((s, i) => ({
          exercise_id: exRow.id, set_number: i + 1, weight_kg: s.weight, reps: s.reps, duration_seconds: s.duration || 0
        })))
      }
    }
    return res.status(200).json({ sessionId: session.id })
  }

  // ── PUT: real-time updates during a session ──
  if (req.method === 'PUT') {
    const { type, sessionId, exercise, set: setData, exerciseId, muscles, duration } = req.body

    // Update session metadata (muscles, duration)
    if (type === 'update_session') {
      const { warmupDuration, warmupSkipped, warmupExercises, stretchDuration, stretchSkipped, stretchExercises } = req.body
      const updates = {}
      if (muscles) updates.muscles_trained = muscles
      if (duration !== undefined) updates.duration_seconds = duration
      if (warmupDuration !== undefined) updates.warmup_duration_seconds = warmupDuration||0
      if (warmupSkipped !== undefined) updates.warmup_skipped = warmupSkipped||false
      if (stretchDuration !== undefined) updates.stretch_duration_seconds = stretchDuration||0
      if (stretchSkipped !== undefined) updates.stretch_skipped = stretchSkipped||false
      if (warmupExercises !== undefined) updates.warmup_exercises = warmupExercises||[]
      if (stretchExercises !== undefined) updates.stretch_exercises = stretchExercises||[]
      const { error } = await sb.from('sessions').update(updates).eq('id', sessionId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // Add exercise to live session
    if (type === 'add_exercise') {
      const { data: exRow, error: exErr } = await sb.from('exercises')
        .insert({ session_id: sessionId, name: exercise.name, muscle: exercise.muscle, duration_seconds: 0 })
        .select().single()
      if (exErr) return res.status(500).json({ error: exErr.message })
      return res.status(200).json({ exercise: exRow })
    }

    // Add set to exercise in live session
    if (type === 'add_set') {
      const { data: existing } = await sb.from('sets').select('set_number')
        .eq('exercise_id', exerciseId).order('set_number', { ascending: false }).limit(1)
      const nextNum = (existing?.[0]?.set_number || 0) + 1
      const { data: newSet, error } = await sb.from('sets')
        .insert({ exercise_id: exerciseId, set_number: nextNum, weight_kg: setData.weight_kg, reps: setData.reps, duration_seconds: setData.duration || 0 })
        .select().single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ set: newSet })
    }

    // Delete set
    if (type === 'delete_set') {
      const { error } = await sb.from('sets').delete().eq('id', setData.id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // Update session ai_report
    if (type === 'update_report') {
      const { error } = await sb.from('sessions').update({ ai_report: setData.report }).eq('id', sessionId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (type === 'update_muscles') {
      const { error } = await sb.from('sessions').update({ muscles_trained: muscles }).eq('id', sessionId)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }
  }

  // ── PATCH: edit existing data ──
  if (req.method === 'PATCH') {
    const { type, id, ...fields } = req.body
    if (type === 'set') {
      const { error } = await sb.from('sets').update({ weight_kg: fields.weight_kg, reps: fields.reps }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'session') {
      const updates = {}
      if (fields.session_date) updates.session_date = fields.session_date
      if (fields.muscles_trained) updates.muscles_trained = fields.muscles_trained
      if (fields.duration_seconds !== undefined) updates.duration_seconds = fields.duration_seconds
      const { error } = await sb.from('sessions').update(updates).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'exercise_image') {
      const { error } = await sb.from('exercises').update({ image_hidden: fields.hidden }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'exercise') {
      // Rename exercise and/or change muscle group
      const updates = {}
      if (fields.name) updates.name = fields.name
      if (fields.muscle) updates.muscle = fields.muscle
      if (fields.duration_seconds !== undefined) updates.duration_seconds = fields.duration_seconds
      const { error } = await sb.from('exercises').update(updates).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'move_exercise') {
      const { sessionId: targetSession } = req.body
      const { error } = await sb.from('exercises').update({ session_id: targetSession }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'muscles') {
      // Update session muscles_trained
      const { muscles } = req.body
      const { error } = await sb.from('sessions').update({ muscles_trained: muscles }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    } else if (type === 'session_duration') {
      const updates = {}
      if (fields.duration_seconds !== undefined) updates.duration_seconds = parseInt(fields.duration_seconds)
      if (fields.session_date) updates.session_date = fields.session_date
      // Store actual timestamps for reminder/analytics use
      if (fields.session_date && fields.startTime) {
        updates.started_at = new Date(fields.session_date + 'T' + fields.startTime + ':00').toISOString()
      }
      if (fields.session_date && fields.endTime) {
        updates.finished_at = new Date(fields.session_date + 'T' + fields.endTime + ':00').toISOString()
      }
      const { error } = await sb.from('sessions').update(updates).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { type, id } = req.body
    if (type === 'set') {
      await sb.from('sets').delete().eq('id', id)
    } else if (type === 'photo') {
      const { data: s } = await sb.from('sessions').select('image_url').eq('id', id).single()
      if (s?.image_url) {
        const path = s.image_url.split('/workout-photos/')[1]
        if (path) await sb.storage.from('workout-photos').remove([path])
      }
      await sb.from('sessions').update({ image_url: null }).eq('id', id)
    } else if (type === 'session') {
      const { data: s } = await sb.from('sessions').select('image_url').eq('id', id).single()
      if (s?.image_url) {
        const path = s.image_url.split('/workout-photos/')[1]
        if (path) await sb.storage.from('workout-photos').remove([path])
      }
      await sb.from('sessions').delete().eq('id', id)
    } else if (type === 'exercise') {
      await sb.from('exercises').delete().eq('id', id)
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
