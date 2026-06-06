import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { useRouter } from 'next/router'

export function TopNav({ title, back, user, onSignOut }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const go = path => { setOpen(false); router.push(path) }

  return (
    <div style={{
      position:'sticky', top:0, zIndex:100,
      background:'rgba(5,5,8,0.88)',
      backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
      borderBottom:'1px solid rgba(255,255,255,0.07)',
      padding:'0 16px', height:56,
      display:'flex', alignItems:'center', justifyContent:'space-between',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {back && (
          <button onClick={() => typeof back==='function' ? back() : router.push(back)}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:9,width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
        )}
        {title ? (
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'1rem',color:'#e8e8f0'}}>{title}</span>
        ) : (
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:'1.4rem',color:'#c8ff00',lineHeight:1}}>GYM</span>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:'1.4rem',lineHeight:1}}>TRACKER</span>
          </div>
        )}
      </div>

      {user && (
        <div ref={ref} style={{position:'relative'}}>
          <button onClick={() => setOpen(o => !o)}
            style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'6px 12px',cursor:'pointer',transition:'background .15s'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.09)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="" style={{width:22,height:22,borderRadius:'50%',objectFit:'cover'}}/>
            )}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>

          {open && (
            <div style={{
              position:'absolute', top:'calc(100% + 8px)', right:0,
              background:'rgba(10,10,16,0.98)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:14, padding:6, minWidth:180, zIndex:200,
              boxShadow:'0 20px 60px rgba(0,0,0,0.7)',
              backdropFilter:'blur(20px)',
              animation:'fadeIn .15s ease forwards',
            }}>
              {user.user_metadata?.full_name && (
                <>
                  <div style={{padding:'8px 12px 4px',fontSize:'.75rem',color:'rgba(255,255,255,0.3)',fontFamily:"'DM Sans',sans-serif"}}>{user.user_metadata.full_name}</div>
                  <div style={{height:1,background:'rgba(255,255,255,0.07)',margin:'4px 0'}}/>
                </>
              )}
              {[
                {icon:'🏠', label:'Home', path:'/'},
                {icon:'🏋️', label:'Workout', path:'/workout'},
                {icon:'📊', label:'Progress', path:'/dashboard'},
                {icon:'🫵', label:'Body Analysis', path:'/body'},
                {icon:'🍽️', label:'Meal Analyzer', path:'/meals'},
                {icon:'📚', label:'Exercise Library', path:'/exercises'},
                {icon:'⚙️', label:'Settings', path:'/settings'},
              ].map(item => (
                <button key={item.path} onClick={() => go(item.path)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:9,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.88rem',fontWeight:500,color:'rgba(255,255,255,0.6)',transition:'all .12s',border:'none',background:'none',width:'100%',textAlign:'left'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.color='#e8e8f0'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='rgba(255,255,255,0.6)'}}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
              <div style={{height:1,background:'rgba(255,255,255,0.07)',margin:'4px 0'}}/>
              <button onClick={() => { setOpen(false); onSignOut && onSignOut() }}
                style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:9,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.88rem',fontWeight:500,color:'rgba(248,113,113,0.7)',transition:'all .12s',border:'none',background:'none',width:'100%',textAlign:'left'}}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(239,68,68,0.08)';e.currentTarget.style.color='#f87171'}}
                onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='rgba(248,113,113,0.7)'}}>
                <span>👋</span> Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BottomTabs({ active }) {
  const router = useRouter()
  const [hasSession, setHasSession] = React.useState(false)
  React.useEffect(() => {
    // Check if there's an active session in progress
    try {
      const keys = ['gt_v5','gt_v4','gt_v3','gym_session']
      for (const k of keys) {
        const s = localStorage.getItem(k)
        if (s) {
          const d = JSON.parse(s)
          if (d.screen && !['auth','home','done',undefined,null].includes(d.screen)) {
            setHasSession(true); return
          }
        }
      }
    } catch(e) {}
    setHasSession(false)
  }, [active]) // re-check whenever active tab changes
  const tabs = [
    { id:'home',      icon:'🏠', label: hasSession ? '🔴 Session' : 'Home', path:'/' },
    { id:'workout',   icon:'🏋️', label:'Workout',   path:'/workout' },
    { id:'dashboard', icon:'📊', label:'Progress',  path:'/dashboard' },
    { id:'meals',     icon:'🍽️', label:'Meals',     path:'/meals' },
    { id:'exercises', icon:'📚', label:'Library',   path:'/exercises' },
  ]
  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:100,
      background:'rgba(5,5,8,0.92)',
      backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
      borderTop:'1px solid rgba(255,255,255,0.07)',
      display:'flex', alignItems:'center', justifyContent:'space-around',
      padding:'8px 0',
      paddingBottom:'calc(8px + env(safe-area-inset-bottom))',
      height:'calc(60px + env(safe-area-inset-bottom))',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => router.push(t.path)}
          style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            padding:'5px 14px', borderRadius:12, cursor:'pointer',
            transition:'all .15s', background:'transparent', border:'none',
            color: active===t.id ? '#c8ff00' : 'rgba(255,255,255,0.3)',
            minWidth:56,
          }}>
          <span style={{fontSize:'1.25rem',lineHeight:1}}>{t.icon}</span>
          <span style={{fontSize:'.58rem',fontWeight:700,letterSpacing:.5,textTransform:'uppercase',fontFamily:"'DM Sans',sans-serif"}}>{t.label}</span>
        </button>
      ))}
    </div>
  )
}
