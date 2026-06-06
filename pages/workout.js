import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { TopNav, BottomTabs } from '../components/Nav'

const MUSCLES = [
  { id:'Chest',     icon:'🫁', sub:'Pecs · Upper push',         color:'#ef4444' },
  { id:'Back',      icon:'🔙', sub:'Lats · Traps · Rhomboids',  color:'#3b82f6' },
  { id:'Legs',      icon:'🦵', sub:'Quads · Hamstrings · Glutes',color:'#22c55e' },
  { id:'Shoulders', icon:'💪', sub:'Front · Side · Rear delts', color:'#a855f7' },
  { id:'Arms',      icon:'💪', sub:'Biceps · Triceps · Forearms',color:'#f97316' },
  { id:'Core',      icon:'🔥', sub:'Abs · Obliques · Lower back',color:'#eab308' },
  { id:'Cardio',    icon:'❤️', sub:'Endurance · Conditioning',  color:'#06b6d4' },
]

const QUICK_PLANS = [
  { name:'Push Day',  muscles:['Chest','Shoulders','Arms'], icon:'🏋️' },
  { name:'Pull Day',  muscles:['Back','Arms'],               icon:'🔗' },
  { name:'Leg Day',   muscles:['Legs','Core'],               icon:'🦵' },
  { name:'Upper Body',muscles:['Chest','Back','Shoulders','Arms'], icon:'💪' },
  { name:'Full Body', muscles:['Chest','Back','Legs','Shoulders','Arms','Core'], icon:'⚡' },
  { name:'Cardio',    muscles:['Cardio','Core'],             icon:'❤️' },
]

const todayStr = () => new Date().toISOString().split('T')[0]

