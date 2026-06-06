/**
 * Session Draft API - saves in-progress session state server-side
 * Only runs as fallback when liveSessionId is NOT active (no double-save).
 */
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'POST') {
    const { userId, draftId, muscles, sessionDate, exercises, startedAt } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    const payload = {
      user_id: userId,
      muscles_trained: muscles || [],
      session_date: sessionDate || new Date().toISOString().split('T')[0],
      duration_seconds: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    }

    // Resolve session ID
    let resolvedDraftId = draftId
    if (!resolvedDraftId) {
      const today = sessionDate || new Date().toISOString().split('T')[0]
      const { data: existing } = await sb.from('sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('session_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing?.id) resolvedDraftId = existing.id
    }

    if (resolvedDraftId) {
      await sb.from('sessions').update(payload).eq('id', resolvedDraftId)

      // Delete ALL existing exercises for this session and re-insert cleanly
      // This is the only safe way to handle duplicate exercise names
      const { data: oldExercises } = await sb.from('exercises')
        .select('id').eq('session_id', resolvedDraftId)
      if (oldExercises?.length) {
        const oldIds = oldExercises.map(e => e.id)
        await sb.from('sets').delete().in('exercise_id', oldIds)
        await sb.from('exercises').delete().eq('session_id', resolvedDraftId)
      }

      // Re-insert all exercises with their sets (positional — preserves order and duplicates)
      for (let i = 0; i < (exercises || []).length; i++) {
        const ex = exercises[i]
        if (!ex.name) continue
        const { data: exRow } = await sb.from('exercises')
          .insert({
            session_id: resolvedDraftId,
            name: ex.name,
            muscle: ex.muscle || 'Other',
            duration_seconds: ex.duration || 0,
          })
          .select('id').single()
        if (exRow?.id && ex.sets?.length) {
          await sb.from('sets').insert(ex.sets.map((s, j) => ({
            exercise_id: exRow.id,
            set_number: j + 1,
            weight_kg: s.weight || 0,
            reps: s.reps || 0,
            duration_seconds: s.duration || 0,
            total_duration_seconds: s.total_duration || 0,
          })))
        }
      }
      return res.status(200).json({ sessionId: resolvedDraftId })
    } else {
      const { data: session, error } = await sb.from('sessions').insert(payload).select('id').single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ sessionId: session.id })
    }
  }

  if (req.method === 'DELETE') {
    const { sessionId, userId } = req.body
    if (!sessionId || !userId) return res.status(400).json({ error: 'Missing params' })
    const { data: exes } = await sb.from('exercises').select('id').eq('session_id', sessionId).limit(1)
    if (!exes?.length) {
      await sb.from('sessions').delete().eq('id', sessionId).eq('user_id', userId)
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
