import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { TopNav, BottomTabs } from '../components/Nav'
import { calcNutrientGoals } from '../lib/nutrition'

const FITNESS_LEVELS = [
  { id:'beginner',     label:'Beginner',     desc:'< 1 year training' },
  { id:'intermediate', label:'Intermediate', desc:'1-3 years consistent' },
  { id:'advanced',     label:'Advanced',     desc:'3-5 years, strong technique' },
  { id:'expert',       label:'Expert',       desc:'5+ years, competing' },
]
const GOALS = [
  { id:'strength',    label:'Build Strength',  icon:'🏋️' },
  { id:'muscle',      label:'Build Muscle',    icon:'💪' },
  { id:'weight_loss', label:'Lose Weight',     icon:'🔥' },
  { id:'endurance',   label:'Endurance',       icon:'❤️' },
  { id:'general',     label:'Stay Fit',        icon:'⚡' },
]
const SEXES = [
  { id:'male',   label:'Male',   icon:'♂️' },
  { id:'female', label:'Female', icon:'♀️' },
]

const DEF = { unit_system:'metric', birthday:'', weight_kg:'', height_cm:'', fitness_level:'', goal:'', sex:'male', rest_duration_seconds:90 }

export default function Settings() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [form, setForm] = useState(DEF)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [showGoals, setShowGoals] = useState(false)
  const s = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
      await load(session.user.id)
    })
  }, [])

  const load = async (uid) => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/profile?userId=${uid}`)
      const d = await r.json()
      console.log('Settings load response:', JSON.stringify(d))
      if (!r.ok) { setErr('Could not load: ' + (d.error || r.status)); setLoading(false); return }
      const p = d.profile || {}
      // Explicitly map every field - never leave undefined
      setForm({
        unit_system:   p.unit_system   || 'metric',
        birthday:      p.birthday      ? String(p.birthday).split('T')[0] : '',
        weight_kg:     (p.weight_kg != null && p.weight_kg !== '') ? String(p.weight_kg) : '',
        height_cm:     (p.height_cm != null && p.height_cm !== '') ? String(p.height_cm) : '',
        fitness_level: p.fitness_level || '',
        goal:          p.goal          || '',
        sex:           p.sex           || 'male',
      })
    } catch(e) { setErr('Network error: ' + e.message) }
    setLoading(false)
  }

  const save = async () => {
    if (!user) return
    setSaving(true); setSaved(false); setSaveErr('')
    try {
      const payload = {
        userId: user.id,
        unit_system: form.unit_system,
        sex: form.sex,
        birthday: form.birthday || null,
        fitness_level: form.fitness_level || null,
        goal: form.goal || null,
        weight_kg: form.weight_kg !== '' ? parseFloat(form.weight_kg) : null,
        height_cm: form.height_cm !== '' ? parseFloat(form.height_cm) : null,
      }
      const r = await fetch('/api/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error || 'Save failed'); setSaving(false); return }
      setSaved(true)
      setTimeout(() => { setSaved(false); router.back() }, 900)
    } catch(e) { setSaveErr('Network error: ' + e.message) }
    setSaving(false)
  }

  // Preview calculated goals
  const goals = calcNutrientGoals({ ...form, weight_kg: parseFloat(form.weight_kg)||70, height_cm: parseFloat(form.height_cm)||170 })
  const isMetric = form.unit_system !== 'imperial'

  const SL = { fontSize:'.65rem', fontWeight:700, letterSpacing:1.5, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', display:'block', marginBottom:8 }
  const MC = (sel) => ({ border:`1px solid ${sel?'rgba(200,255,0,0.35)':'rgba(255,255,255,0.08)'}`, borderRadius:12, padding:'13px 14px', cursor:'pointer', background:sel?'rgba(200,255,0,0.07)':'rgba(255,255,255,0.025)', display:'flex', alignItems:'center', gap:11, transition:'all .15s' })
  const INP = { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'#e8e8f0', padding:'13px 16px', fontFamily:"'DM Sans',sans-serif", fontSize:'.95rem', borderRadius:12, outline:'none', width:'100%', transition:'border .2s' }

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#050508',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14}}>
      <div style={{width:32,height:32,border:'3px solid rgba(200,255,0,0.2)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{color:'rgba(255,255,255,0.4)',fontSize:'.82rem'}}>Loading your profile…</div>
      {err && <div style={{color:'#fca5a5',fontSize:'.78rem',padding:'8px 16px',background:'rgba(239,68,68,.08)',borderRadius:8,maxWidth:300,textAlign:'center'}}>{err}<br/><button onClick={()=>user&&load(user.id)} style={{color:'#c8ff00',background:'none',border:'none',cursor:'pointer',marginTop:6,fontSize:'.8rem'}}>Retry</button></div>}
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#050508',color:'#e8e8f0'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.6)} input:focus,select:focus{border-color:#c8ff00 !important;background:rgba(200,255,0,0.04) !important}`}</style>
      <TopNav title="Settings" back="/" user={user} onSignOut={()=>supabase.auth.signOut().then(()=>router.push('/'))}/>

      <div style={{maxWidth:480,margin:'0 auto',padding:'20px 16px calc(90px + env(safe-area-inset-bottom))'}}>

        {/* Profile card */}
        {user && (
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,padding:'14px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16}}>
            {user.user_metadata?.avatar_url
              ? <img src={user.user_metadata.avatar_url} alt="" style={{width:44,height:44,borderRadius:'50%',objectFit:'cover'}}/>
              : <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}}>👤</div>
            }
            <div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.95rem'}}>{user.user_metadata?.full_name||user.email?.split('@')[0]||'Athlete'}</div>
              <div style={{fontSize:'.75rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>{user.email}</div>
            </div>
          </div>
        )}

        {err && !loading && (
          <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:14,color:'#fca5a5',fontSize:'.82rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            {err}
            <button onClick={()=>user&&load(user.id)} style={{color:'#c8ff00',background:'none',border:'none',cursor:'pointer',fontSize:'.8rem',marginLeft:10}}>Retry</button>
          </div>
        )}

        {/* Units */}
        <span style={SL}>Units</span>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
          {[['metric','🌍 Metric','kg · cm'],['imperial','🇺🇸 Imperial','lbs · inches']].map(([id,label,sub])=>(
            <div key={id} style={MC(form.unit_system===id)} onClick={()=>s('unit_system',id)}>
              <div>
                <div style={{fontWeight:700,color:form.unit_system===id?'#c8ff00':'#e8e8f0',fontSize:'.88rem'}}>{label}</div>
                <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>{sub}</div>
              </div>
              {form.unit_system===id&&<span style={{marginLeft:'auto',color:'#c8ff00'}}>✓</span>}
            </div>
          ))}
        </div>

        {/* Sex */}
        <span style={SL}>Biological Sex <span style={{color:'rgba(255,255,255,0.2)',fontWeight:400,fontSize:'.6rem',letterSpacing:0}}>(used for nutrition calculations)</span></span>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
          {SEXES.map(({id,label,icon})=>(
            <div key={id} style={MC(form.sex===id)} onClick={()=>s('sex',id)}>
              <span style={{fontSize:'1.1rem'}}>{icon}</span>
              <div style={{fontWeight:700,color:form.sex===id?'#c8ff00':'#e8e8f0',fontSize:'.9rem'}}>{label}</div>
              {form.sex===id&&<span style={{marginLeft:'auto',color:'#c8ff00'}}>✓</span>}
            </div>
          ))}
        </div>

        {/* Personal info */}
        <span style={SL}>Personal Info</span>
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'16px',marginBottom:20}}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <span style={{...SL,marginBottom:6}}>Date of Birth</span>
              <input type="date" value={form.birthday} max={new Date().toISOString().split('T')[0]} onChange={e=>s('birthday',e.target.value)} style={INP}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <span style={{...SL,marginBottom:6}}>Weight ({isMetric?'kg':'lbs'})</span>
                <input type="number" inputMode="decimal" placeholder={isMetric?'75':'165'} value={form.weight_kg} onChange={e=>s('weight_kg',e.target.value)} style={INP}/>
              </div>
              <div>
                <span style={{...SL,marginBottom:6}}>Height ({isMetric?'cm':'inches'})</span>
                <input type="number" inputMode="decimal" placeholder={isMetric?'175':'69'} value={form.height_cm} onChange={e=>s('height_cm',e.target.value)} style={INP}/>
              </div>
            </div>
          </div>
        </div>

        {/* Fitness level */}
        <span style={SL}>Fitness Level</span>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
          {FITNESS_LEVELS.map(lv=>(
            <div key={lv.id} style={MC(form.fitness_level===lv.id)} onClick={()=>s('fitness_level',lv.id)}>
              <div>
                <div style={{fontWeight:700,color:form.fitness_level===lv.id?'#c8ff00':'#e8e8f0',fontSize:'.9rem'}}>{lv.label}</div>
                <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>{lv.desc}</div>
              </div>
              {form.fitness_level===lv.id&&<span style={{marginLeft:'auto',color:'#c8ff00'}}>✓</span>}
            </div>
          ))}
        </div>

        {/* Goal */}
        <span style={SL}>Main Goal</span>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20}}>
          {GOALS.map(g=>(
            <div key={g.id} style={{...MC(form.goal===g.id),flexDirection:'column',alignItems:'flex-start',gap:6}} onClick={()=>s('goal',g.id)}>
              <div style={{fontSize:'1.5rem'}}>{g.icon}</div>
              <div style={{fontWeight:700,fontSize:'.88rem',color:form.goal===g.id?'#c8ff00':'#e8e8f0'}}>{g.label}</div>
            </div>
          ))}
        </div>

        {/* Calculated goals preview */}
        {(form.weight_kg&&form.height_cm&&form.birthday) && (
          <div style={{background:'rgba(200,255,0,0.05)',border:'1px solid rgba(200,255,0,0.15)',borderRadius:14,padding:'14px 16px',marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <span style={{...SL,marginBottom:0,color:'rgba(200,255,0,0.6)'}}>YOUR CALCULATED GOALS</span>
              <button onClick={()=>setShowGoals(v=>!v)} style={{background:'none',border:'none',color:'rgba(200,255,0,0.5)',cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif"}}>{showGoals?'Hide':'Show'}</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[['BMR',goals.bmr,'kcal/day'],['TDEE',goals.tdee,'kcal/day'],['Goal',goals.calories,'kcal/day']].map(([l,v,u])=>(
                <div key={l} style={{textAlign:'center',background:'rgba(0,0,0,0.2)',borderRadius:10,padding:'10px 6px'}}>
                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1.1rem',color:'#c8ff00',lineHeight:1}}>{v}</div>
                  <div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.5)',letterSpacing:1,marginTop:3}}>{l}</div>
                  <div style={{fontSize:'.58rem',color:'rgba(255,255,255,0.2)',marginTop:1}}>{u}</div>
                </div>
              ))}
            </div>
            {showGoals && (
              <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                {[['Protein',goals.protein_g,'g'],['Carbs',goals.carbs_g,'g'],['Fat',goals.fat_g,'g'],['Fiber',goals.fiber_g,'g'],['Sodium',goals.sodium_mg,'mg'],['Potassium',goals.potassium_mg,'mg']].map(([l,v,u])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                    <span style={{fontSize:'.75rem',color:'rgba(255,255,255,0.4)'}}>{l}</span>
                    <span style={{fontSize:'.78rem',color:'#c8ff00',fontWeight:700}}>{v}<span style={{fontSize:'.62rem',opacity:.7,marginLeft:1}}>{u}</span></span>
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:'.68rem',color:'rgba(255,255,255,0.2)',marginTop:10,lineHeight:1.5}}>
              Based on Mifflin-St Jeor equation, age {goals.age}, {form.sex}
            </div>
          </div>
        )}

        {saveErr && <div style={{color:'#fca5a5',fontSize:'.82rem',marginBottom:12,padding:'10px 14px',background:'rgba(239,68,68,.08)',borderRadius:10,border:'1px solid rgba(239,68,68,.2)'}}>{saveErr}</div>}

        <button onClick={save} disabled={saving}
          style={{width:'100%',padding:'17px',background:saved?'#4ade80':saving?'rgba(200,255,0,0.6)':'#c8ff00',border:'none',borderRadius:14,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:'#080808',cursor:saving?'not-allowed':'pointer',transition:'all .2s',boxShadow:'0 4px 20px rgba(200,255,0,0.15)'}}>
          {saving?'Saving…':saved?'✓ Saved!':'Save Settings'}
        </button>
      </div>
      <BottomTabs active="settings"/>
    </div>
  )
}
