/**
 * Session Draft API - saves in-progress session state server-side
 * so if the phone crashes or browser closes, data is never lost.
 */
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  const sb = supabaseAdmin()

  if (req.method === 'POST') {
    // Upsert draft session
    const { userId, draftId, muscles, sessionDate, exercises, startedAt } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing userId' })

    const payload = {
      user_id: userId,
      muscles_trained: muscles || [],
      session_date: sessionDate || new Date().toISOString().split('T')[0],
      duration_seconds: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    }

    // If we have a draftId, update that session
    // If no draftId, check if there's already an in-progress session today (prevent duplicates)
    let resolvedDraftId = draftId
    if (!resolvedDraftId) {
      // Look for an existing unfinished session today with same muscles
      const today = sessionDate || new Date().toISOString().split('T')[0]
      // Find most recent session for today - avoid creating duplicates
      const { data: existing } = await sb.from('sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('session_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        resolvedDraftId = existing.id
      }
    }

    if (resolvedDraftId) {
      // Update existing session
      const { data } = await sb.from('sessions').update(payload).eq('id', resolvedDraftId).select('id').single()

      // Upsert exercises and sets
      for (const ex of (exercises || [])) {
        if (!ex.name) continue
        let exId = ex.id
        if (!exId) {
          // Check if exercise with this name already exists in this session (prevent duplicates)
          const { data: existing } = await sb.from('exercises')
            .select('id').eq('session_id', resolvedDraftId).eq('name', ex.name).maybeSingle()
          if (existing?.id) {
            exId = existing.id
          } else {
            const { data: exRow } = await sb.from('exercises')
              .insert({ session_id: resolvedDraftId, name: ex.name, muscle: ex.muscle || 'Other', duration_seconds: ex.duration || 0 })
              .select('id').single()
            exId = exRow?.id
          }
        }
        if (exId && ex.sets?.length) {
          // Delete existing sets and re-insert (simplest correct approach)
          await sb.from('sets').delete().eq('exercise_id', exId)
          await sb.from('sets').insert(ex.sets.map((s, i) => ({
            exercise_id: exId,
            set_number: i + 1,
            weight_kg: s.weight || 0,
            reps: s.reps || 0,
            duration_seconds: s.duration || 0,
            total_duration_seconds: s.total_duration || 0,
          })))
        }
      }
      return res.status(200).json({ sessionId: resolvedDraftId })
    } else {
      // Create new draft session
      const { data: session, error } = await sb.from('sessions').insert(payload).select('id').single()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ sessionId: session.id })
    }
  }

  if (req.method === 'DELETE') {
    // Clean up empty draft sessions (no exercises)
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
