import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { TopNav, BottomTabs } from '../components/Nav'
import { supabase } from '../lib/supabase'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const fmtDate = d => { try { return new Date((d||'')+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) } catch(e) { return d||'' } }

const Tip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null
  return <div style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#f0f0f0'}}><div style={{color:'#666',marginBottom:4,fontSize:11}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color||'#c8ff00'}}>{p.name}: <b>{p.value}</b></div>)}</div>
}

const ScoreRing = ({ value, label, color, size=80 }) => {
  const r = (size-10)/2, circ = 2*Math.PI*r, pct = Math.min(100,Math.max(0,value||0))
  return (
    <div style={{textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a1a" strokeWidth={8}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${(pct/100)*circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:'stroke-dasharray .8s ease'}}/>
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={size*0.22} fontFamily="'Bebas Neue',sans-serif">{Math.round(pct)}</text>
      </svg>
      <div style={{fontSize:'.65rem',color:'#666',letterSpacing:.5,fontWeight:600}}>{label}</div>
    </div>
  )
}

const Bar = ({ value, max=10, color, label }) => (
  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
    <div style={{width:80,fontSize:'.78rem',color:'#aaa',flexShrink:0}}>{label}</div>
    <div style={{flex:1,height:8,background:'#1a1a1a',borderRadius:4,overflow:'hidden'}}>
      <div style={{height:'100%',width:`${(value/max)*100}%`,background:color,borderRadius:4,transition:'width .8s ease'}}/>
    </div>
    <div style={{fontSize:'.78rem',color:color,minWidth:24,textAlign:'right',fontWeight:700}}>{value}/{max}</div>
  </div>
)

export default function BodyAnalysis() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [frontB64, setFrontB64] = useState(null)
  const [frontMime, setFrontMime] = useState('image/jpeg')
  const [frontPreview, setFrontPreview] = useState(null)
  const [backB64, setBackB64] = useState(null)
  const [backMime, setBackMime] = useState('image/jpeg')
  const [backPreview, setBackPreview] = useState(null)
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0])
  const [selected, setSelected] = useState(null)
  const [hiddenPhotos, setHiddenPhotos] = useState({}) // analysisId -> bool
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('upload')
  const frontRef = useRef(null)
  const backRef = useRef(null)

  const loadData = async (uid) => {
    const [pr, ar] = await Promise.all([
      fetch(`/api/profile?userId=${uid}`).then(r=>r.json()),
      fetch(`/api/body?userId=${uid}`).then(r=>r.json())
    ])
    setProfile(pr.profile||null)
    const list = ar.analyses||[]
    setAnalyses(list)
    if (list.length && !selected) setSelected(list[0])
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data:{session} }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
      await loadData(session.user.id)
      setLoading(false)
    })
  }, [])

  const loadImg = (file, side) => {
    if (!file?.type.startsWith('image/')) { setErr('Please upload an image file.'); return }
    setErr('')
    const mime = file.type||'image/jpeg'
    const r = new FileReader()
    r.onload = e => {
      const d = e.target.result
      const b64 = d.split(',')[1]
      if (side === 'front') { setFrontPreview(d); setFrontB64(b64); setFrontMime(mime) }
      else { setBackPreview(d); setBackB64(b64); setBackMime(mime) }
    }
    r.readAsDataURL(file)
  }

  const analyze = async () => {
    if (!frontB64) { setErr('Please upload at least a front photo.'); return }
    setAnalyzing(true); setErr('')
    try {
      const age = profile?.birthday ? Math.floor((Date.now()-new Date(profile.birthday).getTime())/(365.25*86400000)) : null
      const r = await fetch('/api/body', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          userId: user.id,
          imageBase64: frontB64, imageMime: frontMime,
          backImageBase64: backB64||null, backImageMime: backMime,
          analysisDate,
          userProfile: { age, weight_kg: profile?.weight_kg, height_cm: profile?.height_cm, fitness_level: profile?.fitness_level, goal: profile?.goal }
        })
      })
      const d = await r.json()
      if (!r.ok||d.error) { setErr(d.error||'Analysis failed'); setAnalyzing(false); return }
      await loadData(user.id)
      setSelected(d.analysis)
      setTab('history')
      setFrontB64(null); setFrontPreview(null); setBackB64(null); setBackPreview(null)
    } catch(e) { setErr('Connection error: '+e.message) }
    setAnalyzing(false)
  }

  const deleteAnalysis = async (id) => {
    if (!confirm('Delete this analysis?')) return
    await fetch('/api/body', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, userId:user.id}) })
    await loadData(user.id)
    setSelected(analyses.find(a=>a.id!==id)||null)
  }

  // History chart data
  const historyData = analyses.slice().reverse().map(a=>({
    date: fmtDate(a.analyzed_at),
    'Overall': a.overall_score,
    'Definition': a.muscle_definition,
    'Symmetry': a.symmetry_score,
    'Body fat%': a.body_fat_estimate,
  }))

  const radarData = selected ? [
    { muscle:'Chest', value: selected.chest_dev },
    { muscle:'Back', value: selected.back_dev },
    { muscle:'Shoulders', value: selected.shoulders_dev },
    { muscle:'Arms', value: selected.arms_dev },
    { muscle:'Core', value: selected.core_dev },
    { muscle:'Legs', value: selected.legs_dev },
  ] : []

  const MG_COLORS = { Chest:'#ef4444',Back:'#3b82f6',Shoulders:'#a855f7',Arms:'#f97316',Core:'#eab308',Legs:'#22c55e' }

  if (loading) return <Loader/>

  return (
    <div style={{minHeight:'100vh',background:'#080808',color:'#f0f0f0',fontFamily:"'DM Sans',sans-serif",maxWidth:700,margin:'0 auto',padding:'0 0 80px'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .bb{font-family:'Bebas Neue',sans-serif;letter-spacing:2px}
        .card{background:#111;border:1px solid #1e1e1e;border-radius:14px;padding:18px}
        .card-sm{background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px}
        .btn{display:block;width:100%;padding:15px;border:none;border-radius:12px;font-family:'Bebas Neue',sans-serif;font-size:1.1rem;letter-spacing:2px;cursor:pointer;transition:all .15s;text-align:center}
        .btn-y{background:#e8ff47;color:#080808}.btn-y:hover:not(:disabled){background:#d4eb30}.btn-y:disabled{opacity:.35;cursor:not-allowed}
        .btn-sm{background:#161616;border:1px solid #2a2a2a;color:#aaa;font-family:'DM Sans',sans-serif;font-size:.75rem;padding:7px 13px;border-radius:8px;cursor:pointer}.btn-sm:hover{border-color:#555;color:#fff}
        .tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#555;font-family:'DM Sans',sans-serif;font-size:.9rem;padding:10px 16px;cursor:pointer;transition:all .15s;font-weight:500}
        .tab.on{color:#c8ff00;border-bottom-color:#c8ff00}
        input[type=file]{display:none}
        ::placeholder{color:#3a3a3a}
      `}</style>

      {/* Header */}
      <div style={{padding:'22px 20px 0',display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
        <button onClick={()=>router.push('/')} style={{background:'none',border:'none',color:'#888',cursor:'pointer',fontSize:'1.2rem',padding:0}}>←</button>
        <div>
          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
            <span className="bb" style={{fontSize:'1.6rem',color:'#c8ff00'}}>BODY</span>
            <span className="bb" style={{fontSize:'1.6rem'}}>ANALYSIS</span>
          </div>
          <div style={{height:2,background:'linear-gradient(90deg,#e8ff47,transparent)',marginTop:3}}/>
        </div>
      </div>
      <div style={{color:'#555',fontSize:'.8rem',padding:'6px 20px 16px'}}>AI-powered physique analysis · Track your transformation</div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid #1e1e1e',padding:'0 20px',marginBottom:20}}>
        <button className={`tab${tab==='upload'?' on':''}`} onClick={()=>setTab('upload')}>📷 New Analysis</button>
        <button className={`tab${tab==='history'?' on':''}`} onClick={()=>setTab('history')}>📊 My Progress {analyses.length>0&&`(${analyses.length})`}</button>
      </div>

      <div style={{padding:'0 20px'}}>

        {/* ── UPLOAD TAB ── */}
        {tab === 'upload' && (
          <div className="up">
            {/* How it works */}
            <div style={{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              <div className="bb" style={{fontSize:'.72rem',color:'#888',letterSpacing:2,marginBottom:6}}>HOW IT WORKS</div>
              <div style={{color:'#777',fontSize:'.82rem',lineHeight:1.7}}>
                Upload front and/or back photos. AI analyzes muscle development, body composition, symmetry and gives you a personalised improvement plan.
                <br/><span style={{color:'#555',fontSize:'.78rem'}}>💡 Good lighting · neutral pose · minimal clothing for best results.</span>
              </div>
            </div>

            {/* Date picker */}
            <div style={{marginBottom:14}}>
              <div style={{color:'#aaa',fontSize:'.75rem',fontWeight:600,marginBottom:6}}>PHOTO DATE</div>
              <input type="date" value={analysisDate} max={new Date().toISOString().split('T')[0]}
                onChange={e=>setAnalysisDate(e.target.value)}
                style={{background:'#141414',border:'1px solid #2a2a2a',color:'#f0f0f0',padding:'11px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'.9rem'}}/>
              {analysisDate !== new Date().toISOString().split('T')[0] &&
                <div style={{color:'#eab308',fontSize:'.75rem',marginTop:6}}>📅 Using past date — great for tracking old photos</div>}
            </div>

            {/* Front photo */}
            <div style={{marginBottom:12}}>
              <div style={{color:'#aaa',fontSize:'.75rem',fontWeight:600,marginBottom:6}}>FRONT PHOTO <span style={{color:'#c8ff00'}}>*</span></div>
              <div onClick={()=>frontRef.current?.click()}
                style={{border:`2px dashed ${frontPreview?'#2a2a2a':'#222'}`,borderRadius:12,overflow:'hidden',cursor:'pointer',minHeight:frontPreview?0:130,display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0a',transition:'all .2s',marginBottom:6}}>
                {frontPreview ? (
                  <img src={frontPreview} alt="Front" style={{width:'100%',maxHeight:260,objectFit:'contain',display:'block'}}/>
                ) : (
                  <div style={{textAlign:'center',padding:'24px 20px'}}>
                    <div style={{fontSize:'2rem',marginBottom:6}}>🧍</div>
                    <div className="bb" style={{color:'#555',fontSize:'.9rem',letterSpacing:2}}>FRONT VIEW</div>
                    <div style={{color:'#3a3a3a',fontSize:'.72rem',marginTop:4}}>Required · face forward · arms at sides</div>
                  </div>
                )}
              </div>
              <input ref={frontRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadImg(e.target.files[0],'front')}/>
              <div style={{display:'flex',gap:6}}>
                <button className="btn-sm" style={{flex:1}} onClick={()=>{frontRef.current.removeAttribute('capture');frontRef.current.click()}}>🖼 Gallery</button>
                <button className="btn-sm" style={{flex:1}} onClick={()=>{frontRef.current.setAttribute('capture','user');frontRef.current.click()}}>🤳 Camera</button>
                {frontPreview && <button className="btn-sm" style={{color:'#ef4444',borderColor:'#3a1a1a'}} onClick={()=>{setFrontB64(null);setFrontPreview(null)}}>✕</button>}
              </div>
            </div>

            {/* Back photo */}
            <div style={{marginBottom:16}}>
              <div style={{color:'#aaa',fontSize:'.75rem',fontWeight:600,marginBottom:6}}>BACK PHOTO <span style={{color:'#555',fontSize:'.7rem'}}>(optional but recommended)</span></div>
              <div onClick={()=>backRef.current?.click()}
                style={{border:`2px dashed ${backPreview?'#2a2a2a':'#1e1e1e'}`,borderRadius:12,overflow:'hidden',cursor:'pointer',minHeight:backPreview?0:100,display:'flex',alignItems:'center',justifyContent:'center',background:'#090909',transition:'all .2s',marginBottom:6}}>
                {backPreview ? (
                  <img src={backPreview} alt="Back" style={{width:'100%',maxHeight:220,objectFit:'contain',display:'block'}}/>
                ) : (
                  <div style={{textAlign:'center',padding:'20px'}}>
                    <div style={{fontSize:'1.8rem',marginBottom:5}}>🔙</div>
                    <div className="bb" style={{color:'#444',fontSize:'.85rem',letterSpacing:2}}>BACK VIEW</div>
                    <div style={{color:'#2a2a2a',fontSize:'.72rem',marginTop:3}}>Shows back, lats, glutes development</div>
                  </div>
                )}
              </div>
              <input ref={backRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadImg(e.target.files[0],'back')}/>
              <div style={{display:'flex',gap:6}}>
                <button className="btn-sm" style={{flex:1}} onClick={()=>{backRef.current.removeAttribute('capture');backRef.current.click()}}>🖼 Gallery</button>
                <button className="btn-sm" style={{flex:1}} onClick={()=>{backRef.current.setAttribute('capture','user');backRef.current.click()}}>🤳 Camera</button>
                {backPreview && <button className="btn-sm" style={{color:'#ef4444',borderColor:'#3a1a1a'}} onClick={()=>{setBackB64(null);setBackPreview(null)}}>✕</button>}
              </div>
            </div>

            {err && <div style={{color:'#fca5a5',fontSize:'.85rem',marginBottom:12,padding:'12px 16px',background:'rgba(239,68,68,.1)',borderRadius:10,border:'1px solid rgba(239,68,68,.25)'}}>{err}</div>}

            {analyzing ? (
              <div style={{textAlign:'center',padding:'30px'}}>
                <div style={{width:48,height:48,border:'3px solid #1e1e1e',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 16px'}}/>
                <div className="bb" style={{color:'#c8ff00',fontSize:'1.4rem',letterSpacing:3}}>ANALYZING…</div>
                <div style={{color:'#555',fontSize:'.82rem',marginTop:6}}>AI is studying your physique — takes 15–30 seconds</div>
              </div>
            ) : (
              <button className="btn btn-y" onClick={analyze} disabled={!frontB64}>ANALYZE MY PHYSIQUE →</button>
            )}

            {analyses.length > 0 && (
              <div style={{textAlign:'center',marginTop:14}}>
                <button onClick={()=>setTab('history')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.8rem',textDecoration:'underline'}}>View {analyses.length} previous analysis{analyses.length>1?'es':''}</button>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            {analyses.length === 0 ? (
              <div style={{textAlign:'center',padding:'60px 20px',color:'#555'}}>
                <div style={{fontSize:'3rem',marginBottom:12}}>📊</div>
                <div className="bb" style={{fontSize:'1.3rem',letterSpacing:2}}>NO ANALYSES YET</div>
                <div style={{fontSize:'.88rem',marginTop:8,marginBottom:20}}>Upload your first photo to get started.</div>
                <button className="btn btn-y" style={{maxWidth:200,margin:'0 auto'}} onClick={()=>setTab('upload')}>UPLOAD PHOTO →</button>
              </div>
            ) : (
              <>
                {/* Progress charts if 2+ analyses */}
                {analyses.length >= 2 && (
                  <div className="card" style={{marginBottom:16}}>
                    <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2,marginBottom:14}}>PHYSIQUE PROGRESS OVER TIME</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={historyData} margin={{top:5,right:5,bottom:0,left:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                        <XAxis dataKey="date" tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false} width={30} domain={[0,100]}/>
                        <Tooltip content={<Tip/>}/>
                        <Line type="monotone" dataKey="Overall" stroke="#c8ff00" strokeWidth={2.5} dot={{fill:'#c8ff00',r:4,strokeWidth:0}}/>
                        <Line type="monotone" dataKey="Definition" stroke="#3b82f6" strokeWidth={2} dot={{fill:'#3b82f6',r:3,strokeWidth:0}}/>
                        <Line type="monotone" dataKey="Symmetry" stroke="#22c55e" strokeWidth={2} dot={{fill:'#22c55e',r:3,strokeWidth:0}}/>
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{display:'flex',gap:14,justifyContent:'center',marginTop:10}}>
                      {[['Overall','#c8ff00'],['Definition','#3b82f6'],['Symmetry','#22c55e']].map(([l,c])=>(
                        <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:'.72rem',color:'#666'}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:c}}/>
                          {l}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analysis selector */}
                {analyses.length > 1 && (
                  <div style={{display:'flex',gap:8,marginBottom:14,overflowX:'auto',paddingBottom:4}}>
                    {analyses.map((a,i)=>(
                      <button key={a.id} onClick={()=>setSelected(a)}
                        style={{flexShrink:0,padding:'6px 12px',background:selected?.id===a.id?'rgba(232,255,71,.1)':'#111',border:`1px solid ${selected?.id===a.id?'#c8ff00':'#222'}`,borderRadius:8,color:selected?.id===a.id?'#c8ff00':'#888',fontSize:'.78rem',cursor:'pointer',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
                        {fmtDate(a.analyzed_at)} {i===0?'(Latest)':''}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected analysis detail */}
                {selected && (
                  <div className="up">
                    {/* Photo + scores */}
                    <div style={{display:'grid',gridTemplateColumns:selected.image_url?'1fr 1fr':'1fr',gap:14,marginBottom:16}}>
                      {selected.image_url && (
                        <div>
                          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:6}}>
                            <button onClick={()=>setHiddenPhotos(p=>({...p,[selected.id]:!p[selected.id]}))}
                              style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,color:'var(--text-muted)',fontSize:'.72rem',padding:'4px 10px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                              {hiddenPhotos[selected.id]?'👁 Show photo':'🙈 Hide photo'}
                            </button>
                          </div>
                          {!hiddenPhotos[selected.id] && (
                            <img src={selected.image_url} alt="" style={{width:'100%',borderRadius:12,objectFit:'cover',maxHeight:280}}/>
                          )}
                          {hiddenPhotos[selected.id] && (
                            <div style={{height:100,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:'.8rem'}}>Photo hidden</div>
                          )}
                        </div>
                      )}
                      <div>
                        <div style={{color:'#666',fontSize:'.72rem',fontWeight:600,marginBottom:10}}>{fmtDate(selected.analyzed_at)}</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                          <ScoreRing value={selected.overall_score} label="OVERALL" color="#c8ff00" size={76}/>
                          <ScoreRing value={selected.muscle_definition} label="DEFINITION" color="#3b82f6" size={76}/>
                          <ScoreRing value={selected.symmetry_score} label="SYMMETRY" color="#22c55e" size={76}/>
                          <ScoreRing value={100-(selected.body_fat_estimate||20)*2.5} label="LEANNESS" color="#a855f7" size={76}/>
                        </div>
                        <div style={{background:'#0d0d0d',borderRadius:8,padding:'8px 12px',textAlign:'center'}}>
                          <div className="bb" style={{fontSize:'1.4rem',color:'#f97316'}}>{selected.body_fat_estimate}%</div>
                          <div style={{fontSize:'.65rem',color:'#555',letterSpacing:1}}>BODY FAT EST.</div>
                        </div>
                      </div>
                    </div>

                    {/* Muscle development radar */}
                    <div className="card" style={{marginBottom:12}}>
                      <div className="bb" style={{fontSize:'.8rem',color:'#ccc',letterSpacing:2,marginBottom:10}}>MUSCLE DEVELOPMENT</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'center'}}>
                        <ResponsiveContainer width="100%" height={160}>
                          <RadarChart data={radarData} margin={{top:10,right:20,bottom:10,left:20}}>
                            <PolarGrid stroke="#1e1e1e"/>
                            <PolarAngleAxis dataKey="muscle" tick={{fill:'#666',fontSize:10}}/>
                            <Radar dataKey="value" stroke="#c8ff00" fill="#c8ff00" fillOpacity={.15} strokeWidth={2}/>
                            <Tooltip content={<Tip/>}/>
                          </RadarChart>
                        </ResponsiveContainer>
                        <div>
                          {[['Chest',selected.chest_dev,'#ef4444'],['Back',selected.back_dev,'#3b82f6'],['Shoulders',selected.shoulders_dev,'#a855f7'],['Arms',selected.arms_dev,'#f97316'],['Core',selected.core_dev,'#eab308'],['Legs',selected.legs_dev,'#22c55e']].map(([l,v,c])=>(
                            <Bar key={l} label={l} value={v||0} color={c}/>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Comparison with previous if exists */}
                    {analyses.length >= 2 && selected.id === analyses[0].id && (
                      <div className="card" style={{marginBottom:12,background:'#0a1a0a',borderColor:'#1a3a1a'}}>
                        <div className="bb" style={{fontSize:'.8rem',color:'#4ade80',letterSpacing:2,marginBottom:10}}>VS PREVIOUS ANALYSIS</div>
                        {(() => {
                          const prev = analyses[1]
                          const diff = (key) => {
                            const d = (selected[key]||0)-(prev[key]||0)
                            return d > 0 ? `+${d}` : String(d)
                          }
                          const col = (key) => (selected[key]||0) >= (prev[key]||0) ? '#4ade80' : '#ef4444'
                          return (
                            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                              {[['Overall',diff('overall_score'),col('overall_score')],['Definition',diff('muscle_definition'),col('muscle_definition')],['Symmetry',diff('symmetry_score'),col('symmetry_score')]].map(([l,d,c])=>(
                                <div key={l} style={{textAlign:'center',background:'#0f0f0f',borderRadius:8,padding:'10px 8px'}}>
                                  <div className="bb" style={{fontSize:'1.3rem',color:c}}>{d}</div>
                                  <div style={{fontSize:'.62rem',color:'#555',letterSpacing:.5}}>{l}</div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Strengths & weaknesses */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                      <div className="card-sm">
                        <div className="bb" style={{fontSize:'.72rem',color:'#4ade80',letterSpacing:2,marginBottom:10}}>✓ STRENGTHS</div>
                        {selected.strengths?.map((s,i)=>(
                          <div key={i} style={{display:'flex',gap:8,marginBottom:7,alignItems:'flex-start'}}>
                            <span style={{color:'#4ade80',fontSize:'.9rem',flexShrink:0,marginTop:1}}>▸</span>
                            <span style={{fontSize:'.8rem',color:'#ccc',lineHeight:1.4}}>{s}</span>
                          </div>
                        ))}
                      </div>
                      <div className="card-sm">
                        <div className="bb" style={{fontSize:'.72rem',color:'#f87171',letterSpacing:2,marginBottom:10}}>⚠ WEAKNESSES</div>
                        {selected.weaknesses?.map((s,i)=>(
                          <div key={i} style={{display:'flex',gap:8,marginBottom:7,alignItems:'flex-start'}}>
                            <span style={{color:'#f87171',fontSize:'.9rem',flexShrink:0,marginTop:1}}>▸</span>
                            <span style={{fontSize:'.8rem',color:'#ccc',lineHeight:1.4}}>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Focus muscles */}
                    {selected.focus_muscles?.length > 0 && (
                      <div className="card-sm" style={{marginBottom:12,background:'#0d0d1a',borderColor:'#1a1a3a'}}>
                        <div className="bb" style={{fontSize:'.72rem',color:'#818cf8',letterSpacing:2,marginBottom:8}}>PRIORITY FOCUS</div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          {selected.focus_muscles.map((m,i)=>(
                            <span key={i} style={{background:'rgba(129,140,248,.15)',border:'1px solid rgba(129,140,248,.3)',color:'#818cf8',borderRadius:20,padding:'5px 12px',fontSize:'.8rem',fontWeight:600}}>{m}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    <div className="card" style={{marginBottom:12}}>
                      <div className="bb" style={{fontSize:'.8rem',color:'#ccc',letterSpacing:2,marginBottom:12}}>RECOMMENDATIONS</div>
                      {selected.recommendations?.map((r,i)=>(
                        <div key={i} style={{display:'flex',gap:12,marginBottom:12,alignItems:'flex-start'}}>
                          <div style={{width:24,height:24,borderRadius:'50%',background:'#c8ff00',color:'#080808',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.72rem',fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
                          <span style={{fontSize:'.85rem',color:'#ccc',lineHeight:1.5}}>{r}</span>
                        </div>
                      ))}
                    </div>

                    {/* Full report */}
                    {selected.full_report && (
                      <div className="card" style={{marginBottom:12}}>
                        <div className="bb" style={{fontSize:'.8rem',color:'#ccc',letterSpacing:2,marginBottom:12}}>FULL REPORT</div>
                        <div style={{fontSize:'.85rem',color:'#bbb',lineHeight:1.8,whiteSpace:'pre-wrap'}}>{selected.full_report}</div>
                      </div>
                    )}

                    <button onClick={()=>deleteAnalysis(selected.id)} style={{display:'block',width:'100%',padding:'11px',background:'transparent',border:'1px solid #2a1a1a',borderRadius:8,color:'#ef4444',fontSize:'.82rem',cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:8}}>
                      Delete this analysis
                    </button>
                    <button className="btn btn-y" onClick={()=>setTab('upload')}>ANALYZE AGAIN →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div style={{height:'calc(72px + env(safe-area-inset-bottom))'}}/>
      <BottomTabs active="body"/>
    </div>
  )
}

function Loader() {
  return <div style={{minHeight:'100vh',background:'#080808',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:32,height:32,border:'3px solid #1e1e1e',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
}
