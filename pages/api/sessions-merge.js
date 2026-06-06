/**
 * Merge exercises from one session into another, then delete the source session
 */
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { sourceId, targetId, userId } = req.body
  if (!sourceId || !targetId || !userId) return res.status(400).json({ error: 'Missing params' })
  if (sourceId === targetId) return res.status(400).json({ error: 'Same session' })

  const sb = supabaseAdmin()

  // Verify both sessions belong to this user
  const { data: sessions } = await sb.from('sessions')
    .select('id, user_id, muscles_trained')
    .in('id', [sourceId, targetId])
  if (!sessions || sessions.length !== 2) return res.status(404).json({ error: 'Sessions not found' })
  if (sessions.some(s => s.user_id !== userId)) return res.status(403).json({ error: 'Forbidden' })

  // Move all exercises from source to target
  await sb.from('exercises').update({ session_id: targetId }).eq('session_id', sourceId)

  // Merge muscles_trained arrays
  const src = sessions.find(s => s.id === sourceId)
  const tgt = sessions.find(s => s.id === targetId)
  const mergedMuscles = [...new Set([...(tgt.muscles_trained||[]), ...(src.muscles_trained||[])])]
  await sb.from('sessions').update({ muscles_trained: mergedMuscles }).eq('id', targetId)

  // Delete the (now empty) source session
  await sb.from('sessions').delete().eq('id', sourceId)

  return res.status(200).json({ ok: true, mergedInto: targetId })
}