export default function Workout() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [selected, setSelected] = useState([])
  const [date, setDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [recentSessions, setRecentSessions] = useState([])
  const MC = { Chest:'#ef4444',Back:'#3b82f6',Legs:'#22c55e',Shoulders:'#a855f7',Arms:'#f97316',Core:'#eab308',Cardio:'#06b6d4' }
  const mc = m => MC[m]||'#6b7280'

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data:{session} }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
      try {
        const r = await fetch(`/api/sessions?userId=${session.user.id}`)
        const d = await r.json()
        setRecentSessions((d.sessions||[]).slice(0,3))
      } catch(e) {}
      setLoading(false)
    })
  }, [])

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id])

  const startSession = () => {
    if (!selected.length) return
    // Pass setup data to index via localStorage then navigate
    try {
      localStorage.setItem('gt_v5', JSON.stringify({
        screen: 'upload',
        date,
        muscles: selected,
        imgPreview: null,
        pending: [],
        cidx: 0,
        done: [],
        cur: null,
        sessStart: null,
        exStart: null,
      }))
    } catch(e) {}
    router.push('/')
  }

  const useQuickPlan = (plan) => {
    setSelected(plan.muscles)
  }

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#050508',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:'3px solid rgba(200,255,0,0.2)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:'#050508',color:'var(--text-primary)'}}>
      <TopNav title="New Session" user={user} back="/"/>

      <div style={{padding:'20px 16px',maxWidth:520,margin:'0 auto'}}>

        {/* Date */}
        <div style={{marginBottom:20}}>
          <div className="label" style={{marginBottom:8}}>Session Date</div>
          <input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)}
            style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',color:'var(--text-primary)',padding:'12px 16px',borderRadius:12,outline:'none',width:'100%',fontSize:'.95rem',transition:'border .2s'}}/>
          {date!==todayStr()&&<div style={{color:'#c8ff00',fontSize:'.75rem',marginTop:6,fontWeight:600}}>📅 Logging a past session</div>}
        </div>

        {/* Quick plans */}
        <div style={{marginBottom:20}}>
          <div className="label" style={{marginBottom:10}}>Quick Plans</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {QUICK_PLANS.map(plan=>(
              <button key={plan.name} onClick={()=>useQuickPlan(plan)}
                style={{background:plan.muscles.every(m=>selected.includes(m))&&selected.length===plan.muscles.length?'rgba(200,255,0,0.12)':'rgba(255,255,255,0.03)',border:`1px solid ${plan.muscles.every(m=>selected.includes(m))&&selected.length===plan.muscles.length?'rgba(200,255,0,0.4)':'rgba(255,255,255,0.08)'}`,borderRadius:12,padding:'12px 8px',cursor:'pointer',textAlign:'center',transition:'all .15s'}}>
                <div style={{fontSize:'1.4rem',marginBottom:5}}>{plan.icon}</div>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.75rem',color:'var(--text-primary)',lineHeight:1.2}}>{plan.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Muscle selector */}
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="label">Target Muscles</div>
            {selected.length>0&&<button onClick={()=>setSelected([])} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'.75rem',cursor:'pointer'}}>Clear all</button>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {MUSCLES.map(m=>{
              const sel = selected.includes(m.id)
              return (
                <div key={m.id} onClick={()=>toggle(m.id)}
                  style={{background:sel?`${m.color}14`:'rgba(255,255,255,0.025)',border:`1px solid ${sel?m.color+'55':'rgba(255,255,255,0.07)'}`,borderRadius:14,padding:'13px 15px',cursor:'pointer',transition:'all .2s',display:'flex',alignItems:'center',gap:11}}>
                  <div style={{width:36,height:36,borderRadius:10,background:sel?`${m.color}22`:'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',flexShrink:0,transition:'background .2s'}}>{m.icon}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:sel?m.color:'var(--text-primary)',transition:'color .2s'}}>{m.id}</div>
                    <div style={{fontSize:'.62rem',color:sel?`${m.color}99`:'var(--text-muted)',marginTop:1,lineHeight:1.3}}>{m.sub}</div>
                  </div>
                  {sel&&<div style={{marginLeft:'auto',width:20,height:20,borderRadius:'50%',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg></div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected summary */}
        {selected.length>0&&(
          <div style={{background:'rgba(200,255,0,0.06)',border:'1px solid rgba(200,255,0,0.15)',borderRadius:14,padding:'14px 16px',marginBottom:16}}>
            <div style={{fontSize:'.72rem',fontWeight:700,letterSpacing:1,color:'rgba(200,255,0,0.7)',marginBottom:8}}>TODAY'S PLAN</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {selected.map(m=>(
                <span key={m} style={{background:`${mc(m)}22`,border:`1px solid ${mc(m)}44`,color:mc(m),padding:'4px 11px',borderRadius:20,fontSize:'.72rem',fontWeight:700}}>{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Start button */}
        <button onClick={startSession} disabled={!selected.length}
          style={{width:'100%',padding:'18px',background:selected.length?'#c8ff00':'rgba(255,255,255,0.06)',border:'none',borderRadius:14,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:selected.length?'#080808':'var(--text-muted)',cursor:selected.length?'pointer':'not-allowed',transition:'all .2s',boxShadow:selected.length?'0 4px 24px rgba(200,255,0,0.25)':'none',marginBottom:24}}>
          {selected.length?`Start ${selected.length} Muscle${selected.length>1?' Group':'s'} Session →`:'Select muscles to begin'}
        </button>

        {/* Recent sessions */}
        {recentSessions.length>0&&(
          <div>
            <div className="label" style={{marginBottom:10}}>Recent Sessions</div>
            {recentSessions.map(s=>(
              <div key={s.id} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'12px 14px',marginBottom:8,cursor:'pointer',transition:'all .15s'}}
                onClick={()=>router.push('/dashboard')}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:600,fontSize:'.85rem',color:'var(--text-primary)'}}>
                    {new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
                  </span>
                  <span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>
                    {s.exercises?.reduce((a,ex)=>a+(ex.sets?.length||0),0)||0} sets
                  </span>
                </div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {s.muscles_trained?.map(m=>(
                    <span key={m} style={{background:`${mc(m)}22`,color:mc(m),border:`1px solid ${mc(m)}33`,padding:'2px 8px',borderRadius:20,fontSize:'.65rem',fontWeight:600}}>{m}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{height:'calc(80px + env(safe-area-inset-bottom))'}}/>
      <BottomTabs active="workout"/>
    </div>
  )
}
