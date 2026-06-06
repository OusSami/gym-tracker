import { useState } from 'react'
import { useRouter } from 'next/router'
import { TopNav, BottomTabs } from '../components/Nav'

const STEPS = ['units', 'personal', 'fitness', 'goals']

const FITNESS_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Less than 1 year training' },
  { id: 'intermediate', label: 'Intermediate', desc: '1–3 years of consistent training' },
  { id: 'advanced', label: 'Advanced', desc: '3–5 years, strong technique' },
  { id: 'expert', label: 'Expert', desc: '5+ years, competing or coaching' },
]
const GOALS = [
  { id: 'strength', label: 'Build Strength', icon: '🏋️' },
  { id: 'muscle', label: 'Build Muscle', icon: '💪' },
  { id: 'weight_loss', label: 'Lose Weight', icon: '🔥' },
  { id: 'endurance', label: 'Endurance', icon: '❤️' },
  { id: 'general', label: 'Stay Fit', icon: '⚡' },
]

export default function Onboarding() {
  const router = useRouter()
  const { userId } = router.query   // get from URL: /onboarding?userId=xxx
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    unit_system: 'metric',
    birthday: '',
    weight_kg: '',
    height_cm: '',
    fitness_level: '',
    goal: '',
  })

  const set = (k, v) => setData(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!userId) return
    setSaving(true)
    const payload = { userId, ...data, onboarded: true }
    // Convert imperial to metric for storage
    if (data.unit_system === 'imperial') {
      if (data.weight_kg) payload.weight_kg = parseFloat(data.weight_kg) * 0.453592
      if (data.height_cm) payload.height_cm = parseFloat(data.height_cm) * 2.54
    }
    const r = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const d = await r.json()
    setSaving(false)
    if (d.profile?.onboarded) {
      router.replace('/')   // replace so back button doesn't return to onboarding
    } else {
      alert('Something went wrong saving your profile. Please try again.')
    }
  }

  const wLabel = data.unit_system === 'metric' ? 'kg' : 'lbs'
  const hLabel = data.unit_system === 'metric' ? 'cm' : 'inches'

  const canNext = () => {
    if (step === 0) return true
    if (step === 1) return data.birthday && (data.weight_kg || true)
    if (step === 2) return data.fitness_level
    if (step === 3) return data.goal
    return true
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px 60px' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .3s ease forwards}
        *{box-sizing:border-box}
      `}</style>

      <div style={{ width: '100%', maxWidth: 440, paddingTop: 48 }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? '#c8ff00' : '#1e1e1e', transition: 'background .3s' }} />
          ))}
        </div>

        {/* Step 0 — Units */}
        {step === 0 && (
          <div className="up">
            <div style={{ fontSize: '2.8rem', marginBottom: 16, textAlign: 'center' }}>⚙️</div>
            <div className="bb" style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 6, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>LET'S SET YOU UP</div>
            <div style={{ color: '#888', textAlign: 'center', fontSize: '.88rem', marginBottom: 32, lineHeight: 1.6 }}>Quick setup so we can personalise your experience. Takes less than a minute.</div>
            <div className="bb" style={{ color: '#666', fontSize: '.72rem', letterSpacing: 2, marginBottom: 12, fontFamily: "'Bebas Neue',sans-serif" }}>PREFERRED UNITS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['metric', '🌍 Metric', 'kg · cm'], ['imperial', '🇺🇸 Imperial', 'lbs · inches']].map(([id, label, sub]) => (
                <div key={id} className={`mcard${data.unit_system === id ? ' sel' : ''}`} onClick={() => set('unit_system', id)} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ fontWeight: 600, color: data.unit_system === id ? '#c8ff00' : '#ddd' }}>{label}</div>
                  <div style={{ fontSize: '.75rem', color: '#666' }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 — Personal info */}
        {step === 1 && (
          <div className="up">
            <div className="bb" style={{ fontSize: '2rem', marginBottom: 6, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>YOUR STATS</div>
            <div style={{ color: '#888', fontSize: '.88rem', marginBottom: 24, lineHeight: 1.6 }}>Used to track progress and personalise recommendations. All optional except birthday.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#aaa', fontSize: '.78rem', display: 'block', marginBottom: 6, fontWeight: 500 }}>Date of Birth <span style={{ color: '#c8ff00' }}>*</span></label>
                <input type="date" value={data.birthday} max={new Date(Date.now() - 10 * 365.25 * 86400000).toISOString().split('T')[0]} onChange={e => set('birthday', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#aaa', fontSize: '.78rem', display: 'block', marginBottom: 6, fontWeight: 500 }}>Weight ({wLabel})</label>
                  <input type="number" inputMode="decimal" placeholder={data.unit_system === 'metric' ? '75' : '165'} value={data.weight_kg} onChange={e => set('weight_kg', e.target.value)} />
                </div>
                <div>
                  <label style={{ color: '#aaa', fontSize: '.78rem', display: 'block', marginBottom: 6, fontWeight: 500 }}>Height ({hLabel})</label>
                  <input type="number" inputMode="decimal" placeholder={data.unit_system === 'metric' ? '175' : '69'} value={data.height_cm} onChange={e => set('height_cm', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Fitness level */}
        {step === 2 && (
          <div className="up">
            <div className="bb" style={{ fontSize: '2rem', marginBottom: 6, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>YOUR LEVEL</div>
            <div style={{ color: '#888', fontSize: '.88rem', marginBottom: 24 }}>Be honest — it helps us tailor everything for you.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FITNESS_LEVELS.map(lv => (
                <div key={lv.id} className={`mcard${data.fitness_level === lv.id ? ' sel' : ''}`} onClick={() => set('fitness_level', lv.id)} style={{ gap: 14 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.95rem', color: data.fitness_level === lv.id ? '#c8ff00' : '#ddd' }}>{lv.label}</div>
                    <div style={{ fontSize: '.78rem', color: '#666', marginTop: 2 }}>{lv.desc}</div>
                  </div>
                  {data.fitness_level === lv.id && <span style={{ marginLeft: 'auto', color: '#c8ff00', fontSize: '1.1rem' }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Goal */}
        {step === 3 && (
          <div className="up">
            <div className="bb" style={{ fontSize: '2rem', marginBottom: 6, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2 }}>MAIN GOAL</div>
            <div style={{ color: '#888', fontSize: '.88rem', marginBottom: 24 }}>What are you training for?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {GOALS.map(g => (
                <div key={g.id} className={`mcard${data.goal === g.id ? ' sel' : ''}`} onClick={() => set('goal', g.id)} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontSize: '1.6rem' }}>{g.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', color: data.goal === g.id ? '#c8ff00' : '#ddd' }}>{g.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ marginTop: 32, display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="btn btn-d" style={{ flex: 1, maxWidth: 90 }}>← Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-y" style={{ flex: 1 }} disabled={!canNext()} onClick={() => setStep(s => s + 1)}>
              CONTINUE →
            </button>
          ) : (
            <button className="btn btn-y" style={{ flex: 1 }} disabled={!canNext() || saving} onClick={save}>
              {saving ? 'SAVING…' : "LET'S GO 🔥"}
            </button>
          )}
        </div>
        {step === 1 && (
          <button onClick={() => setStep(s => s + 1)} style={{ background: 'none', border: 'none', color: '#444', fontSize: '.78rem', width: '100%', textAlign: 'center', marginTop: 14, cursor: 'pointer', padding: 8 }}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
