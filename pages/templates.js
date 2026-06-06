import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { TopNav, BottomTabs } from '../components/Nav'
import { MUSCLE_TREE, getMuscleColor } from '../lib/muscles'

const mc = getMuscleColor
const ALL_MUSCLES = ['Chest','Back','Shoulders','Arms','Legs','Core','Cardio']

export default function TemplatesPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | template object
  const [saving, setSaving] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null)

  // Form state
  const [tName, setTName] = useState('')
  const [tMuscles, setTMuscles] = useState([])
  const [tExercises, setTExercises] = useState([]) // [{name, muscle, sets_target}]
  const [newExName, setNewExName] = useState('')

  const load = useCallback(async (uid) => {
    const r = await fetch('/api/templates?userId=' + uid)
    const d = await r.json()
    if (r.ok) setTemplates(d.templates || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user); load(session.user.id)
    })
  }, [])

  const openNew = () => {
    setTName(''); setTMuscles([]); setTExercises([]); setNewExName('')
    setEditing('new'); setExpandedGroup(null)
  }

  const openEdit = (t) => {
    setTName(t.name); setTMuscles(t.muscles || []); setTExercises(t.exercises || []); setNewExName('')
    setEditing(t); setExpandedGroup(null)
  }

  const saveTemplate = async () => {
    if (!tName.trim() || !user) return
    setSaving(true)
    const payload = { userId: user.id, name: tName.trim(), muscles: tMuscles, exercises: tExercises }
    if (editing === 'new') {
      await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/templates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editing.id }) })
    }
    await load(user.id); setSaving(false); setEditing(null)
  }

  const deleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return
    await fetch('/api/templates', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, id }) })
    await load(user.id)
  }

  const startFromTemplate = (t) => {
    // Store template data in localStorage for index.js to pick up
    const data = { fromTemplate: true, muscles: t.muscles, templateExercises: t.exercises, templateName: t.name }
    localStorage.setItem('gt_template', JSON.stringify(data))
    router.push('/')
  }

  const toggleMuscle = (m) => {
    const subs = MUSCLE_TREE[m]?.subs || []
    const on = tMuscles.includes(m) || subs.some(s => tMuscles.includes(s))
    if (!on) setTMuscles(p => [...p, m])
    else setTMuscles(p => p.filter(x => x !== m && !subs.includes(x)))
  }

  const toggleSub = (g, sub) => {
    const on = tMuscles.includes(sub)
    if (on) setTMuscles(p => p.filter(x => x !== sub && x !== g))
    else setTMuscles(p => [...p.filter(x => x !== g), sub])
  }

  const addExercise = () => {
    if (!newExName.trim()) return
    const muscle = tMuscles[0] || 'Other'
    setTExercises(p => [...p, { name: newExName.trim(), muscle, sets_target: 4 }])
    setNewExName('')
  }

  const INP = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8e8f0', padding: '11px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: '.9rem', borderRadius: 11, outline: 'none', width: '100%' }

  return (
    <div style={{ minHeight: '100vh', background: '#050508', color: '#e8e8f0' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} input:focus{border-color:#c8ff00!important;background:rgba(200,255,0,0.04)!important}`}</style>
      <TopNav title="Workout Templates" user={user} back="/" onSignOut={() => supabase.auth.signOut().then(() => router.push('/'))} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px calc(90px + env(safe-area-inset-bottom))' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '1.1rem' }}>My Templates</div>
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Save your favourite sessions, start with one tap</div>
          </div>
          <button onClick={openNew}
            style={{ padding: '9px 16px', background: '#c8ff00', border: 'none', borderRadius: 11, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '.82rem', color: '#080808', cursor: 'pointer' }}>
            + New
          </button>
        </div>

        {/* Template list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div style={{ width: 32, height: 32, border: '3px solid rgba(200,255,0,0.2)', borderTopColor: '#c8ff00', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto' }} /></div>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No templates yet</div>
            <div style={{ fontSize: '.82rem' }}>Create your first template to start sessions faster</div>
          </div>
        ) : templates.map(t => (
          <div key={t.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '14px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '1rem', marginBottom: 5 }}>{t.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                  {(t.muscles || []).map(m => <span key={m} style={{ background: mc(m) + '20', border: '1px solid ' + mc(m) + '44', color: mc(m), padding: '2px 8px', borderRadius: 20, fontSize: '.65rem', fontWeight: 700 }}>{m}</span>)}
                </div>
                <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.3)' }}>
                  {(t.exercises || []).length} exercises · {(t.exercises || []).reduce((a, e) => a + (e.sets_target || 0), 0)} sets
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <button onClick={() => openEdit(t)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '.75rem' }}>✏️</button>
                <button onClick={() => deleteTemplate(t.id)} style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
              </div>
            </div>
            {/* Exercise list */}
            {(t.exercises || []).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {t.exercises.map((ex, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: mc(ex.muscle), flexShrink: 0 }} />
                    <span style={{ fontSize: '.82rem', flex: 1 }}>{ex.name}</span>
                    <span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,0.3)' }}>{ex.sets_target} sets</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => startFromTemplate(t)}
              style={{ width: '100%', padding: '11px', background: '#c8ff00', border: 'none', borderRadius: 10, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '.88rem', color: '#080808', cursor: 'pointer' }}>
              ▶ Start This Workout
            </button>
          </div>
        ))}
      </div>

      {/* Edit / New modal */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 200, overflowY: 'auto' }}>
          <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '1.1rem' }}>{editing === 'new' ? 'New Template' : 'Edit Template'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '7px 14px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}>Cancel</button>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>TEMPLATE NAME</div>
              <input style={INP} placeholder="e.g. Push Day, Leg Day A..." value={tName} onChange={e => setTName(e.target.value)} />
            </div>

            {/* Muscles */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>TARGET MUSCLES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ALL_MUSCLES.map(gid => {
                  const col = mc(gid)
                  const subs = MUSCLE_TREE[gid]?.subs || []
                  const activeSubs = subs.filter(s => tMuscles.includes(s))
                  const active = tMuscles.includes(gid) || activeSubs.length > 0
                  const isOpen = expandedGroup === gid
                  return (
                    <div key={gid} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid ' + (active ? col + '44' : 'rgba(255,255,255,0.07)'), background: active ? col + '09' : 'rgba(255,255,255,0.02)', transition: 'all .15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 3, alignSelf: 'stretch', background: active ? col : 'transparent', flexShrink: 0 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => toggleMuscle(gid)}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '.88rem', color: active ? col : 'rgba(255,255,255,0.5)' }}>{gid}</div>
                            {activeSubs.length > 0 && <div style={{ fontSize: '.62rem', color: col + '99', marginTop: 1 }}>{activeSubs.join(' · ')}</div>}
                          </div>
                          {active && <div style={{ width: 18, height: 18, borderRadius: '50%', background: col, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="9" height="9" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                        </div>
                        {subs.length > 0 && (
                          <button onClick={() => setExpandedGroup(isOpen ? null : gid)}
                            style={{ padding: '0 13px', alignSelf: 'stretch', background: 'none', border: 'none', borderLeft: '1px solid ' + (active ? col + '25' : 'rgba(255,255,255,0.05)'), color: isOpen ? col : 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
                          </button>
                        )}
                      </div>
                      {isOpen && subs.length > 0 && (
                        <div style={{ padding: '6px 14px 10px', borderTop: '1px solid ' + col + '18', background: 'rgba(0,0,0,0.15)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {subs.map(sub => {
                              const sel = tMuscles.includes(sub)
                              return <button key={sub} onClick={() => toggleSub(gid, sub)}
                                style={{ padding: '4px 11px', background: sel ? col + '22' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (sel ? col : 'rgba(255,255,255,0.1)'), borderRadius: 20, color: sel ? col : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '.73rem', fontWeight: sel ? 700 : 400, transition: 'all .12s' }}>{sub}</button>
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Exercises */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>EXERCISES</div>
              {tExercises.map((ex, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, marginBottom: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: mc(ex.muscle), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '.85rem' }}>{ex.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => setTExercises(p => p.map((e, j) => j === i ? { ...e, sets_target: Math.max(1, e.sets_target - 1) } : e))}
                      style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>-</button>
                    <span style={{ fontSize: '.8rem', minWidth: 40, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>{ex.sets_target}s</span>
                    <button onClick={() => setTExercises(p => p.map((e, j) => j === i ? { ...e, sets_target: e.sets_target + 1 } : e))}
                      style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem' }}>+</button>
                  </div>
                  <button onClick={() => setTExercises(p => p.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '.85rem', padding: '0 2px' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input style={{ ...INP, flex: 1 }} placeholder="Exercise name..." value={newExName} onChange={e => setNewExName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExercise()} />
                <button onClick={addExercise} style={{ padding: '0 14px', background: 'rgba(200,255,0,0.12)', border: '1px solid rgba(200,255,0,0.25)', borderRadius: 11, color: '#c8ff00', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: '.85rem' }}>Add</button>
              </div>
            </div>

            <button onClick={saveTemplate} disabled={!tName.trim() || saving}
              style={{ width: '100%', padding: '14px', background: tName.trim() ? '#c8ff00' : 'rgba(200,255,0,0.3)', border: 'none', borderRadius: 12, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '.95rem', color: '#080808', cursor: tName.trim() ? 'pointer' : 'not-allowed' }}>
              {saving ? 'Saving…' : editing === 'new' ? 'Create Template' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
      <BottomTabs active="home" />
    </div>
  )
}
