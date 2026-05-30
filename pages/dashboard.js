import { useState, useEffect, useRef } from 'react'
import { TopNav, BottomTabs } from '../components/Nav'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { ALL_MUSCLES_FLAT, getMuscleColor, MUSCLE_TREE, normalizeMuscle } from '../lib/muscles'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'

const MC = { Chest:'#ef4444',Back:'#3b82f6',Legs:'#22c55e',Shoulders:'#a855f7',Arms:'#f97316',Core:'#eab308',Cardio:'#06b6d4',Other:'#6b7280' }
const ALL_MUSCLES = ['Chest','Back','Legs','Shoulders','Arms','Core','Cardio']
const ME = { Chest:'🫁',Back:'🔙',Legs:'🦵',Shoulders:'💪',Arms:'💪',Core:'🔥',Cardio:'❤️' }
const mc = m => MC[m]||'#6b7280'
const fmt = s => { if(!s&&s!==0) return '-'; const m=Math.floor(s/60); return `${m}:${String(s%60).padStart(2,'0')}` }
const fmtDate = d => { try { return new Date((d||'')+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) } catch(e) { return d||'' } }
const todayStr = () => new Date().toISOString().split('T')[0]

const Tip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null
  return (
    <div style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#f0f0f0'}}>
      <div style={{color:'#888',marginBottom:5,fontSize:11}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.color||'#c8ff00',display:'flex',gap:8,alignItems:'center'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:p.color||'#c8ff00',display:'inline-block'}}/>
          {p.name}: <b>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</b>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)
  const [openWS, setOpenWS] = useState(null) // 'warmup_<id>' or 'stretch_<id>' for warmup/stretch expansion
  const [editSet, setEditSet] = useState(null)
  const [editExercise, setEditExercise] = useState(null) // {id, name, muscle, duration_seconds}
  const [editDuration, setEditDuration] = useState(null)
  const [fullReport, setFullReport] = useState(null) // {sessionId, duration_seconds, session_date}
  const [mergeMode, setMergeMode] = useState(false)
  const [editMuscles, setEditMuscles] = useState(null) // {sessionId, muscles:[]}
  const [expandedGroup, setExpandedGroup] = useState(null) // for editMuscles modal
  const [mergeSrc, setMergeSrc] = useState(null)
  const [merging, setMerging] = useState(false)
  const [moveExMode, setMoveExMode] = useState(false)   // move-exercise mode
  const [moveExSrc, setMoveExSrc] = useState(null)      // {exerciseId, name, fromSessionId}
  const [editDate, setEditDate] = useState(null)
  const [activeChart, setActiveChart] = useState('volume')
  const [activeTab, setActiveTab] = useState('overview')
  const [weeklySummary, setWeeklySummary] = useState(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyErr, setWeeklyErr] = useState('')
  const [strengthEx, setStrengthEx] = useState(null) // selected exercise for progression chart
  const [period, setPeriod] = useState('all')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [bestsMuscle, setBestsMuscle] = useState(null) // drill into muscle group
  const [bestsSubMuscle, setBestsSubMuscle] = useState(null) // drill into sub-muscle
  const [showCustomPeriod, setShowCustomPeriod] = useState(false)

  // Continue session
  const [contSession, setContSession] = useState(null)
  const [contMode, setContMode] = useState(null)
  const [contExpandedGroup, setContExpandedGroup] = useState(null)
  const [contExId, setContExId] = useState(null)
  const [newSet, setNewSet] = useState({w:'',r:''})
  const [newEx, setNewEx] = useState({name:'',muscle:'Chest',sets:[{w:'',r:''}]})
  const [saving, setSaving] = useState(false)
  const [analyzeText, setAnalyzeText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [suggested, setSuggested] = useState([])
  // Image upload in continue session
  const [contImgB64, setContImgB64] = useState(null)
  const [contImgMime, setContImgMime] = useState('image/jpeg')
  const [contImgPreview, setContImgPreview] = useState(null)
  const contFileRef = useRef(null)
  const [weightEntries, setWeightEntries] = useState([])
  const [profile, setProfile] = useState(null)
  const [selProgressEx, setSelProgressEx] = useState('')   // exercise selected for progress chart
  const [progDropGroup, setProgDropGroup] = useState(null)
  const [progDropSub, setProgDropSub] = useState(null)
  const [progOpen, setProgOpen] = useState(false)
  const [progQuery, setProgQuery] = useState('')
  const [analysisMode, setAnalysisMode] = useState('week')   // week | month | quarter | halfyear | year | alltime | custom
  const [analysisReport, setAnalysisReport] = useState(null) // stored full report
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisMeta, setAnalysisMeta] = useState(null) // {generatedAt, cached}
  const [pushEnabled, setPushEnabled] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const t = new Date(); const d=t.getDay(); t.setDate(t.getDate()+(d===0?-6:1-d)); return t.toISOString().split('T')[0]
  })
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0,7))
  const [selectedQuarter, setSelectedQuarter] = useState(() => { const d=new Date(); return d.getFullYear()+'-Q'+(Math.floor(d.getMonth()/3)+1) })
  const [selectedHalf, setSelectedHalf] = useState(() => { const d=new Date(); return d.getFullYear()+'-H'+(d.getMonth()<6?1:2) })
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())

  const [templates, setTemplates] = useState([])

  const reload = async (uid) => {
    const r = await fetch(`/api/sessions?userId=${uid}`)
    const d = await r.json()
    const s = d.sessions||[]
    setSessions(s)
    if (contSession) {
      const updated = s.find(x=>x.id===contSession.id)
      if (updated) setContSession(updated)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data:{session} }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
      await reload(session.user.id)
      setLoading(false)
      // Load weight history and profile for weight chart
      try {
        const [wr, pr, tr] = await Promise.all([
          fetch('/api/weight?userId=' + session.user.id),
          fetch('/api/profile?userId=' + session.user.id),
          fetch('/api/templates?userId=' + session.user.id),
        ])
        const wd = await wr.json(); const pd = await pr.json(); const td = await tr.json()
        if (wd.entries) setWeightEntries(wd.entries)
        if (pd.profile) setProfile(pd.profile)
        if (td.templates) setTemplates(td.templates)
        // Load this week's summary
        try {
          const mon = new Date(); mon.setDate(mon.getDate()-mon.getDay()+1)
          const weekStart = mon.toISOString().split('T')[0]
          const wsr = await fetch('/api/weekly-summary?userId='+session.user.id+'&weekStart='+weekStart)
          const wsd = await wsr.json()
          if (wsd.summary?.report) setWeeklySummary(wsd.summary.report)
        } catch(e) {}
      } catch(e) {}
    })
  }, [])

  // ── Period filter - must be defined FIRST ──
  const filterByPeriod = (sessionList) => {
    if (period === 'all') return sessionList
    const now = new Date()
    let from = new Date()
    if (period === 'today')  from.setHours(0,0,0,0)
    if (period === 'last')   { const lastDate = sessions[0]?.session_date||sessions[0]?.created_at?.split('T')[0]; if(lastDate) return sessionList.filter(s=>(s.session_date||s.created_at?.split('T')[0])===lastDate); return sessionList }
    if (period === 'week')   from.setDate(now.getDate()-7)
    if (period === '15d')    from.setDate(now.getDate()-15)
    if (period === 'month')  from.setMonth(now.getMonth()-1)
    if (period === '3month') from.setMonth(now.getMonth()-3)
    if (period === 'custom') {
      if (customFrom) from = new Date(customFrom+'T00:00:00')
      const to = customTo ? new Date(customTo+'T23:59:59') : now
      return sessionList.filter(s => {
        const d = new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00')
        return d >= from && d <= to
      })
    }
    return sessionList.filter(s => {
      const d = new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00')
      return d >= from
    })
  }
  const filteredSessions = filterByPeriod(sessions)

  // ── All computed metrics ──
  const totalSets = sessions.reduce((a,s)=>a+(s.exercises?.reduce((b,ex)=>b+(ex.sets?.length||0),0)||0),0)
  const totalVol  = sessions.reduce((a,s)=>a+(s.exercises?.reduce((b,ex)=>b+(ex.sets?.reduce((c,set)=>c+set.weight_kg*set.reps,0)||0),0)||0),0)
  const totalTime = sessions.reduce((a,s)=>a+(s.duration_seconds||0),0)
  const avgVol    = sessions.length ? Math.round(totalVol/sessions.length) : 0
  const avgSets   = sessions.length ? Math.round(totalSets/sessions.length) : 0

  // Volume/sets/duration trend (last 20 sessions chronologically)
  const trendData = filteredSessions.slice(0,20).reverse().map(s=>({
    date: fmtDate(s.session_date||s.created_at?.split('T')[0]),
    volume: Math.round(s.exercises?.reduce((b,ex)=>b+(ex.sets?.reduce((c,set)=>c+set.weight_kg*set.reps,0)||0),0)||0),
    sets: s.exercises?.reduce((b,ex)=>b+(ex.sets?.length||0),0)||0,
    duration: Math.round((s.duration_seconds||0)/60),
  }))

  // Complex muscle metrics: sessions + volume + sets + reps - both group AND sub-muscle level
  const muscleStats = {}
  ALL_MUSCLES.forEach(m => { muscleStats[m] = { sessions:0, volume:0, sets:0, reps:0, exercises:new Set(), subs:{} } })

  const getParentGroupInner = (muscle) => {
    if (!muscle) return 'Other'
    const m = String(muscle).trim()
    // Handle "Group › Sub" format
    if (m.includes(' › ')) return m.split(' › ')[0].trim()
    // Direct group match
    if (MUSCLE_TREE[m]) return m
    const groupCI = Object.keys(MUSCLE_TREE).find(k => k.toLowerCase() === m.toLowerCase())
    if (groupCI) return groupCI
    // Check subs case-insensitively
    for (const [group, data] of Object.entries(MUSCLE_TREE)) {
      if (data.subs?.some(s => s.toLowerCase() === m.toLowerCase())) return group
    }
    return m
  }

  filteredSessions.forEach(s => {
    const trainedMuscles = new Set(s.muscles_trained||[])
    s.exercises?.forEach(ex => {
      const rawMuscle = ex.muscle || 'Other'
      const parentGroup = getParentGroupInner(rawMuscle)
      // Extract clean sub-muscle name (strip "Group › " prefix if present)
      const cleanSub = rawMuscle.includes(' › ') ? rawMuscle.split(' › ')[1].trim() : rawMuscle
      const subMuscle = cleanSub !== parentGroup ? cleanSub : null
      if (!muscleStats[parentGroup]) muscleStats[parentGroup] = { sessions:0, volume:0, sets:0, reps:0, exercises:new Set(), subs:{} }
      trainedMuscles.add(parentGroup)
      muscleStats[parentGroup].exercises.add(ex.name)
      if (subMuscle) {
        if (!muscleStats[parentGroup].subs[subMuscle]) muscleStats[parentGroup].subs[subMuscle] = { volume:0, sets:0, reps:0, exercises:new Set() }
        muscleStats[parentGroup].subs[subMuscle].exercises.add(ex.name)
      }
      ex.sets?.forEach(set => {
        muscleStats[parentGroup].sets += 1
        muscleStats[parentGroup].reps += set.reps
        muscleStats[parentGroup].volume += set.weight_kg * set.reps
        if (subMuscle) {
          muscleStats[parentGroup].subs[subMuscle].sets += 1
          muscleStats[parentGroup].subs[subMuscle].reps += set.reps
          muscleStats[parentGroup].subs[subMuscle].volume += set.weight_kg * set.reps
        }
      })
    })
    trainedMuscles.forEach(m => { if (muscleStats[m]) muscleStats[m].sessions += 1 })
  })
  // Normalize to 0-100 for radar (based on volume relative to max)
  const maxVol = Math.max(1, ...Object.values(muscleStats).map(s=>s.volume))
  const radarData = ALL_MUSCLES.map(name => ({
    name,
    value: Math.round((muscleStats[name].volume / maxVol) * 100),
    volume: Math.round(muscleStats[name].volume),
    sets: muscleStats[name].sets,
    reps: muscleStats[name].reps,
    sessions: muscleStats[name].sessions,
  }))
  // For muscle frequency bar chart
  const muscleFreq = {}
  Object.entries(muscleStats).forEach(([m,s]) => { if(s.sessions>0) muscleFreq[m]=s.sessions })

  // Per-exercise weight progress
  const allExNames = [...new Set(sessions.flatMap(s=>s.exercises?.map(ex=>ex.name)||[]))]

  // Best lifts per exercise - with sub-muscle and parent group
  const getParentGroup = (muscle) => {
    if (!muscle) return 'Other'
    const m = String(muscle).trim()
    // Handle "Group › Sub" format - take the group part directly
    if (m.includes(' › ')) return m.split(' › ')[0].trim()
    // Direct group match
    if (MUSCLE_TREE[m]) return m
    // Case-insensitive group match
    const groupCI = Object.keys(MUSCLE_TREE).find(k => k.toLowerCase() === m.toLowerCase())
    if (groupCI) return groupCI
    // Check if it's a known sub-muscle - return its parent
    for (const [group, data] of Object.entries(MUSCLE_TREE)) {
      if (data.subs?.some(s => s.toLowerCase() === m.toLowerCase())) return group
    }
    return m
  }

  // Map exercise name -> muscle group for grouped dropdowns (after getParentGroup)
  const exMuscleMap = {}
  sessions.forEach(s => s.exercises?.forEach(ex => {
    if (ex.name && !exMuscleMap[ex.name]) {
      exMuscleMap[ex.name] = getParentGroup(ex.muscle || 'Other')
    }
  }))
  const exByMuscle = {}
  allExNames.forEach(n => {
    const g = exMuscleMap[n] || 'Other'
    if (!exByMuscle[g]) exByMuscle[g] = []
    exByMuscle[g].push(n)
  })
  // 3-level map: group -> sub-muscle -> exercises
  const exByMuscleDeep = {}
  sessions.forEach(s => s.exercises?.forEach(ex => {
    if (!ex.name) return
    const raw = ex.muscle || 'Other'
    const group = getParentGroup(raw)
    const sub = raw.includes(' › ') ? raw.split(' › ')[1].trim() : (raw !== group ? raw : group)
    if (!exByMuscleDeep[group]) exByMuscleDeep[group] = {}
    if (!exByMuscleDeep[group][sub]) exByMuscleDeep[group][sub] = new Set()
    exByMuscleDeep[group][sub].add(ex.name)
  }))
  // Convert Sets to sorted arrays
  Object.keys(exByMuscleDeep).forEach(g => {
    Object.keys(exByMuscleDeep[g]).forEach(s => {
      exByMuscleDeep[g][s] = [...exByMuscleDeep[g][s]].sort()
    })
  })

  // Personal bests should use ALL sessions, not just the filtered period
  const bestLifts = allExNames.map(name => {
    const allSets = sessions.flatMap(s => s.exercises?.filter(ex=>ex.name===name).flatMap(ex=>ex.sets||[])||[])
    const maxWeight = allSets.length ? Math.max(...allSets.map(s=>s.weight_kg)) : 0
    const rawMuscle = sessions.flatMap(s=>s.exercises||[]).find(ex=>ex.name===name)?.muscle || 'Other'
    const muscleGroup = getParentGroup(rawMuscle) // always the top-level group e.g. "Arms"
    // subMuscle: the specific sub e.g. "Forearms", "Biceps"
    // If rawMuscle is "Arms › Forearms" -> "Forearms"
    // If rawMuscle is "Forearms" directly -> "Forearms" (it's already a sub)  
    // If rawMuscle IS the group (e.g. "Arms") -> null
    const extractedSub = rawMuscle.includes(' › ') ? rawMuscle.split(' › ')[1].trim() : rawMuscle
    const subMuscle = extractedSub !== muscleGroup ? extractedSub : null
    return { name, maxWeight, totalSets: allSets.length, muscle: muscleGroup, subMuscle }
  }).filter(x=>x.totalSets>0).sort((a,b)=>b.maxWeight-a.maxWeight)

  // Weekly volume (last 8 weeks)
  const weeklyData = (() => {
    const weeks = {}
    filteredSessions.forEach(s => {
      const d = new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00')
      const weekStart = new Date(d); weekStart.setDate(d.getDate()-d.getDay())
      const key = weekStart.toISOString().split('T')[0]
      const vol = s.exercises?.reduce((b,ex)=>b+(ex.sets?.reduce((c,set)=>c+set.weight_kg*set.reps,0)||0),0)||0
      weeks[key] = (weeks[key]||0) + vol
    })
    return Object.entries(weeks).sort((a,b)=>a[0].localeCompare(b[0])).slice(-8).map(([date,volume])=>({
      week: new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),
      volume: Math.round(volume)
    }))
  })()

  // ── Actions ──
  const patchSet = async () => {
    if (!editSet) return
    await fetch('/api/sessions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'set',id:editSet.id,weight_kg:parseFloat(editSet.weight_kg),reps:parseInt(editSet.reps)})})
    await reload(user.id); setEditSet(null)
  }
  const deleteSet = async id => {
    if (!confirm('Delete set?')) return
    await fetch('/api/sessions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'set',id})})
    await reload(user.id)
  }
  const deletePhoto = async id => {
    if (!confirm('Remove photo?')) return
    await fetch('/api/sessions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'photo',id})})
    await reload(user.id)
  }
  const deleteExercise = async (exerciseId) => {
    if (!confirm('Delete this exercise and all its sets?')) return
    await fetch('/api/sessions', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'exercise',id:exerciseId}) })
    await reload(user.id)
  }

  const patchExercise = async () => {
    if (!editExercise) return
    await fetch('/api/sessions', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'exercise',id:editExercise.id,name:editExercise.name,muscle:editExercise.muscle,duration_seconds:editExercise.duration_seconds}) })
    await reload(user.id); setEditExercise(null)
  }

  const patchDuration = async () => {
    if (!editDuration) return
    let secs = editDuration.duration_seconds || 0
    // If start + end time provided, calculate duration
    if (editDuration.startTime && editDuration.endTime) {
      const date = editDuration.session_date || new Date().toISOString().split('T')[0]
      const start = new Date(date + 'T' + editDuration.startTime + ':00')
      const end   = new Date(date + 'T' + editDuration.endTime   + ':00')
      // Handle overnight (end < start means next day)
      const diff = end - start
      if (diff > 0 && diff < 12 * 3600 * 1000) secs = Math.round(diff / 1000)
    }
    await fetch('/api/sessions', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'session_duration',id:editDuration.sessionId,duration_seconds:secs,session_date:editDuration.session_date,startTime:editDuration.startTime||null,endTime:editDuration.endTime||null}) })
    await reload(user.id); setEditDuration(null)
  }

  const moveExercise = async (exerciseId, toSessionId) => {
    if (!user || !exerciseId || !toSessionId) return
    setMerging(true)
    try {
      // Move exercise to target session via PATCH
      await fetch('/api/sessions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'move_exercise', id: exerciseId, sessionId: toSessionId })
      })
      await reload(user.id)
      setMoveExMode(false); setMoveExSrc(null)
    } catch(e) {}
    setMerging(false)
  }

  const mergeSession = async (sourceId, targetId) => {
    if (!user || !sourceId || !targetId || sourceId === targetId) return
    setMerging(true)
    try {
      const r = await fetch('/api/sessions-merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, userId: user.id })
      })
      if (r.ok) { await reload(user.id); setMergeMode(false); setMergeSrc(null) }
    } catch(e) {}
    setMerging(false)
  }

  const saveMuscles = async () => {
    if (!editMuscles) return
    await fetch('/api/sessions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'muscles', id: editMuscles.sessionId, muscles: editMuscles.muscles })
    })
    await reload(user.id)
    setEditMuscles(null)
  }

  const deleteSession = async id => {
    if (!confirm('Delete this entire session?')) return
    await fetch('/api/sessions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'session',id})})
    await reload(user.id); setOpenId(null); setContSession(null)
  }
  const saveDate = async (id, newDate) => {
    await fetch('/api/sessions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'session',id,session_date:newDate})})
    await reload(user.id); setEditDate(null)
  }

  const [hiddenImages, setHiddenImages] = useState({}) // 'sess_'+sessionId or exerciseId -> bool

  const toggleExImage = async (exerciseId, hidden) => {
    setHiddenImages(p => ({...p, [exerciseId]: hidden}))
    await fetch('/api/sessions', { method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'exercise_image', id: exerciseId, hidden }) })
  }

  const addSetToEx = async () => {
    const w = newSet.w === '' ? null : parseFloat(newSet.w)
    const r = parseInt(newSet.r)
    // Allow weight=0 for bodyweight; only require reps > 0
    if (w === null || isNaN(w) || isNaN(r) || r <= 0) return
    setSaving(true)
    await fetch('/api/sessions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'add_set',sessionId:contSession.id,exerciseId:contExId,set:{weight_kg:w,reps:r}})})
    await reload(user.id); setNewSet({w:'',r:''}); setSaving(false)
  }

  const addExerciseToSession = async () => {
    if (!newEx.name.trim()) return
    const validSets = newEx.sets.filter(s=>s.w!==''&&s.r).map(s=>({weight_kg:parseFloat(s.w)||0,reps:parseInt(s.r)}))
    setSaving(true)
    await fetch('/api/sessions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'add_exercise',sessionId:contSession.id,exercise:{name:newEx.name.trim(),muscle:newEx.muscle,sets:validSets}})})
    await reload(user.id); setNewEx({name:'',muscle:'Chest',sets:[{w:'',r:''}]}); setContMode(null); setContImgB64(null); setContImgPreview(null); setSaving(false)
  }

  const addMuscleToSession = async muscle => {
    const updated = [...new Set([...(contSession.muscles_trained||[]),muscle])]
    await fetch('/api/sessions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'update_muscles',sessionId:contSession.id,muscles:updated})})
    await reload(user.id)
  }

  const validateExName = async () => {
    if (!analyzeText.trim() && !contImgB64) return
    setAnalyzing(true); setSuggested([])
    try {
      const mode = contImgB64 && analyzeText.trim() ? 'both' : contImgB64 ? 'image' : 'text'
      let r, d
      try {
        r = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ selectedMuscles:contSession.muscles_trained||ALL_MUSCLES, textInput:analyzeText.trim()||null, imageBase64:contImgB64||null, imageMime:contImgMime, mode }) })
      } catch(e) { setAnalyzing(false); return }
      try { d = await r.json() } catch(e) { setAnalyzing(false); return }
      if (d.exercises?.length) {
        setSuggested(d.exercises)
        setNewEx(p=>({...p, name:d.exercises[0].canonical, muscle:normalizeMuscle(d.exercises[0].primary_muscle||d.exercises[0].muscle)}))
      }
    } catch(e) {}
    setAnalyzing(false)
  }

  const loadContImg = file => {
    if (!file?.type.startsWith('image/')) return
    setContImgMime(file.type||'image/jpeg')
    const reader = new FileReader()
    reader.onload = e => { const d=e.target.result; setContImgPreview(d); setContImgB64(d.split(',')[1]) }
    reader.readAsDataURL(file)
  }

  if (loading) return <Loader/>

  // Strength progression data (computed before render)
  const exData = selProgressEx ? filteredSessions.flatMap(s => {
    const ex = s.exercises?.find(e => e.name === selProgressEx)
    if (!ex?.sets?.length) return []
    const maxW = Math.max(...ex.sets.map(st => st.weight_kg || 0))
    const dateStr = s.session_date || s.created_at?.split('T')[0]
    return maxW > 0 ? [{ date: dateStr, weight: maxW, label: new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) }] : []
  }).filter(p=>p.weight>0).sort((a,b)=>a.date.localeCompare(b.date)) : []

  // Weekly summary
  const weekStartStr = (() => { const m=new Date(); m.setDate(m.getDate()-m.getDay()+1); return m.toISOString().split('T')[0] })()
  const runAnalysis = async (force=false) => {
    if (!user) return
    const range = getAnalysisRange()
    setAnalysisLoading(true); setAnalysisReport(null)
    try {
      const rangeSessions = sessions.filter(s => {
        const d = s.session_date || s.created_at?.split('T')[0] || ''
        return d >= range.from && d <= range.to
      })
      const [wr, mr] = await Promise.all([
        fetch('/api/weight?userId='+user.id).then(r=>r.json()).catch(()=>({entries:[]})),
        fetch('/api/meals?userId='+user.id+'&from='+range.from+'&to='+range.to).then(r=>r.json()).catch(()=>({meals:[]}))
      ])
      const r = await fetch('/api/analysis-report', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId:user.id, periodType:analysisMode, periodFrom:range.from, periodTo:range.to,
          sessions:rangeSessions, meals:mr.meals||[], weightEntries:wr.entries||[], profile, force })
      })
      const d = await r.json()
      if (d.report) { setAnalysisReport(d.report); setAnalysisMeta({generatedAt:new Date(),cached:d.cached}) }
    } catch(e) { console.error(e) }
    setAnalysisLoading(false)
  }

  // Load stored report when period changes
  const loadStoredReport = async (modeOverride, keyOverride) => {
    if (!user) return
    const mode = modeOverride || analysisMode
    const key = keyOverride || getAnalysisRange().periodKey
    try {
      const r = await fetch('/api/analysis-report?userId='+user.id+'&periodType='+mode+'&periodKey='+key)
      const d = await r.json()
      if (d.report?.report) { setAnalysisReport(d.report.report); setAnalysisMeta({generatedAt:new Date(d.report.generated_at),cached:true}) }
      else setAnalysisReport(null)
    } catch(e) {}
  }

  // Push notification setup
  const setupPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      // Use a public VAPID key (would need real key in production)
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: null })
      await fetch('/api/push-subscribe', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId: user.id, subscription: sub }) })
      setPushEnabled(true)
    } catch(e) { console.error('Push setup:', e) }
  }

  // Check if period just ended and auto-trigger analysis
  const checkAutoAnalysis = () => {
    const now = new Date()
    const isEndOfWeek = now.getDay() === 0 && now.getHours() >= 22 // Sunday 10pm+
    const isEndOfMonth = now.getDate() === new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() && now.getHours() >= 22
    if (isEndOfWeek && analysisMode === 'week') runAnalysis(false)
    if (isEndOfMonth && analysisMode === 'month') runAnalysis(false)
  }

  // Alias for existing code
  const generateWeekly = () => runAnalysis(false)


  // Compute date range for the selected analysis period
  const getAnalysisRange = () => {
    const today = new Date()
    const pad = n => String(n).padStart(2,'0')
    const fmt = d => d.toISOString().split('T')[0]
    if (analysisMode === 'week') {
      const ws = selectedWeek
      const we = new Date(ws+'T12:00:00'); we.setDate(we.getDate()+6)
      const fmtD = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'})
      return { from: ws, to: fmt(we), label: fmtD(new Date(ws+'T12:00:00'))+' - '+fmtD(we), periodKey: ws }
    }
    if (analysisMode === 'month') {
      const [y,m] = selectedMonth.split('-').map(Number)
      const from = y+'-'+pad(m)+'-01'
      const lastDay = new Date(y,m,0).getDate()
      return { from, to: y+'-'+pad(m)+'-'+pad(lastDay), label: new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}), periodKey: selectedMonth }
    }
    if (analysisMode === 'quarter') {
      const [y,q] = selectedQuarter ? selectedQuarter.split('-Q').map(Number) : [today.getFullYear(), Math.floor(today.getMonth()/3)+1]
      const qs=(q-1)*3
      return { from: fmt(new Date(y,qs,1)), to: fmt(new Date(y,qs+3,0)), label: 'Q'+q+' '+y, periodKey: y+'-Q'+q }
    }
    if (analysisMode === 'halfyear') {
      const [y,h] = selectedHalf ? selectedHalf.split('-H').map(Number) : [today.getFullYear(), today.getMonth()<6?1:2]
      return { from: h===1?y+'-01-01':y+'-07-01', to: h===1?y+'-06-30':y+'-12-31', label: (h===1?'Jan-Jun ':'Jul-Dec ')+y, periodKey: y+'-H'+h }
    }
    if (analysisMode === 'year') {
      const y = selectedYear || today.getFullYear()
      return { from: y+'-01-01', to: y+'-12-31', label: String(y), periodKey: String(y) }
    }
    if (analysisMode === 'alltime') {
      return { from: '2020-01-01', to: fmt(today), label: 'All Time', periodKey: 'alltime' }
    }
    if (analysisMode === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo, label: customFrom+' to '+customTo, periodKey: customFrom+'_'+customTo }
    }
    return { from: weekStartStr, to: weekStartStr, label: 'This Week', periodKey: weekStartStr }
  }

  return (
    <div style={{minHeight:'100vh',background:'#080808',color:'#f0f0f0',fontFamily:"'DM Sans',sans-serif",maxWidth:960,margin:'0 auto',padding:'0 0 80px'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        .bb{font-family:'Bebas Neue',sans-serif;letter-spacing:2px}
        .card{background:#111;border:1px solid #1e1e1e;border-radius:14px;padding:18px}
        .card-sm{background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:14px}
        .tag{display:inline-block;padding:4px 10px;border-radius:20px;font-size:.68rem;font-weight:600;letter-spacing:.5px}
        .setrow{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#0d0d0d;border-radius:8px;border-left:3px solid #e8ff47;margin-bottom:5px}
        .btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-family:'Bebas Neue',sans-serif;font-size:1rem;letter-spacing:2px;cursor:pointer;transition:all .15s;text-align:center}
        .btn-y{background:#e8ff47;color:#080808}.btn-y:hover:not(:disabled){background:#d4eb30}.btn-y:disabled{opacity:.35;cursor:not-allowed}
        .btn-d{background:#161616;border:1px solid #2a2a2a;color:#aaa;font-family:'DM Sans',sans-serif;font-size:.85rem;letter-spacing:0;padding:12px}.btn-d:hover{border-color:#555;color:#fff}
        .btn-sm{background:#161616;border:1px solid #2a2a2a;color:#aaa;font-family:'DM Sans',sans-serif;font-size:.75rem;padding:7px 13px;border-radius:8px;cursor:pointer;transition:all .15s}.btn-sm:hover{border-color:#555;color:#fff}
        .ctab{background:transparent;border:1px solid #2a2a2a;border-radius:6px;color:#777;font-family:'DM Sans',sans-serif;font-size:.75rem;padding:6px 13px;cursor:pointer;transition:all .15s}
        .ctab.on{background:#e8ff47;color:#080808;border-color:#c8ff00}
        .tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#555;font-family:'DM Sans',sans-serif;font-size:.9rem;padding:10px 16px;cursor:pointer;transition:all .15s;font-weight:500}
        .tab.on{color:#c8ff00;border-bottom-color:#c8ff00}
        input[type=number],input[type=text],input[type=date],select{background:#141414;border:1px solid #2a2a2a;color:#f0f0f0;padding:11px 14px;font-family:'DM Sans',sans-serif;font-size:.9rem;border-radius:8px;outline:none;width:100%;transition:border .2s}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.7)}
        input:focus,select:focus{border-color:#c8ff00}
        select{background:#141414}
        ::placeholder{color:#3a3a3a}
      `}</style>

      <TopNav title="My Progress" user={user} onSignOut={()=>supabase.auth.signOut().then(()=>router.push('/'))}/>

      {sessions.length === 0 ? (
        <div style={{textAlign:'center',paddingTop:80,color:'#555',padding:'80px 20px'}}>
          <div style={{fontSize:'3rem',marginBottom:12}}>📊</div>
          <div className="bb" style={{fontSize:'1.5rem',letterSpacing:2,marginBottom:8}}>NO DATA YET</div>
          <div style={{fontSize:'.9rem',marginBottom:24,color:'#444'}}>Complete your first session to see your progress charts here.</div>
          <button className="btn btn-y" style={{maxWidth:220,margin:'0 auto'}} onClick={()=>router.push('/')}>START FIRST SESSION →</button>
        </div>
      ) : (
        <div style={{padding:'0 20px'}}>

          {/* ── Stats ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:20}}>
            {[
              ['SESSIONS', sessions.length, '#c8ff00'],
              ['SETS', totalSets, '#3b82f6'],
              ['VOL', Math.round(totalVol/1000)+'k', '#22c55e'],
              ['AVG VOL', Math.round(avgVol/1000)+'k', '#f97316'],
              ['TIME', fmt(totalTime), '#a855f7'],
            ].map(([l,v,c])=>(
              <div key={l} className="card" style={{padding:'12px 10px',textAlign:'center',borderColor:'#181818'}}>
                <div className="bb" style={{fontSize:'1.4rem',color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:'.6rem',color:'#666',letterSpacing:1,marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div style={{display:'flex',borderBottom:'1px solid #1e1e1e',marginBottom:20}}>
            {[['overview','📊 Overview'],['history','📋 History'],['analysis','🤖 Analysis']].map(([id,label])=>(
              <button key={id} className={`tab${activeTab===id?' on':''}`} onClick={()=>{setActiveTab(id);if(id==='analysis'&&user)setTimeout(()=>{loadStoredReport(analysisMode,getAnalysisRange().periodKey)},50)}}>{label}</button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <>
              {/* Period selector dropdown */}
              <div style={{position:'relative',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
                <span style={{color:'var(--text-muted)',fontSize:'.72rem',fontWeight:700,letterSpacing:1}}>PERIOD</span>
                <div style={{position:'relative'}}>
                  <button onClick={()=>setPeriodOpen(o=>!o)}
                    style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'7px 14px',cursor:'pointer',color:'var(--text-primary)',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',fontWeight:600}}>
                    {({'today':'Today','last':'Last session','week':'7 days','15d':'15 days','month':'1 month','3month':'3 months','all':'All time','custom':'Custom'})[period]}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                  {periodOpen && (
                    <div className="dropdown" style={{minWidth:160}}>
                      {[['today','Today'],['last','Last session'],['week','7 days'],['15d','15 days'],['month','1 month'],['3month','3 months'],['all','All time'],['custom','Custom range']].map(([id,label])=>(
                        <button key={id} className="dropdown-item" style={{color:period===id?'#c8ff00':'var(--text-secondary)',background:period===id?'rgba(200,255,0,0.08)':'transparent'}}
                          onClick={()=>{setPeriod(id);setPeriodOpen(false);setShowCustomPeriod(id==='custom')}}>
                          {period===id&&'✓ '}{label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {period==='custom' && showCustomPeriod && (
                <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{color:'#555',fontSize:'.7rem',marginBottom:4}}>FROM</div>
                    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{padding:'8px 12px',fontSize:'.85rem'}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:'#555',fontSize:'.7rem',marginBottom:4}}>TO</div>
                    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{padding:'8px 12px',fontSize:'.85rem'}}/>
                  </div>
                </div>
              )}

              {filteredSessions.length === 0 && (
                <div style={{textAlign:'center',padding:'30px',color:'#555',background:'#0d0d0d',borderRadius:12,marginBottom:16}}>No sessions in this period</div>
              )}

              {/* Volume trend */}
              {trendData.length > 1 && (
                <div className="card" style={{marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div>
                      <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2}}>SESSION TREND</div>
                      <div style={{color:'#555',fontSize:'.75rem',marginTop:2}}>{trendData.length} sessions · {period==='all'?'all time':period==='custom'?'custom period':period==='week'?'last 7 days':period==='15d'?'last 15 days':period==='month'?'last month':'last 3 months'}</div>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      {['volume','sets','duration'].map(k=>(
                        <button key={k} className={`ctab${activeChart===k?' on':''}`} onClick={()=>setActiveChart(k)}>{k}</button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={trendData} margin={{top:5,right:5,bottom:0,left:0}}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#c8ff00" stopOpacity={.2}/>
                          <stop offset="95%" stopColor="#c8ff00" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="date" tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                      <Tooltip content={<Tip/>}/>
                      <Area type="monotone" dataKey={activeChart} stroke="#c8ff00" strokeWidth={2.5} fill="url(#ag)" dot={{fill:'#c8ff00',r:3,strokeWidth:0}} activeDot={{r:5}} name={activeChart}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Weekly volume bars */}
              {weeklyData.length > 1 && (
                <div className="card" style={{marginBottom:16}}>
                  <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2,marginBottom:14}}>WEEKLY VOLUME (kg)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={weeklyData} margin={{top:5,right:5,bottom:0,left:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a"/>
                      <XAxis dataKey="week" tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'#555',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="volume" fill="#3b82f6" radius={[4,4,0,0]} name="volume kg"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Radar + Exercise progress side by side */}
              <div className="card">
                  <div className="bb" style={{fontSize:'.75rem',color:'#ccc',letterSpacing:2,marginBottom:10}}>MUSCLE BALANCE</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <RadarChart data={radarData} margin={{top:10,right:20,bottom:10,left:20}}>
                      <PolarGrid stroke="#1e1e1e"/>
                      <PolarAngleAxis dataKey="name" tick={{fill:'#666',fontSize:10}}/>
                      <Radar dataKey="value" stroke="#c8ff00" fill="#c8ff00" fillOpacity={.15} strokeWidth={2}/>
                      <Tooltip content={({active,payload,label})=>{
                        if(!active||!payload?.length) return null
                        const d = payload[0]?.payload
                        return <div style={{background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                          <div style={{color:'#c8ff00',fontWeight:700,marginBottom:5}}>{label}</div>
                          <div style={{color:'#ccc'}}>Volume: <b>{d?.volume?.toLocaleString()||0} kg</b></div>
                          <div style={{color:'#aaa'}}>Sets: <b>{d?.sets||0}</b></div>
                          <div style={{color:'#aaa'}}>Reps: <b>{d?.reps||0}</b></div>
                          <div style={{color:'#aaa'}}>Sessions: <b>{d?.sessions||0}</b></div>
                        </div>
                      }}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

              {/* Personal Bests - two-level drill: Muscle Group > Sub-muscle */}
              {bestLifts.length > 0 && (
                <div className="card" style={{marginBottom:16}}>
                  {/* Header + breadcrumb */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2}}>PERSONAL BESTS</div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {bestsSubMuscle && <button onClick={()=>setBestsSubMuscle(null)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif"}}>← {bestsMuscle}</button>}
                      {bestsMuscle && !bestsSubMuscle && <button onClick={()=>{setBestsMuscle(null);setBestsSubMuscle(null)}} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif"}}>← All</button>}
                    </div>
                  </div>

                  {/* Breadcrumb path */}
                  {(bestsMuscle||bestsSubMuscle) && (
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:12,fontSize:'.72rem',color:'#555'}}>
                      <span style={{cursor:'pointer',color:!bestsMuscle?'#888':'#555'}} onClick={()=>{setBestsMuscle(null);setBestsSubMuscle(null)}}>All</span>
                      {bestsMuscle && <><span>›</span><span style={{color:!bestsSubMuscle?mc(bestsMuscle):'#555',cursor:'pointer'}} onClick={()=>setBestsSubMuscle(null)}>{bestsMuscle}</span></>}
                      {bestsSubMuscle && <><span>›</span><span style={{color:mc(bestsMuscle)}}>{bestsSubMuscle}</span></>}
                    </div>
                  )}

                  {/* Level 1: Muscle group pills */}
                  {!bestsMuscle && (
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                      {[...new Set(bestLifts.map(b=>b.muscle))].map(m => {
                        const count = bestLifts.filter(b=>b.muscle===m).length
                        return (
                          <button key={m} onClick={()=>{setBestsMuscle(m);setBestsSubMuscle(null)}}
                            style={{background:mc(m)+'18',border:'1px solid '+mc(m)+'44',color:mc(m),borderRadius:20,padding:'6px 13px',fontSize:'.75rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                            {m}
                            <span style={{background:mc(m)+'30',borderRadius:20,padding:'1px 6px',fontSize:'.65rem'}}>{count}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Level 2: Sub-muscle pills (when group selected, no sub selected) */}
                  {bestsMuscle && !bestsSubMuscle && (
                    <>
                      {/* Show sub-muscle pills for this group */}
                      {(() => {
                        const subMuscles = [...new Set(bestLifts.filter(b=>b.muscle===bestsMuscle).map(b=>b.subMuscle).filter(Boolean))]
                        const uniqueSubs = subMuscles.filter((s,i,a)=>a.indexOf(s)===i && s !== bestsMuscle)
                        return uniqueSubs.length > 0 ? (
                          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
                            <button onClick={()=>setBestsSubMuscle('__all__')}
                              style={{background:bestsSubMuscle==='__all__'?mc(bestsMuscle)+'30':'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:20,padding:'4px 11px',fontSize:'.7rem',fontWeight:700,cursor:'pointer',color:bestsSubMuscle==='__all__'?mc(bestsMuscle):'rgba(255,255,255,0.4)'}}>
                              All {bestsMuscle}
                            </button>
                            {uniqueSubs.map(sub=>{
                              const count=bestLifts.filter(b=>b.muscle===bestsMuscle&&b.subMuscle===sub).length
                              return (
                                <button key={sub} onClick={()=>setBestsSubMuscle(sub)}
                                  style={{background:bestsSubMuscle===sub?mc(bestsMuscle)+'30':'rgba(255,255,255,0.04)',border:'1px solid '+(bestsSubMuscle===sub?mc(bestsMuscle)+'55':'rgba(255,255,255,0.1)'),borderRadius:20,padding:'4px 11px',fontSize:'.7rem',fontWeight:700,cursor:'pointer',color:bestsSubMuscle===sub?mc(bestsMuscle):'rgba(255,255,255,0.45)',display:'flex',alignItems:'center',gap:4}}>
                                  {sub} <span style={{opacity:.6,fontSize:'.62rem'}}>{count}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null
                      })()}
                    </>
                  )}

                  {/* Exercise cards */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {(() => {
                      let filtered = bestLifts
                      if (bestsMuscle) filtered = filtered.filter(b=>b.muscle===bestsMuscle)
                      if (bestsSubMuscle && bestsSubMuscle !== '__all__') filtered = filtered.filter(b=>b.subMuscle===bestsSubMuscle)
                      return filtered.map((ex,i)=>(
                        <div key={i} style={{background:'#0d0d0d',borderRadius:10,padding:'11px',border:'1px solid #1a1a1a',cursor:'pointer',transition:'border-color .15s'}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor='#2a2a2a'}
                          onMouseLeave={e=>e.currentTarget.style.borderColor='#1a1a1a'}
                          onClick={()=>{setSelEx(ex.name);setActiveTab('overview')}}>
                          {/* Muscle + sub-muscle tags */}
                          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>
                            <span style={{background:mc(ex.muscle)+'22',color:mc(ex.muscle),border:'1px solid '+mc(ex.muscle)+'44',borderRadius:20,padding:'2px 7px',fontSize:'.58rem',fontWeight:700}}>{ex.muscle}</span>
                            {ex.subMuscle && ex.subMuscle !== ex.muscle && (
                              <span style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.45)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:20,padding:'2px 7px',fontSize:'.58rem',fontWeight:600}}>{ex.subMuscle}</span>
                            )}
                          </div>
                          <div style={{fontWeight:600,fontSize:'.8rem',color:'#ddd',marginBottom:5,lineHeight:1.3}}>{ex.name}</div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                            <span className="bb" style={{fontSize:'1.25rem',color:'#c8ff00'}}>{ex.maxWeight}<span style={{fontSize:'.58rem',color:'#555',marginLeft:2}}>kg</span></span>
                            <span style={{fontSize:'.65rem',color:'#555'}}>{ex.totalSets} sets</span>
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}

              {/* ── MUSCLE RECOVERY HEATMAP ── */}
              {filteredSessions.length > 0 && (() => {
                const now = Date.now()
                const GROUPS = ['Chest','Back','Shoulders','Arms','Legs','Core','Cardio']
                const recovery = GROUPS.map(g => {
                  // Find most recent session that trained this group or its sub-muscles
                  let lastMs = 0
                  filteredSessions.forEach(s => {
                    const trained = s.muscles_trained || []
                    const subs = MUSCLE_TREE[g]?.subs || []
                    if (trained.includes(g) || subs.some(sub => trained.includes(sub))) {
                      const d = new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00').getTime()
                      if (d > lastMs) lastMs = d
                    }
                  })
                  if (!lastMs) return { group: g, status: 'fresh', hoursAgo: null }
                  const hoursAgo = Math.round((now - lastMs) / 3600000)
                  return { group: g, status: hoursAgo < 24 ? 'fatigued' : hoursAgo < 48 ? 'recovering' : 'ready', hoursAgo }
                })
                return (
                  <div className="card" style={{marginBottom:16}}>
                    <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2,marginBottom:12}}>MUSCLE RECOVERY</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:8}}>
                      {recovery.map(({group,status,hoursAgo}) => {
                        const col = status==='ready'?'#4ade80':status==='recovering'?'#eab308':'#ef4444'
                        const bg = status==='ready'?'rgba(74,222,128,0.08)':status==='recovering'?'rgba(234,179,8,0.08)':'rgba(239,68,68,0.08)'
                        return (
                          <div key={group} style={{background:bg,border:'1px solid '+col+'33',borderRadius:10,padding:'8px 4px',textAlign:'center'}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:col,margin:'0 auto 5px'}}/>
                            <div style={{fontSize:'.62rem',fontWeight:700,color:'rgba(255,255,255,0.7)',marginBottom:2}}>{group}</div>
                            <div style={{fontSize:'.55rem',color:col,fontWeight:600}}>
                              {status==='ready'?'READY':status==='recovering'?(hoursAgo+'h ago'):'TODAY'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{display:'flex',gap:12,fontSize:'.65rem'}}>
                      {[['#4ade80','READY (48h+)'],['#eab308','RECOVERING (24-48h)'],['#ef4444','FATIGUED (<24h)']].map(([c,l])=>(
                        <div key={l} style={{display:'flex',alignItems:'center',gap:4,color:'rgba(255,255,255,0.3)'}}>
                          <div style={{width:6,height:6,borderRadius:'50%',background:c,flexShrink:0}}/>
                          {l}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ── STRENGTH PROGRESSION ── */}
              {allExNames.length > 0 && (() => {
                return (
                  <div className="card" style={{marginBottom:16}}>
                    <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2,marginBottom:10}}>STRENGTH PROGRESSION</div>
                    <ExPicker
                      deep={exByMuscleDeep} mc={mc}
                      group={progDropGroup} setGroup={setProgDropGroup}
                      sub={progDropSub} setSub={setProgDropSub}
                      open={progOpen} setOpen={setProgOpen}
                      query={progQuery} setQuery={setProgQuery}
                      selected={selProgressEx} onSelect={n=>{setSelProgressEx(n);setProgDropGroup(null);setProgDropSub(null);setProgOpen(false);setProgQuery('')}}
                      onClear={()=>{setSelProgressEx('');setProgDropGroup(null);setProgDropSub(null)}}
                    />
                    {selProgressEx && exData.length > 1 ? (
                      <>
                        <div style={{display:'flex',gap:12,marginBottom:10}}>
                          {[['Start',exData[0]?.weight+' kg','#888'],['Current',exData[exData.length-1]?.weight+' kg','#c8ff00'],['Best',Math.max(...exData.map(p=>p.weight))+' kg','#4ade80'],['Sessions',exData.length,'#3b82f6']].map(([l,v,col])=>(
                            <div key={l} style={{flex:1,textAlign:'center',background:'rgba(255,255,255,0.03)',borderRadius:9,padding:'8px 4px',border:'1px solid rgba(255,255,255,0.06)'}}>
                              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:col,lineHeight:1}}>{v}</div>
                              <div style={{fontSize:'.55rem',color:'#555',letterSpacing:1,marginTop:3}}>{l.toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={exData} margin={{top:4,right:4,bottom:0,left:-25}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#111"/>
                            <XAxis dataKey="label" tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                            <YAxis tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
                            <Tooltip contentStyle={{background:'#0c0c14',border:'1px solid #222',borderRadius:8,color:'#e8e8f0',fontSize:'.78rem'}} formatter={v=>[v+' kg','Max Weight']}/>
                            <Line type="monotone" dataKey="weight" stroke="#c8ff00" strokeWidth={2.5} dot={{fill:'#c8ff00',r:3}} activeDot={{r:5}}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    ) : selProgressEx && exData.length === 1 ? (
                      <div style={{textAlign:'center',padding:'20px 0',color:'rgba(255,255,255,0.3)',fontSize:'.82rem'}}>Only 1 session found. Log more to see progression.</div>
                    ) : selProgressEx ? (
                      <div style={{textAlign:'center',padding:'20px 0',color:'rgba(255,255,255,0.3)',fontSize:'.82rem'}}>No sets with weight found for this exercise.</div>
                    ) : null}
                  </div>
                )
              })()}

              {/* ── WEEKLY AI SUMMARY ── */}
              {(() => {
                return (
                  <div className="card" style={{marginBottom:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2}}>WEEKLY AI SUMMARY</div>
                      <button onClick={generateWeekly} disabled={weeklyLoading}
                        style={{padding:'5px 11px',background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.2)',borderRadius:20,color:'#c8ff00',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.7rem',fontWeight:700,opacity:weeklyLoading?.6:1}}>
                        {weeklyLoading?'Analyzing…':weeklySummary?'↺ Refresh':'Generate'}
                      </button>
                    </div>
                    {weeklySummary ? (
                      <div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:12}}>
                          {[['Overall',weeklySummary.overall_score,'#c8ff00'],['Training',weeklySummary.training_score,'#3b82f6'],['Nutrition',weeklySummary.nutrition_score,'#4ade80']].map(([l,v,col])=>(
                            <div key={l} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'10px',textAlign:'center'}}>
                              <div className="bb" style={{fontSize:'1.2rem',color:col}}>{v}<span style={{fontSize:'.6rem',opacity:.5}}>/10</span></div>
                              <div style={{fontSize:'.58rem',color:'#555',letterSpacing:1,marginTop:3}}>{l.toUpperCase()}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{fontSize:'.82rem',color:'rgba(255,255,255,0.6)',lineHeight:1.6,marginBottom:10,padding:'10px',background:'rgba(255,255,255,0.02)',borderRadius:9}}>{weeklySummary.summary}</div>
                        {weeklySummary.highlights?.length>0 && (
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:1.5,color:'#4ade80',marginBottom:6}}>THIS WEEK'S HIGHLIGHTS</div>
                            {weeklySummary.highlights.map((h,i)=><div key={i} style={{fontSize:'.8rem',color:'rgba(255,255,255,0.55)',marginBottom:4}}>✓ {h}</div>)}
                          </div>
                        )}
                        {weeklySummary.next_week_focus?.length>0 && (
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:1.5,color:'#c8ff00',marginBottom:6}}>NEXT WEEK: FOCUS ON</div>
                            {weeklySummary.next_week_focus.map((f,i)=><div key={i} style={{fontSize:'.8rem',color:'rgba(255,255,255,0.55)',marginBottom:4}}>→ {f}</div>)}
                          </div>
                        )}
                        {weeklySummary.motivation && (
                          <div style={{padding:'10px 12px',background:'rgba(200,255,0,0.05)',border:'1px solid rgba(200,255,0,0.12)',borderRadius:9,fontSize:'.8rem',color:'#c8ff00',fontStyle:'italic',lineHeight:1.5}}>
                            "{weeklySummary.motivation}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{textAlign:'center',padding:'16px 0',color:'rgba(255,255,255,0.25)',fontSize:'.82rem'}}>
                        {weeklyLoading ? (
                          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                            <div style={{width:20,height:20,border:'2px solid rgba(200,255,0,0.2)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
                            Analyzing your week…
                          </div>
                        ) : 'Tap Generate for your weekly AI coaching report'}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ── WEIGHT PROGRESS ── */}
              {weightEntries.length > 0 && (() => {
                const isMetric = profile?.unit_system !== 'imperial'
                const unit = isMetric ? 'kg' : 'lbs'
                const toDisp = kg => isMetric ? Math.round(kg*10)/10 : Math.round(kg/0.453592*10)/10
                const chartW = weightEntries.slice(-20).map(e => ({
                  label: new Date(e.recorded_at+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),
                  weight: toDisp(e.weight_kg)
                }))
                const latest = toDisp(weightEntries[weightEntries.length-1].weight_kg)
                const first = toDisp(weightEntries[0].weight_kg)
                const totalChange = Math.round((latest - first)*10)/10
                return (
                  <div className="card" style={{marginBottom:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2}}>WEIGHT PROGRESS</div>
                      <button onClick={()=>router.push('/weight')}
                        style={{background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.2)',borderRadius:8,padding:'5px 12px',color:'#c8ff00',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.75rem',fontWeight:700}}>
                        + Log Weight
                      </button>
                    </div>
                    {/* Stats */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
                      {[
                        ['Current', latest + ' ' + unit, '#c8ff00'],
                        ['Change', (totalChange>0?'+':'')+totalChange+' '+unit, totalChange>0?'#ef4444':totalChange<0?'#4ade80':'#888'],
                        ['Entries', weightEntries.length, '#a855f7'],
                      ].map(([l,v,col]) => (
                        <div key={l} style={{background:'#0d0d0d',border:'1px solid #1a1a1a',borderRadius:10,padding:'10px',textAlign:'center'}}>
                          <div className="bb" style={{fontSize:'1rem',color:col,lineHeight:1}}>{v}</div>
                          <div style={{fontSize:'.58rem',color:'#555',letterSpacing:1,marginTop:4}}>{l.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                    {/* Mini chart */}
                    {chartW.length > 1 && (
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={chartW} margin={{top:4,right:4,bottom:0,left:-28}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#111"/>
                          <XAxis dataKey="label" tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                          <YAxis tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false} domain={['auto','auto']}/>
                          <Tooltip contentStyle={{background:'#0c0c14',border:'1px solid #222',borderRadius:8,color:'#e8e8f0',fontSize:'.78rem'}} formatter={v=>[v+' '+unit,'Weight']}/>
                          <Line type="monotone" dataKey="weight" stroke="#c8ff00" strokeWidth={2} dot={{fill:'#c8ff00',r:2.5}} activeDot={{r:4}}/>
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    <button onClick={()=>router.push('/weight')} style={{width:'100%',marginTop:10,padding:'9px',background:'transparent',border:'1px solid #1a1a1a',borderRadius:9,color:'#555',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.78rem',fontWeight:600}}>
                      View full history →
                    </button>
                  </div>
                )
              })()}

              {/* Muscle Breakdown - group + sub-muscle bars */}
              {Object.keys(muscleFreq).length > 0 && (
                <div className="card" style={{marginBottom:16}}>
                  <div className="bb" style={{fontSize:'.85rem',color:'#ccc',letterSpacing:2,marginBottom:4}}>MUSCLE BREAKDOWN</div>
                  <div style={{color:'#555',fontSize:'.72rem',marginBottom:14}}>Volume = total weight x reps. Expand to see sub-muscles.</div>
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {ALL_MUSCLES.filter(m=>muscleStats[m]?.volume>0).sort((a,b)=>(muscleStats[b]?.volume||0)-(muscleStats[a]?.volume||0)).map(m=>{
                      const s = muscleStats[m]
                      const pct = Math.min(100, Math.round((s.volume/maxVol)*100))
                      const subEntries = Object.entries(s.subs||{}).filter(([,sv])=>sv.volume>0).sort((a,b)=>b[1].volume-a[1].volume)
                      return (
                        <div key={m}>
                          {/* Group row */}
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,alignItems:'center'}}>
                            <span style={{fontSize:'.85rem',color:'#ddd',fontWeight:700}}>{m}</span>
                            <div style={{display:'flex',gap:8,fontSize:'.7rem',color:'#555',alignItems:'center'}}>
                              <span>{s.sessions} sess</span>
                              <span>{s.sets} sets</span>
                              <span style={{color:mc(m),fontWeight:700,fontSize:'.75rem'}}>{s.volume>=1000?Math.round(s.volume/100)/10+'k':Math.round(s.volume)} kg</span>
                            </div>
                          </div>
                          <div style={{height:9,background:'#1a1a1a',borderRadius:5,overflow:'hidden',marginBottom: subEntries.length?6:0}}>
                            <div style={{height:'100%',width:`${pct}%`,background:mc(m),borderRadius:5,transition:'width .5s ease'}}/>
                          </div>
                          {/* Sub-muscle rows */}
                          {subEntries.map(([sub, sv]) => {
                            const subPct = Math.min(100, Math.round((sv.volume/s.volume)*100))
                            return (
                              <div key={sub} style={{marginLeft:12,marginBottom:4}}>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                  <span style={{fontSize:'.72rem',color:'rgba(255,255,255,0.4)',display:'flex',alignItems:'center',gap:5}}>
                                    <span style={{color:mc(m),opacity:.5}}>└</span> {sub}
                                  </span>
                                  <div style={{display:'flex',gap:6,fontSize:'.65rem',color:'#444'}}>
                                    <span>{sv.sets} sets</span>
                                    <span style={{color:mc(m)+'aa',fontWeight:700}}>{sv.volume>=1000?Math.round(sv.volume/100)/10+'k':Math.round(sv.volume)} kg</span>
                                    <span style={{color:mc(m)+'77'}}>{subPct}%</span>
                                  </div>
                                </div>
                                <div style={{height:4,background:'#151515',borderRadius:3,overflow:'hidden'}}>
                                  <div style={{height:'100%',width:`${subPct}%`,background:mc(m),opacity:.5,borderRadius:3,transition:'width .5s ease'}}/>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

{/* ── STRENGTH PROGRESSION TAB ── */}
        {activeTab==='analysis' && (
          <div style={{paddingTop:8}}>

            {/* Period mode pills */}
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
              {[['week','This Week'],['month','Monthly'],['quarter','Quarter'],['halfyear','Half Year'],['year','Yearly'],['alltime','All Time'],['custom','Custom']].map(([mode,label])=>(
                <button key={mode} onClick={()=>{setAnalysisMode(mode);setAnalysisReport(null);setTimeout(()=>loadStoredReport(mode,null),50)}}
                  style={{padding:'5px 12px',background:analysisMode===mode?'rgba(200,255,0,0.12)':'rgba(255,255,255,0.04)',border:'1px solid '+(analysisMode===mode?'rgba(200,255,0,0.4)':'rgba(255,255,255,0.07)'),borderRadius:20,color:analysisMode===mode?'#c8ff00':'rgba(255,255,255,0.4)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.75rem',fontWeight:analysisMode===mode?700:400,transition:'all .15s'}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Week arrow nav */}
            {analysisMode==='week' && (() => {
              const selDate = new Date(selectedWeek + 'T12:00:00')
              const dow = selDate.getDay()
              selDate.setDate(selDate.getDate() + (dow===0?-6:1-dow))
              const wsStr = selDate.toISOString().split('T')[0]
              const weDate = new Date(selDate); weDate.setDate(selDate.getDate()+6)
              const fmt = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'})
              const label = fmt(selDate) + ' - ' + fmt(weDate)
              const today = new Date()
              const todayMon = new Date(today); todayMon.setDate(today.getDate()+(today.getDay()===0?-6:1-today.getDay()))
              const isCurrent = wsStr===todayMon.toISOString().split('T')[0]
              const goBack = () => {const p=new Date(selDate);p.setDate(p.getDate()-7);const ws=p.toISOString().split('T')[0];setSelectedWeek(ws);setAnalysisReport(null);setTimeout(()=>loadStoredReport('week',ws),50)}
              const goFwd = () => {if(!isCurrent){const n=new Date(selDate);n.setDate(n.getDate()+7);const ws=n.toISOString().split('T')[0];setSelectedWeek(ws);setAnalysisReport(null);setTimeout(()=>loadStoredReport('week',ws),50)}}
              return (
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
                  <button onClick={goBack} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'<'}</button>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'#e8e8f0'}}>{label}</div>
                    {isCurrent&&<div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.6)',fontWeight:700,letterSpacing:1.5,marginTop:2}}>CURRENT WEEK</div>}
                  </div>
                  <button onClick={goFwd} disabled={isCurrent} style={{background:'none',border:'none',color:isCurrent?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.4)',cursor:isCurrent?'default':'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'>'}</button>
                </div>
              )
            })()}

            {/* Month arrow nav */}
            {analysisMode==='month' && (() => {
              const [y,m] = selectedMonth.split('-').map(Number)
              const label = new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})
              const now = new Date(); const isNow = y===now.getFullYear()&&m===now.getMonth()+1
              const prev = () => { const d=new Date(y,m-2,1); const ms=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); setSelectedMonth(ms); setAnalysisReport(null); setTimeout(()=>loadStoredReport('month',ms),50) }
              const next = () => { if(!isNow){const d=new Date(y,m,1);const ms=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');setSelectedMonth(ms);setAnalysisReport(null);setTimeout(()=>loadStoredReport('month',ms),50)} }
              return (
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
                  <button onClick={prev} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'<'}</button>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'#e8e8f0'}}>{label}</div>
                    {isNow&&<div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.6)',fontWeight:700,letterSpacing:1.5,marginTop:2}}>CURRENT MONTH</div>}
                  </div>
                  <button onClick={next} disabled={isNow} style={{background:'none',border:'none',color:isNow?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.4)',cursor:isNow?'default':'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'>'}</button>
                </div>
              )
            })()}

            {/* Quarter arrow nav */}
            {analysisMode==='quarter' && (() => {
              const [y,q] = selectedQuarter.split('-Q').map(Number)
              const now = new Date(); const cq=Math.floor(now.getMonth()/3)+1; const isNow=y===now.getFullYear()&&q===cq
              const label = 'Q'+q+' '+y
              const prev = () => { const nq=q===1?4:q-1; const ny=q===1?y-1:y; const qk=ny+'-Q'+nq; setSelectedQuarter(qk); setAnalysisReport(null); setTimeout(()=>loadStoredReport('quarter',qk),50) }
              const next = () => { if(!isNow){const nq=q===4?1:q+1;const ny=q===4?y+1:y;const qk=ny+'-Q'+nq;setSelectedQuarter(qk);setAnalysisReport(null);setTimeout(()=>loadStoredReport('quarter',qk),50)} }
              return (
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
                  <button onClick={prev} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'<'}</button>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'#e8e8f0'}}>{label}</div>
                    {isNow&&<div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.6)',fontWeight:700,letterSpacing:1.5,marginTop:2}}>CURRENT QUARTER</div>}
                  </div>
                  <button onClick={next} disabled={isNow} style={{background:'none',border:'none',color:isNow?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.4)',cursor:isNow?'default':'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'>'}</button>
                </div>
              )
            })()}

            {/* Half Year arrow nav */}
            {analysisMode==='halfyear' && (() => {
              const [y,h] = selectedHalf.split('-H').map(Number)
              const now = new Date(); const ch=now.getMonth()<6?1:2; const isNow=y===now.getFullYear()&&h===ch
              const label = (h===1?'Jan - Jun ':'Jul - Dec ')+y
              const prev = () => { const nh=h===1?2:1;const ny=h===1?y-1:y; const hk=ny+'-H'+nh; setSelectedHalf(hk); setAnalysisReport(null); setTimeout(()=>loadStoredReport('halfyear',hk),50) }
              const next = () => { if(!isNow){const nh=h===1?2:1;const ny=h===2?y+1:y;const hk=ny+'-H'+nh;setSelectedHalf(hk);setAnalysisReport(null);setTimeout(()=>loadStoredReport('halfyear',hk),50)} }
              return (
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
                  <button onClick={prev} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'<'}</button>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'#e8e8f0'}}>{label}</div>
                    {isNow&&<div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.6)',fontWeight:700,letterSpacing:1.5,marginTop:2}}>CURRENT PERIOD</div>}
                  </div>
                  <button onClick={next} disabled={isNow} style={{background:'none',border:'none',color:isNow?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.4)',cursor:isNow?'default':'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'>'}</button>
                </div>
              )
            })()}

            {/* Year arrow nav */}
            {analysisMode==='year' && (() => {
              const now = new Date(); const isNow=selectedYear===now.getFullYear()
              return (
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
                  <button onClick={()=>{const ny=selectedYear-1;setSelectedYear(ny);setAnalysisReport(null);setTimeout(()=>loadStoredReport('year',String(ny)),50)}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'<'}</button>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'#e8e8f0'}}>{selectedYear}</div>
                    {isNow&&<div style={{fontSize:'.58rem',color:'rgba(200,255,0,0.6)',fontWeight:700,letterSpacing:1.5,marginTop:2}}>CURRENT YEAR</div>}
                  </div>
                  <button onClick={()=>{if(!isNow){const ny=selectedYear+1;setSelectedYear(ny);setAnalysisReport(null);setTimeout(()=>loadStoredReport('year',String(ny)),50)}}} disabled={isNow} style={{background:'none',border:'none',color:isNow?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.4)',cursor:isNow?'default':'pointer',padding:'4px 10px',fontSize:'1.3rem',lineHeight:1}}>{'>'}</button>
                </div>
              )
            })()}

            {/* Custom range */}
            {analysisMode==='custom' && (
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <div style={{flex:1}}><div style={{fontSize:'.6rem',color:'rgba(255,255,255,0.3)',marginBottom:4,letterSpacing:1}}>FROM</div>
                  <input type="date" value={customFrom} onChange={e=>{setCustomFrom(e.target.value);setAnalysisReport(null)}} style={{width:'100%',padding:'9px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:9,color:'#e8e8f0',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',outline:'none'}}/></div>
                <div style={{color:'rgba(255,255,255,0.2)',paddingTop:22,fontSize:'1.1rem'}}>→</div>
                <div style={{flex:1}}><div style={{fontSize:'.6rem',color:'rgba(255,255,255,0.3)',marginBottom:4,letterSpacing:1}}>TO</div>
                  <input type="date" value={customTo} onChange={e=>{setCustomTo(e.target.value);setAnalysisReport(null)}} style={{width:'100%',padding:'9px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:9,color:'#e8e8f0',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',outline:'none'}}/></div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <button onClick={()=>runAnalysis(true)}
                style={{flex:1,padding:'12px',background:'#c8ff00',border:'none',borderRadius:11,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.88rem',color:'#080808',cursor:'pointer'}}>
                {analysisReport ? '↺ Re-Analyse' : 'Analyse →'}
              </button>
              {!pushEnabled && typeof window !== 'undefined' && 'Notification' in window && (
                <button onClick={setupPush}
                  style={{padding:'12px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:11,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontSize:'1rem'}}>
                  🔔
                </button>
              )}
            </div>

            {/* Loading */}
            {analysisLoading && (
              <div style={{textAlign:'center',padding:'32px 0'}}>
                <div style={{width:36,height:36,border:'3px solid rgba(200,255,0,0.12)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 12px'}}/>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,color:'#c8ff00',fontSize:'.8rem',letterSpacing:1.5}}>GENERATING REPORT…</div>
                <div style={{fontSize:'.72rem',color:'rgba(255,255,255,0.3)',marginTop:6}}>This may take 10-20 seconds</div>
              </div>
            )}

            {/* Full Report */}
            {analysisReport && !analysisLoading && (() => {
              const r = analysisReport
              const range = getAnalysisRange()
              const rangeSessions = sessions.filter(s => {
                const d = s.session_date||s.created_at?.split('T')[0]||''
                return d>=range.from && d<=range.to
              })

              // ── compute all chart data ──────────────────────────────
              const totalSets = rangeSessions.reduce((a,s)=>a+(s.exercises?.reduce((b,e)=>b+(e.sets?.length||0),0)||0),0)
              const totalVol = Math.round(rangeSessions.reduce((a,s)=>a+(s.exercises?.reduce((b,e)=>b+(e.sets?.reduce((c,st)=>c+(st.weight_kg||0)*(st.reps||0),0)||0),0)||0),0))
              const totalReps = rangeSessions.reduce((a,s)=>a+(s.exercises?.reduce((b,e)=>b+(e.sets?.reduce((c2,st)=>c2+(st.reps||0),0)||0),0)||0),0)

              // Sessions per day of week
              const dowCount = [0,0,0,0,0,0,0]
              const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
              rangeSessions.forEach(s => {
                const d = new Date((s.session_date||s.created_at?.split('T')[0])+'T12:00:00')
                dowCount[(d.getDay()+6)%7]++
              })
              const dowData = DOW.map((n,i) => ({day:n, sessions:dowCount[i]}))

              // Volume over time
              const volByDate = {}
              rangeSessions.forEach(s => {
                const d = s.session_date||s.created_at?.split('T')[0]||''; if(!d)return
                const v = s.exercises?.reduce((a,e)=>a+(e.sets?.reduce((b,st)=>b+(st.weight_kg||0)*(st.reps||0),0)||0),0)||0
                volByDate[d] = (volByDate[d]||0)+v
              })
              const volData = Object.entries(volByDate).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,vol])=>({
                date: new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),
                vol: Math.round(vol)
              }))

              // Muscle volume breakdown
              const muscleVol = {}; const muscleSets = {}
              rangeSessions.forEach(s=>s.exercises?.forEach(ex=>{
                const m = ex.muscle||'Other'
                const v = ex.sets?.reduce((a,st)=>a+(st.weight_kg||0)*(st.reps||0),0)||0
                muscleVol[m] = (muscleVol[m]||0)+v
                muscleSets[m] = (muscleSets[m]||0)+(ex.sets?.length||0)
              }))
              const muscleChart = Object.entries(muscleVol).sort((a,b)=>b[1]-a[1]).slice(0,8)
                .map(([m,v])=>({muscle:m, vol:Math.round(v), sets:muscleSets[m]||0, color:mc(m)}))
              const maxMuscleVol = muscleChart[0]?.vol||1

              // Radar chart data for muscle balance
              const TOP_GROUPS = ['Chest','Back','Shoulders','Arms','Legs','Core']
              const radarData = TOP_GROUPS.map(g => {
                const subs = MUSCLE_TREE[g]?.subs||[]
                const vol = Object.entries(muscleVol).filter(([m])=>m===g||subs.includes(m)).reduce((a,[,v])=>a+v,0)
                return {subject:g, vol:Math.round(vol/1000*10)/10, fullMark:Math.round(maxMuscleVol/1000*10)/10}
              })

              // Score ring helper
              const ScoreRing = ({score, label, color, size=72}) => {
                const pct = (score||0)/10
                const r = (size-10)/2; const circ = 2*Math.PI*r
                const dash = pct*circ; const gap = circ-dash
                return (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                    <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}/>
                      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
                        strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
                        style={{transition:'stroke-dasharray .8s ease',filter:`drop-shadow(0 0 4px ${color}88)`}}/>
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                        style={{transform:'rotate(90deg)',transformOrigin:'50% 50%',fill:color,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:size/4+'px'}}>
                        {score||'--'}
                      </text>
                    </svg>
                    <div style={{fontSize:'.58rem',fontWeight:700,letterSpacing:1.5,color:'rgba(255,255,255,0.35)'}}>{label}</div>
                  </div>
                )
              }

              const Section = ({title, color, children}) => (
                <div style={{marginBottom:16}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <div style={{width:3,height:16,background:color,borderRadius:2,flexShrink:0}}/>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.8rem',letterSpacing:1.5,color}}>{title}</div>
                  </div>
                  {children}
                </div>
              )

              const InsightRow = ({icon, text, color='rgba(255,255,255,0.5)'}) => (
                <div style={{display:'flex',gap:8,padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontSize:'.9rem',flexShrink:0,marginTop:1}}>{icon}</span>
                  <span style={{fontSize:'.78rem',color,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>{text}</span>
                </div>
              )

              return (
                <div style={{paddingBottom:8}}>

                  {/* ── META ── */}
                  {analysisMeta && <div style={{fontSize:'.62rem',color:'rgba(255,255,255,0.2)',marginBottom:14,textAlign:'right',fontFamily:"'DM Sans',sans-serif"}}>{analysisMeta.cached?'Stored':'Generated just now'} · {range.label}</div>}

                  {/* ── SCORE RINGS ── */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'16px 10px',marginBottom:16}}>
                    <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.3)',textAlign:'center',marginBottom:14}}>PERFORMANCE SCORES</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,justifyItems:'center'}}>
                      <ScoreRing score={r.overall_score} label="OVERALL" color="#c8ff00"/>
                      <ScoreRing score={r.training_score} label="TRAINING" color="#3b82f6"/>
                      <ScoreRing score={r.nutrition_score} label="NUTRITION" color="#4ade80"/>
                      <ScoreRing score={r.consistency_score} label="CONSIST." color="#a855f7"/>
                    </div>
                  </div>

                  {/* ── SUMMARY BANNER ── */}
                  <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.02)',borderRadius:11,borderLeft:'3px solid #c8ff00',marginBottom:16,fontSize:'.82rem',color:'rgba(255,255,255,0.65)',lineHeight:1.75}}>{r.summary}</div>

                  {/* ── QUICK STATS STRIP ── */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:16}}>
                    {[[rangeSessions.length,'Sessions','#c8ff00'],[totalSets,'Sets','#3b82f6'],[totalVol>999?Math.round(totalVol/100)/10+'K':totalVol+'','Vol kg','#4ade80'],[totalReps>999?Math.round(totalReps/100)/10+'K':totalReps+'','Reps','#f97316']].map(([v,l,col])=>(
                      <div key={l} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'10px 6px',textAlign:'center'}}>
                        <div className="bb" style={{fontSize:'1.05rem',color:col,lineHeight:1.1}}>{v}</div>
                        <div style={{fontSize:'.52rem',color:'#555',letterSpacing:1,marginTop:4}}>{l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── TRAINING FREQUENCY (days of week) ── */}
                  {rangeSessions.length>0 && (
                    <Section title="TRAINING FREQUENCY" color="#3b82f6">
                      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:11,padding:'12px 10px'}}>
                        <ResponsiveContainer width="100%" height={90}>
                          <BarChart data={dowData} barSize={20} margin={{top:0,right:4,bottom:0,left:-30}}>
                            <XAxis dataKey="day" tick={{fill:'#555',fontSize:10}} tickLine={false} axisLine={false}/>
                            <YAxis tick={false} tickLine={false} axisLine={false}/>
                            <Tooltip contentStyle={{background:'#0c0c14',border:'1px solid #222',borderRadius:8,color:'#e8e8f0',fontSize:'.75rem'}} formatter={v=>[v,'Sessions']}/>
                            <Bar dataKey="sessions" fill="#3b82f6" radius={[4,4,0,0]} opacity={0.85}/>
                          </BarChart>
                        </ResponsiveContainer>
                        <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:4,fontSize:'.65rem',color:'rgba(255,255,255,0.25)',fontFamily:"'DM Sans',sans-serif"}}>
                          {['Most active day: '+DOW[dowCount.indexOf(Math.max(...dowCount))], 'Rest days: '+(7-dowCount.filter(x=>x>0).length)].map(t=><span key={t}>{t}</span>)}
                        </div>
                      </div>
                    </Section>
                  )}

                  {/* ── VOLUME TREND ── */}
                  {volData.length>1 && (
                    <Section title="VOLUME TREND" color="#c8ff00">
                      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:11,padding:'12px 10px'}}>
                        <ResponsiveContainer width="100%" height={110}>
                          <AreaChart data={volData} margin={{top:4,right:4,bottom:0,left:-28}}>
                            <defs>
                              <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#c8ff00" stopOpacity={0.25}/>
                                <stop offset="95%" stopColor="#c8ff00" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#111"/>
                            <XAxis dataKey="date" tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                            <YAxis tick={{fill:'#444',fontSize:9}} tickLine={false} axisLine={false}/>
                            <Tooltip contentStyle={{background:'#0c0c14',border:'1px solid #222',borderRadius:8,color:'#e8e8f0',fontSize:'.75rem'}} formatter={v=>[v+' kg','Volume']}/>
                            <Area type="monotone" dataKey="vol" stroke="#c8ff00" strokeWidth={2} fill="url(#volGrad)" dot={false}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </Section>
                  )}

                  {/* ── MUSCLE VOLUME BARS ── */}
                  {muscleChart.length>0 && (
                    <Section title="MUSCLE BREAKDOWN" color="#f97316">
                      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:11,padding:'12px 14px'}}>
                        {muscleChart.map(({muscle:m,vol,sets,color:col})=>(
                          <div key={m} style={{marginBottom:10}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <div style={{width:6,height:6,borderRadius:'50%',background:col,flexShrink:0}}/>
                                <span style={{fontSize:'.78rem',color:'rgba(255,255,255,0.6)',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>{m}</span>
                              </div>
                              <div style={{display:'flex',gap:10,fontSize:'.65rem',color:'rgba(255,255,255,0.3)',fontFamily:"'DM Sans',sans-serif"}}>
                                <span>{sets} sets</span>
                                <span style={{color:col,fontWeight:700}}>{vol>999?Math.round(vol/100)/10+'K':vol} kg</span>
                              </div>
                            </div>
                            <div style={{height:6,background:'rgba(255,255,255,0.05)',borderRadius:3,overflow:'hidden'}}>
                              <div style={{height:'100%',width:(vol/maxMuscleVol*100)+'%',background:`linear-gradient(90deg,${col}88,${col})`,borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── MUSCLE BALANCE RADAR ── */}
                  {radarData.some(d=>d.vol>0) && (
                    <Section title="MUSCLE BALANCE" color="#a855f7">
                      <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:11,padding:'8px 0'}}>
                        <ResponsiveContainer width="100%" height={200}>
                          <RadarChart data={radarData} margin={{top:10,right:20,bottom:10,left:20}}>
                            <PolarGrid stroke="rgba(255,255,255,0.07)"/>
                            <PolarAngleAxis dataKey="subject" tick={{fill:'rgba(255,255,255,0.4)',fontSize:11,fontFamily:"'DM Sans',sans-serif"}}/>
                            <Radar name="Volume" dataKey="vol" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} strokeWidth={2}/>
                            <Tooltip contentStyle={{background:'#0c0c14',border:'1px solid #222',borderRadius:8,color:'#e8e8f0',fontSize:'.75rem'}} formatter={v=>[v+'K kg','Volume']}/>
                          </RadarChart>
                        </ResponsiveContainer>
                        {r.training_analysis?.muscle_balance&&<div style={{padding:'0 14px 10px',fontSize:'.75rem',color:'rgba(255,255,255,0.4)',lineHeight:1.6,fontStyle:'italic',textAlign:'center'}}>{r.training_analysis.muscle_balance}</div>}
                      </div>
                    </Section>
                  )}

                  {/* ── TRAINING INSIGHTS ── */}
                  {r.training_analysis && (
                    <Section title="TRAINING INSIGHTS" color="#3b82f6">
                      <div style={{background:'rgba(59,130,246,0.04)',border:'1px solid rgba(59,130,246,0.12)',borderRadius:11,padding:'10px 14px'}}>
                        {r.training_analysis.volume_assessment&&<InsightRow icon="📊" text={r.training_analysis.volume_assessment}/>}
                        {r.training_analysis.intensity_assessment&&<InsightRow icon="💪" text={r.training_analysis.intensity_assessment}/>}
                        {r.training_analysis.strengths?.map((s,i)=><InsightRow key={'s'+i} icon="✅" text={s} color="#4ade80"/>)}
                        {r.training_analysis.weaknesses?.map((s,i)=><InsightRow key={'w'+i} icon="⚠️" text={s} color="#f87171"/>)}
                        {r.training_analysis.recommendations?.map((s,i)=><InsightRow key={'r'+i} icon="→" text={s} color="#c8ff00"/>)}
                      </div>
                    </Section>
                  )}

                  {/* ── NUTRITION SECTION ── */}
                  {r.nutrition_analysis && (
                    <Section title="NUTRITION ANALYSIS" color="#4ade80">
                      <div style={{background:'rgba(74,222,128,0.04)',border:'1px solid rgba(74,222,128,0.12)',borderRadius:11,padding:'10px 14px'}}>
                        {r.nutrition_analysis.calorie_assessment&&<InsightRow icon="🔥" text={r.nutrition_analysis.calorie_assessment}/>}
                        {r.nutrition_analysis.protein_assessment&&<InsightRow icon="🥩" text={r.nutrition_analysis.protein_assessment}/>}
                        {r.nutrition_analysis.macro_balance&&<InsightRow icon="⚖️" text={r.nutrition_analysis.macro_balance}/>}
                        {r.nutrition_analysis.recommendations?.map((s,i)=><InsightRow key={i} icon="💡" text={s} color="#c8ff00"/>)}
                      </div>
                    </Section>
                  )}

                  {/* ── WEIGHT ── */}
                  {r.weight_analysis&&(
                    <Section title="BODY COMPOSITION" color="#a855f7">
                      <div style={{background:'rgba(168,85,247,0.04)',border:'1px solid rgba(168,85,247,0.12)',borderRadius:11,padding:'10px 14px'}}>
                        <InsightRow icon="⚖️" text={r.weight_analysis}/>
                      </div>
                    </Section>
                  )}

                  {/* ── NEXT PERIOD ── */}
                  {r.next_period_plan?.length>0&&(
                    <Section title="NEXT PERIOD FOCUS" color="#c8ff00">
                      <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {r.next_period_plan.map((f,i)=>(
                          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'rgba(200,255,0,0.04)',border:'1px solid rgba(200,255,0,0.1)',borderRadius:9}}>
                            <div style={{width:22,height:22,borderRadius:'50%',background:'rgba(200,255,0,0.12)',border:'1px solid rgba(200,255,0,0.25)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.65rem',color:'#c8ff00'}}>{i+1}</div>
                            <span style={{fontSize:'.78rem',color:'rgba(255,255,255,0.6)',fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>{f}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── EXERCISE RECOMMENDATIONS ── */}
                  {r.exercise_recommendations?.length>0&&(
                    <Section title="EXERCISE RECOMMENDATIONS" color="#f97316">
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {r.exercise_recommendations.map((f,i)=>(
                          <div key={i} style={{padding:'8px 12px',background:'rgba(249,115,22,0.04)',border:'1px solid rgba(249,115,22,0.1)',borderRadius:9,fontSize:'.78rem',color:'rgba(255,255,255,0.55)',fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>
                            🏋️ {f}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── RECOVERY ── */}
                  {r.recovery_tips?.length>0&&(
                    <Section title="RECOVERY" color="#4ade80">
                      <div style={{display:'flex',flexDirection:'column',gap:4}}>
                        {r.recovery_tips.map((f,i)=>(
                          <div key={i} style={{padding:'8px 12px',background:'rgba(74,222,128,0.03)',border:'1px solid rgba(74,222,128,0.1)',borderRadius:9,fontSize:'.78rem',color:'rgba(255,255,255,0.55)',fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>🔋 {f}</div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* ── MOTIVATION ── */}
                  {r.motivation&&(
                    <div style={{padding:'16px',background:'linear-gradient(135deg,rgba(200,255,0,0.06),rgba(200,255,0,0.02))',border:'1px solid rgba(200,255,0,0.15)',borderRadius:12,textAlign:'center',marginBottom:12}}>
                      <div style={{fontSize:'1.4rem',marginBottom:8}}>⚡</div>
                      <div style={{fontSize:'.85rem',color:'#c8ff00',fontStyle:'italic',lineHeight:1.7,fontFamily:"'DM Sans',sans-serif"}}>"{r.motivation}"</div>
                    </div>
                  )}

                  <button onClick={()=>runAnalysis(true)}
                    style={{width:'100%',padding:'11px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.78rem',fontWeight:600}}>
                    ↺ Re-Analyse
                  </button>
                </div>
              )
            })()}
          </div>
        )}


        {activeTab === 'history' && (
            <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div className="bb" style={{fontSize:'.75rem',color:'#555',letterSpacing:2}}>ALL SESSIONS</div>
                <div style={{display:'flex',gap:5}}>
                  <button onClick={()=>{setMoveExMode(v=>!v);setMoveExSrc(null);setMergeMode(false);setMergeSrc(null)}}
                    style={{padding:'5px 10px',background:moveExMode?'rgba(59,130,246,0.15)':'rgba(255,255,255,0.04)',border:'1px solid '+(moveExMode?'rgba(59,130,246,0.4)':'rgba(255,255,255,0.08)'),borderRadius:20,color:moveExMode?'#3b82f6':'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.68rem',fontWeight:700}}>
                    {moveExMode?'✕ Cancel':'Move Ex'}
                  </button>
                  <button onClick={()=>{setMergeMode(v=>!v);setMergeSrc(null);setMoveExMode(false);setMoveExSrc(null)}}
                    style={{padding:'5px 10px',background:mergeMode?'rgba(234,179,8,0.15)':'rgba(255,255,255,0.04)',border:'1px solid '+(mergeMode?'rgba(234,179,8,0.4)':'rgba(255,255,255,0.08)'),borderRadius:20,color:mergeMode?'#eab308':'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.68rem',fontWeight:700}}>
                    {mergeMode?'✕ Cancel':'Merge'}
                  </button>
                </div>
              </div>
              {moveExMode && (
                <div style={{background:'rgba(59,130,246,0.07)',border:'1px solid rgba(59,130,246,0.2)',borderRadius:11,padding:'10px 14px',marginBottom:10}}>
                  <div style={{fontSize:'.78rem',color:'#3b82f6',fontWeight:600,marginBottom:3}}>
                    {moveExSrc ? ('2. Tap the session to move "' + moveExSrc.name + '" into') : '1. Expand a session and tap an exercise to select it'}
                  </div>
                  <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)'}}>
                    {moveExSrc ? 'Tap any other session card to move the exercise there.' : 'The exercise will be moved out of its current session.'}
                  </div>
                  {moveExSrc && <button onClick={()=>setMoveExSrc(null)} style={{marginTop:5,padding:'3px 10px',background:'transparent',border:'1px solid rgba(59,130,246,0.3)',borderRadius:20,color:'rgba(59,130,246,0.6)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.68rem'}}>← Pick different exercise</button>}
                </div>
              )}
              {mergeMode && (
                <div style={{background:'rgba(234,179,8,0.07)',border:'1px solid rgba(234,179,8,0.2)',borderRadius:11,padding:'10px 14px',marginBottom:10}}>
                  <div style={{fontSize:'.78rem',color:'#eab308',fontWeight:600,marginBottom:3}}>
                    {mergeSrc ? '2. Tap the session to merge INTO' : '1. Tap the session to move exercises FROM'}
                  </div>
                  <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)'}}>
                    {mergeSrc ? 'All its exercises will be moved into the target session.' : 'Its exercises will be moved to another session you pick.'}
                  </div>
                </div>
              )}
              {sessions.map(s => {
                const isMergeSrc = mergeSrc === s.id
                const sVol = Math.round(s.exercises?.reduce((a,ex)=>a+(ex.sets?.reduce((b,set)=>b+set.weight_kg*set.reps,0)||0),0)||0)
                const sSets = s.exercises?.reduce((a,ex)=>a+(ex.sets?.length||0),0)||0
                const isOpen = openId === s.id

                return (
                  <div key={s.id} className="card"
                    style={{marginBottom:8,cursor:mergeMode?'pointer':'pointer',background:isMergeSrc?'rgba(234,179,8,0.05)':'',border:isMergeSrc?'1px solid rgba(234,179,8,0.4)':mergeMode?'1px solid rgba(234,179,8,0.12)':''}}
                    onClick={mergeMode ? () => {
                      if (!mergeSrc) setMergeSrc(s.id)
                      else if (mergeSrc !== s.id) { if(confirm('Merge these two sessions?')) mergeSession(mergeSrc, s.id) }
                    } : moveExMode && moveExSrc && s.id !== moveExSrc.fromSessionId ? () => {
                      if(confirm('Move "' + moveExSrc.name + '" into this session?')) moveExercise(moveExSrc.exerciseId, s.id)
                    } : ()=>setOpenId(isOpen?null:s.id)}>
                  {isMergeSrc && <div style={{padding:'4px 14px',marginBottom:6,fontSize:'.65rem',color:'#eab308',fontWeight:700,background:'rgba(234,179,8,0.1)',borderRadius:6}}>SOURCE - tap target session to merge into it</div>}
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        {editDate === s.id ? (
                          <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                            <input type="date" defaultValue={s.session_date||s.created_at?.split('T')[0]} max={todayStr()} id={`d-${s.id}`} style={{maxWidth:160,padding:'6px 10px',fontSize:'.82rem'}}/>
                            <button onClick={()=>saveDate(s.id,document.getElementById(`d-${s.id}`).value)} className="btn-sm" style={{color:'#c8ff00',borderColor:'#c8ff00'}}>Save</button>
                            <button onClick={()=>setEditDate(null)} className="btn-sm">✕</button>
                          </div>
                        ) : (
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                            <span style={{fontSize:'.9rem',fontWeight:600,color:'#ddd'}}>{fmtDate(s.session_date||s.created_at?.split('T')[0])}</span>
                            {(s.session_date||s.created_at?.split('T')[0])===todayStr() && <span style={{background:'rgba(232,255,71,.15)',color:'#c8ff00',fontSize:'.62rem',padding:'2px 7px',borderRadius:20,fontWeight:600}}>TODAY</span>}
                            <button onClick={e=>{e.stopPropagation();setEditDate(s.id)}} style={{background:'none',border:'none',color:'#3a3a3a',cursor:'pointer',fontSize:'.8rem',padding:0}}>✏️</button>
                          </div>
                        )}
                        <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}
                          onClick={e=>{e.stopPropagation();setEditMuscles({sessionId:s.id,muscles:[...(s.muscles_trained||[])]})}}>
                          {s.muscles_trained?.map(m=><span key={m} className="tag" style={{background:mc(m)+'22',color:mc(m),border:`1px solid ${mc(m)}44`,cursor:'pointer'}}>{m}</span>)}
                          <span style={{fontSize:'.62rem',color:'rgba(255,255,255,0.2)',cursor:'pointer',marginLeft:2}}>✏️</span>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
                        <div style={{textAlign:'center',cursor:'pointer'}} onClick={e=>{e.stopPropagation();
                      // Try to guess start/end from session_date + duration
                      const sessionDate = s.session_date||s.created_at?.split('T')[0]
                      const createdAt = s.created_at ? new Date(s.created_at) : null
                      const guessStart = createdAt ? createdAt.toTimeString().slice(0,5) : ''
                      const dur = s.duration_seconds||0
                      const endDate = createdAt && dur ? new Date(createdAt.getTime() + dur*1000) : null
                      const guessEnd = endDate ? endDate.toTimeString().slice(0,5) : ''
                      setEditDuration({sessionId:s.id,duration_seconds:dur,session_date:sessionDate,startTime:guessStart,endTime:guessEnd})}}>
                      <div className="bb" style={{color:'#a855f7',fontSize:'.95rem'}}>{s.duration_seconds>0?fmt(s.duration_seconds):'-'}</div>
                      <div style={{fontSize:'.58rem',color:'#555'}}>time ✏️</div>
                    </div>
                        <div style={{textAlign:'center'}}><div className="bb" style={{color:'#3b82f6',fontSize:'.95rem'}}>{sSets}</div><div style={{fontSize:'.58rem',color:'#555'}}>sets</div></div>
                        <div style={{textAlign:'center'}}><div className="bb" style={{color:'#c8ff00',fontSize:'.95rem'}}>{Math.round(sVol/1000*10)/10}k</div><div style={{fontSize:'.58rem',color:'#555'}}>kg</div></div>
                        <div style={{color:isOpen?'#e8ff47':'#3a3a3a',fontSize:'.8rem',transition:'transform .2s',transform:isOpen?'rotate(180deg)':'none',userSelect:'none'}}>▼</div>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{marginTop:16,borderTop:'1px solid #1a1a1a',paddingTop:16}} onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-y" style={{marginBottom:14,fontSize:'.9rem'}}
                          onClick={()=>{setContSession(s);setContMode(null);setContExId(null);setNewSet({w:'',r:''});setNewEx({name:'',muscle:'Chest',sets:[{w:'',r:''}]});setSuggested([]);setContImgB64(null);setContImgPreview(null)}}>
                          + CONTINUE THIS SESSION
                        </button>

                        {/* Warmup & Stretch summary - expandable */}
                        {(s.warmup_duration_seconds > 0 || s.warmup_skipped || s.stretch_duration_seconds > 0 || s.stretch_skipped) && (() => {
                          const wKey = 'warmup_'+s.id, sKey = 'stretch_'+s.id
                          const wExs = s.warmup_exercises || [], sExs = s.stretch_exercises || []
                          const wOpen = openWS === wKey, sOpen = openWS === sKey
                          return (
                          <div style={{marginBottom:14}}>
                            <div style={{display:'flex',gap:8}}>
                              <div onClick={()=>wExs.length&&setOpenWS(wOpen?null:wKey)}
                                style={{flex:1,background:'rgba(249,115,22,0.06)',border:'1px solid rgba(249,115,22,0.15)',borderRadius:10,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,cursor:wExs.length?'pointer':'default'}}>
                                <span style={{fontSize:'1.1rem'}}>🔥</span>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:'.58rem',color:'rgba(249,115,22,0.6)',letterSpacing:1,fontWeight:700}}>WARMUP</div>
                                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.92rem',color:s.warmup_skipped?'#666':'#f97316'}}>
                                    {s.warmup_skipped ? 'Skipped' : s.warmup_duration_seconds > 0 ? fmt(s.warmup_duration_seconds) : '-'}
                                  </div>
                                </div>
                                {wExs.length>0 && <span style={{color:'rgba(249,115,22,0.5)',fontSize:'.7rem',transition:'transform .2s',transform:wOpen?'rotate(180deg)':'none'}}>▼</span>}
                              </div>
                              <div onClick={()=>sExs.length&&setOpenWS(sOpen?null:sKey)}
                                style={{flex:1,background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:10,padding:'10px 12px',display:'flex',alignItems:'center',gap:10,cursor:sExs.length?'pointer':'default'}}>
                                <span style={{fontSize:'1.1rem'}}>🧘</span>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:'.58rem',color:'rgba(74,222,128,0.6)',letterSpacing:1,fontWeight:700}}>STRETCH</div>
                                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.92rem',color:s.stretch_skipped?'#666':'#4ade80'}}>
                                    {s.stretch_skipped ? 'Skipped' : s.stretch_duration_seconds > 0 ? fmt(s.stretch_duration_seconds) : '-'}
                                  </div>
                                </div>
                                {sExs.length>0 && <span style={{color:'rgba(74,222,128,0.5)',fontSize:'.7rem',transition:'transform .2s',transform:sOpen?'rotate(180deg)':'none'}}>▼</span>}
                              </div>
                            </div>
                            {wOpen && wExs.length>0 && (
                              <div style={{marginTop:6,background:'rgba(249,115,22,0.04)',border:'1px solid rgba(249,115,22,0.12)',borderRadius:10,padding:'10px 14px'}}>
                                <div style={{fontSize:'.58rem',color:'rgba(249,115,22,0.5)',letterSpacing:1,fontWeight:700,marginBottom:6}}>WARMUP EXERCISES DONE</div>
                                {wExs.map((ex,i)=>(
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:'.8rem',color:'rgba(255,255,255,0.65)'}}>
                                    <span style={{color:'#f97316'}}>✓</span> {ex}
                                  </div>
                                ))}
                              </div>
                            )}
                            {sOpen && sExs.length>0 && (
                              <div style={{marginTop:6,background:'rgba(74,222,128,0.04)',border:'1px solid rgba(74,222,128,0.12)',borderRadius:10,padding:'10px 14px'}}>
                                <div style={{fontSize:'.58rem',color:'rgba(74,222,128,0.5)',letterSpacing:1,fontWeight:700,marginBottom:6}}>STRETCH EXERCISES DONE</div>
                                {sExs.map((ex,i)=>(
                                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:'.8rem',color:'rgba(255,255,255,0.65)'}}>
                                    <span style={{color:'#4ade80'}}>✓</span> {ex}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          )
                        })()}

                        {s.image_url && (
                          <div style={{marginBottom:14}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                              <span style={{color:'#555',fontSize:'.72rem'}}>Session photo</span>
                              <div style={{display:'flex',gap:6}}>
                                <button onClick={()=>setHiddenImages(p=>({...p,['sess_'+s.id]:!p['sess_'+s.id]}))}
                                  style={{background:'none',border:'1px solid #2a2a2a',borderRadius:6,color:'#888',fontSize:'.72rem',padding:'3px 9px',cursor:'pointer'}}>
                                  {hiddenImages['sess_'+s.id] ? '👁 Show' : '🙈 Hide'}
                                </button>
                                <button onClick={()=>deletePhoto(s.id)} style={{background:'none',border:'1px solid #2a1a1a',borderRadius:6,color:'#ef4444',fontSize:'.72rem',padding:'3px 9px',cursor:'pointer'}}>🗑</button>
                              </div>
                            </div>
                            {!hiddenImages['sess_'+s.id] && (
                              <img src={s.image_url} alt="" style={{width:'100%',borderRadius:10,maxHeight:200,objectFit:'cover'}}/>
                            )}
                          </div>
                        )}

                        {/* AI Session Report */}
                        {!s.ai_report && s.exercises?.length > 0 && (
                          <button onClick={async(e)=>{e.stopPropagation()
                            const exs=s.exercises?.map(ex=>({name:ex.name,muscle:ex.muscle,sets:ex.sets?.map(set=>({weight:set.weight_kg,reps:set.reps}))||[]}))
                            try{
                              const r=await fetch('/api/session-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s.id,userId:user.id,muscles:s.muscles_trained||[],duration:s.duration_seconds||0,exercises:exs||[]})})
                              const d=await r.json()
                              if(d.report){await reload(user.id)}
                            }catch(e){}
                          }}
                            style={{width:'100%',padding:'10px',background:'rgba(200,255,0,0.06)',border:'1px solid rgba(200,255,0,0.15)',borderRadius:10,color:'#c8ff00',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.82rem',marginBottom:10}}>
                            ✨ Generate AI Session Report
                          </button>
                        )}
                        {s.ai_report && (
                          <div style={{background:'rgba(200,255,0,0.05)',border:'1px solid rgba(200,255,0,0.15)',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                              <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'rgba(200,255,0,0.6)'}}>AI SESSION REPORT</div>
                              <button onClick={e=>{e.stopPropagation();setFullReport(s.ai_report)}}
                                style={{background:'rgba(200,255,0,0.12)',border:'1px solid rgba(200,255,0,0.25)',borderRadius:7,padding:'4px 10px',color:'#c8ff00',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.7rem',fontWeight:700}}>
                                Full Report →
                              </button>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:8}}>
                              {[['Rating',s.ai_report.overall_rating+'/10','#c8ff00'],['Intensity',s.ai_report.intensity_score+'/10','#ef4444'],['Volume',s.ai_report.volume_score+'/10','#3b82f6'],['Balance',s.ai_report.balance_score+'/10','#22c55e']].map(([l,v,col])=>(
                                <div key={l} style={{textAlign:'center',background:'rgba(0,0,0,0.3)',borderRadius:8,padding:'7px 4px'}}>
                                  <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:col,lineHeight:1}}>{v}</div>
                                  <div style={{fontSize:'.55rem',color:'rgba(255,255,255,0.3)',letterSpacing:1,marginTop:3}}>{l.toUpperCase()}</div>
                                </div>
                              ))}
                            </div>
                            {s.ai_report.summary&&<div style={{fontSize:'.78rem',color:'rgba(255,255,255,0.55)',lineHeight:1.5}}>{s.ai_report.summary}</div>}
                          </div>
                        )}

                        {s.exercises?.map(ex=>(
                          <div key={ex.id} style={{marginBottom:14}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:7,flexWrap:'wrap'}}>
                              <span className="tag" style={{background:mc(ex.muscle)+'22',color:mc(ex.muscle),border:`1px solid ${mc(ex.muscle)}44`,cursor:'pointer'}} onClick={()=>setEditExercise({id:ex.id,name:ex.name,muscle:ex.muscle,duration_seconds:ex.sets?.reduce((a,s)=>a+(s.duration_seconds||0),0)||ex.duration_seconds||0})}>{ex.muscle}</span>
                              <span className="bb"
                                style={{fontSize:'.95rem',flex:1,cursor:'pointer',color:moveExSrc?.exerciseId===ex.id?'#3b82f6':'inherit',background:moveExSrc?.exerciseId===ex.id?'rgba(59,130,246,0.1)':'transparent',borderRadius:4,padding:'0 3px'}}
                                onClick={()=>{
                                  if (moveExMode && !moveExSrc) {
                                    setMoveExSrc({exerciseId:ex.id, name:ex.name, fromSessionId:s.id})
                                  } else if (!moveExMode) {
                                    setEditExercise({id:ex.id,name:ex.name,muscle:ex.muscle,duration_seconds:ex.sets?.reduce((a,s)=>a+(s.duration_seconds||0),0)||ex.duration_seconds||0})
                                  }
                                }}>
                                {moveExSrc?.exerciseId===ex.id && '📌 '}{ex.name}
                              </span>
                              {(() => {
                                const activeTotal = ex.sets?.reduce((a,s)=>a+(s.duration_seconds||0),0)||0
                                const totalInterval = ex.sets?.reduce((a,s)=>a+(s.total_duration_seconds||s.duration_seconds||0),0)||0
                                if (!activeTotal && !totalInterval) return null
                                return (
                                  <span style={{fontSize:'.68rem',color:'#555',display:'flex',gap:6}}>
                                    {activeTotal>0 && <span style={{color:'rgba(200,255,0,0.5)'}}>rep: {fmt(activeTotal)}</span>}
                                    {totalInterval>0 && totalInterval!==activeTotal && <span>total: {fmt(totalInterval)}</span>}
                                  </span>
                                )
                              })()}
                              <button onClick={()=>setEditExercise({id:ex.id,name:ex.name,muscle:ex.muscle,duration_seconds:ex.duration_seconds||0})} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.82rem',padding:'2px 4px'}} onClick={()=>setEditExercise({id:ex.id,name:ex.name,muscle:ex.muscle,duration_seconds:ex.sets?.reduce((a,s)=>a+(s.duration_seconds||0),0)||ex.duration_seconds||0})}>✏️</button>
                              <button onClick={()=>deleteExercise(ex.id)} style={{background:'none',border:'none',color:'#3a1a1a',cursor:'pointer',fontSize:'.82rem',padding:'2px 4px'}}>🗑</button>
                            </div>
                            {ex.sets?.map((set,i)=>(
                              <div key={set.id} className="setrow">
                                <span className="bb" style={{color:'#e8ff47',fontSize:'.82rem',minWidth:46}}>SET {i+1}</span>
                                {editSet?.id===set.id ? (
                                  <>
                                    <input type="number" value={editSet.weight_kg} onChange={e=>setEditSet(x=>({...x,weight_kg:e.target.value}))} style={{width:64,padding:'4px 8px',fontSize:'.85rem'}}/>
                                    <span style={{color:'#666',fontSize:'.72rem'}}>kg ×</span>
                                    <input type="number" value={editSet.reps} onChange={e=>setEditSet(x=>({...x,reps:e.target.value}))} style={{width:54,padding:'4px 8px',fontSize:'.85rem'}}/>
                                    <span style={{color:'#666',fontSize:'.72rem'}}>reps</span>
                                    <button onClick={patchSet} style={{marginLeft:'auto',background:'#e8ff47',border:'none',borderRadius:5,padding:'4px 12px',fontSize:'.75rem',cursor:'pointer',color:'#080808',fontWeight:700}}>Save</button>
                                    <button onClick={()=>setEditSet(null)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.9rem'}}>✕</button>
                                  </>
                                ) : (
                                  <>
                                    <span style={{fontSize:'.88rem',flex:1,color:'#ddd'}}>{set.weight_kg} kg × {set.reps} reps</span>
                                    <span style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:1}}>
                                      {set.duration_seconds>0 && <span style={{color:'#c8ff00',opacity:.6,fontSize:'.65rem'}}>rep: {fmt(set.duration_seconds)}</span>}
                                      {(set.total_duration_seconds||0)>0 && <span style={{color:'#444',fontSize:'.65rem'}}>total: {fmt(set.total_duration_seconds)}</span>}
                                    </span>
                                    <button onClick={()=>setEditSet({...set})} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'.88rem'}}>✏️</button>
                                    <button onClick={()=>deleteSet(set.id)} style={{background:'none',border:'none',color:'#2a2a2a',cursor:'pointer',fontSize:'.88rem'}}>🗑</button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                        <button onClick={()=>deleteSession(s.id)} style={{display:'block',width:'100%',marginTop:10,padding:'11px',background:'transparent',border:'1px solid #2a1a1a',borderRadius:8,color:'#ef4444',fontSize:'.82rem',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                          Delete entire session
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ── EXERCISE EDIT MODAL ── */}
      {editExercise && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:300,display:'flex',alignItems:'flex-end',backdropFilter:'blur(8px)'}}>
          <div style={{background:'#0c0c12',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'20px 20px 0 0',width:'100%',padding:'20px 20px calc(24px + env(safe-area-inset-bottom))'}}>
            <div style={{width:36,height:4,background:'rgba(255,255,255,0.15)',borderRadius:2,margin:'0 auto 18px'}}/>
            <div className="bb" style={{fontSize:'1.2rem',marginBottom:16,letterSpacing:2}}>EDIT EXERCISE</div>
            <div style={{marginBottom:12}}>
              <div style={{color:'#666',fontSize:'.72rem',fontWeight:600,letterSpacing:1,marginBottom:6}}>EXERCISE NAME</div>
              <input type="text" value={editExercise.name} onChange={e=>setEditExercise(p=>({...p,name:e.target.value}))} style={{background:'#141414',border:'1px solid #2a2a2a',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'.95rem'}}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{color:'rgba(255,255,255,0.4)',fontSize:'.72rem',fontWeight:600,letterSpacing:1,marginBottom:6}}>MUSCLE (includes sub-muscles)</div>
              <select value={editExercise.muscle} onChange={e=>setEditExercise(p=>({...p,muscle:e.target.value}))} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'.88rem'}}>
                <optgroup label="── Main Groups ──" style={{color:'#888'}}>
                  {Object.keys(MUSCLE_TREE).map(g=><option key={g} value={g}>{g}</option>)}
                </optgroup>
                {Object.entries(MUSCLE_TREE).map(([g,{subs}])=>(
                  <optgroup key={g} label={'── '+g+' Sub-muscles ──'} style={{color:'#888'}}>
                    {subs.map(s=><option key={s} value={s}>{s}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{color:'#666',fontSize:'.72rem',fontWeight:600,letterSpacing:1,marginBottom:6}}>DURATION (seconds)</div>
              <input type="number" inputMode="numeric" value={editExercise.duration_seconds} onChange={e=>setEditExercise(p=>({...p,duration_seconds:parseInt(e.target.value)||0}))} style={{background:'#141414',border:'1px solid #2a2a2a',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'.95rem'}}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={patchExercise} style={{flex:2,padding:'14px',background:'#c8ff00',border:'none',borderRadius:12,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.95rem',color:'#080808',cursor:'pointer'}}>SAVE CHANGES</button>
              <button onClick={()=>setEditExercise(null)} style={{flex:1,padding:'14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION TIME EDIT MODAL ── */}
      {editDuration && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:300,display:'flex',alignItems:'flex-end',backdropFilter:'blur(8px)'}}>
          <div style={{background:'#0c0c12',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'20px 20px 0 0',width:'100%',padding:'20px 20px calc(24px + env(safe-area-inset-bottom))'}}>
            <div style={{width:36,height:4,background:'rgba(255,255,255,0.15)',borderRadius:2,margin:'0 auto 18px'}}/>
            <div className="bb" style={{fontSize:'1.2rem',marginBottom:6,letterSpacing:2}}>EDIT SESSION TIME</div>
            <div style={{color:'rgba(255,255,255,0.35)',fontSize:'.78rem',marginBottom:18,lineHeight:1.5}}>Set the date and exact start/finish time. Duration is calculated automatically.</div>

            {/* Date */}
            <div style={{marginBottom:14}}>
              <div style={{color:'rgba(255,255,255,0.4)',fontSize:'.68rem',fontWeight:700,letterSpacing:1.5,marginBottom:6}}>SESSION DATE</div>
              <input type="date" value={editDuration.session_date||''} max={new Date().toISOString().split('T')[0]}
                onChange={e=>setEditDuration(p=>({...p,session_date:e.target.value}))}
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'.95rem'}}/>
            </div>

            {/* Start + End time */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <div style={{color:'rgba(255,255,255,0.4)',fontSize:'.68rem',fontWeight:700,letterSpacing:1.5,marginBottom:6}}>STARTED AT</div>
                <input type="time" value={editDuration.startTime||''} onChange={e=>setEditDuration(p=>({...p,startTime:e.target.value}))}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'1rem',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700}}/>
              </div>
              <div>
                <div style={{color:'rgba(255,255,255,0.4)',fontSize:'.68rem',fontWeight:700,letterSpacing:1.5,marginBottom:6}}>FINISHED AT</div>
                <input type="time" value={editDuration.endTime||''} onChange={e=>setEditDuration(p=>({...p,endTime:e.target.value}))}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',color:'#f0f0f0',padding:'12px 14px',borderRadius:10,outline:'none',width:'100%',fontSize:'1rem',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700}}/>
              </div>
            </div>

            {/* Live duration preview */}
            {editDuration.startTime && editDuration.endTime && (() => {
              const date = editDuration.session_date || new Date().toISOString().split('T')[0]
              const diff = new Date(date+'T'+editDuration.endTime+':00') - new Date(date+'T'+editDuration.startTime+':00')
              const mins = Math.round(diff/60000)
              return mins > 0 ? (
                <div style={{background:'rgba(200,255,0,0.07)',border:'1px solid rgba(200,255,0,0.18)',borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:'rgba(200,255,0,0.7)',fontSize:'.78rem',fontWeight:600}}>Calculated duration</span>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,color:'#c8ff00',fontSize:'1.1rem'}}>{Math.floor(mins/60)>0?`${Math.floor(mins/60)}h `:''}{mins%60}min</span>
                </div>
              ) : mins < 0 ? (
                <div style={{color:'#f87171',fontSize:'.75rem',marginBottom:14}}>⚠ End time is before start time</div>
              ) : null
            })()}

            <div style={{display:'flex',gap:10}}>
              <button onClick={patchDuration}
                style={{flex:2,padding:'14px',background:'#c8ff00',border:'none',borderRadius:12,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.95rem',color:'#080808',cursor:'pointer'}}>
                SAVE
              </button>
              <button onClick={()=>setEditDuration(null)}
                style={{flex:1,padding:'14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MERGE LOADING ── */}
      {merging && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
          <div style={{width:40,height:40,border:'3px solid rgba(234,179,8,0.3)',borderTopColor:'#eab308',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
          <div style={{color:'#eab308',fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>Merging sessions…</div>
        </div>
      )}

      {merging && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
          <div style={{width:40,height:40,border:'3px solid rgba(234,179,8,0.3)',borderTopColor:'#eab308',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
          <div style={{color:'#eab308',fontWeight:700,fontFamily:"'Space Grotesk',sans-serif"}}>Merging sessions…</div>
        </div>
      )}
      {/* ── EDIT SESSION MUSCLES MODAL ── */}
      {editMuscles && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',zIndex:400,display:'flex',flexDirection:'column',overflowY:'auto'}}
          onClick={e=>{if(e.target===e.currentTarget){setEditMuscles(null);setExpandedGroup(null)}}}>
          <div style={{maxWidth:480,margin:'auto',width:'100%',padding:'24px 16px'}}>
            <div style={{background:'#0c0c14',borderRadius:20,border:'1px solid rgba(255,255,255,0.08)',overflow:'hidden'}}>
              <div style={{padding:'18px 20px 14px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1.1rem',marginBottom:4}}>Edit Session Muscles</div>
                <div style={{fontSize:'.75rem',color:'rgba(255,255,255,0.35)'}}>Tap a group to toggle. Tap the arrow to pick specific sub-muscles.</div>
              </div>
              <div style={{padding:'14px 16px',maxHeight:'60vh',overflowY:'auto'}}>
                {[
                  {id:'Chest',    color:'#ef4444'},
                  {id:'Back',     color:'#3b82f6'},
                  {id:'Shoulders',color:'#a855f7'},
                  {id:'Arms',     color:'#f97316'},
                  {id:'Legs',     color:'#22c55e'},
                  {id:'Core',     color:'#eab308'},
                  {id:'Cardio',   color:'#06b6d4'},
                ].map(m => {
                  const subs = MUSCLE_TREE[m.id]?.subs || []
                  const mList = editMuscles.muscles
                  const activeSubs = subs.filter(s => mList.includes(s))
                  const active = mList.includes(m.id) || activeSubs.length > 0
                  const isOpen = expandedGroup === m.id

                  const toggleGroup = () => {
                    if (!active) setEditMuscles(p=>({...p, muscles:[...p.muscles, m.id]}))
                    else setEditMuscles(p=>({...p, muscles:p.muscles.filter(x=>x!==m.id&&!subs.includes(x))}))
                  }
                  const toggleSub = (sub) => {
                    const on = mList.includes(sub)
                    if (on) setEditMuscles(p=>({...p, muscles:p.muscles.filter(x=>x!==sub&&x!==m.id)}))
                    else setEditMuscles(p=>({...p, muscles:[...p.muscles.filter(x=>x!==m.id), sub]}))
                  }

                  return (
                    <div key={m.id} style={{borderRadius:12,overflow:'hidden',border:'1px solid '+(active?m.color+'44':'rgba(255,255,255,0.07)'),background:active?m.color+'09':'rgba(255,255,255,0.02)',marginBottom:7,transition:'all .15s'}}>
                      <div style={{display:'flex',alignItems:'center'}}>
                        <div style={{width:3,alignSelf:'stretch',background:active?m.color:'transparent',flexShrink:0}}/>
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 12px',flex:1,cursor:'pointer',minWidth:0}} onClick={toggleGroup}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.9rem',color:active?m.color:'rgba(255,255,255,0.5)'}}>{m.id}</div>
                            <div style={{fontSize:'.62rem',color:active&&activeSubs.length?m.color+'99':'rgba(255,255,255,0.2)',marginTop:1}}>
                              {activeSubs.length ? activeSubs.join(' · ') : subs.slice(0,3).join(' · ')}
                            </div>
                          </div>
                          {active && (
                            <div style={{width:18,height:18,borderRadius:'50%',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              <svg width="9" height="9" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          )}
                        </div>
                        {subs.length > 0 && (
                          <button onClick={()=>setExpandedGroup(isOpen?null:m.id)}
                            style={{padding:'0 14px',alignSelf:'stretch',background:'none',border:'none',borderLeft:'1px solid '+(active?m.color+'25':'rgba(255,255,255,0.05)'),color:isOpen?m.color:'rgba(255,255,255,0.2)',cursor:'pointer',display:'flex',alignItems:'center'}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform .2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                        )}
                      </div>
                      {isOpen && subs.length > 0 && (
                        <div style={{padding:'6px 14px 12px',borderTop:'1px solid '+m.color+'18',background:'rgba(0,0,0,0.15)'}}>
                          <div style={{fontSize:'.58rem',fontWeight:700,letterSpacing:2,color:m.color+'50',marginBottom:8}}>SPECIFIC MUSCLES</div>
                          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                            {subs.map(sub => {
                              const sel = mList.includes(sub)
                              return (
                                <button key={sub} onClick={()=>toggleSub(sub)}
                                  style={{padding:'5px 12px',background:sel?m.color+'22':'rgba(255,255,255,0.04)',border:'1px solid '+(sel?m.color:'rgba(255,255,255,0.1)'),borderRadius:20,color:sel?m.color:'rgba(255,255,255,0.4)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.75rem',fontWeight:sel?700:400,transition:'all .12s'}}>
                                  {sub}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {editMuscles.muscles.length > 0 && (
                <div style={{padding:'0 16px 10px',display:'flex',flexWrap:'wrap',gap:5}}>
                  {editMuscles.muscles.map(m=>(
                    <span key={m} style={{background:mc(m)+'18',border:'1px solid '+mc(m)+'44',color:mc(m),padding:'3px 10px',borderRadius:20,fontSize:'.7rem',fontWeight:700}}>{m}</span>
                  ))}
                </div>
              )}
              <div style={{padding:'12px 16px 16px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:10}}>
                <button onClick={()=>{setEditMuscles(null);setExpandedGroup(null)}}
                  style={{flex:1,padding:'12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem'}}>
                  Cancel
                </button>
                <button
                  disabled={editMuscles.muscles.length===0}
                  onClick={async()=>{
                    await fetch('/api/sessions',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'muscles',id:editMuscles.sessionId,muscles:editMuscles.muscles})})
                    await reload(user.id)
                    setEditMuscles(null); setExpandedGroup(null)
                  }}
                  style={{flex:2,padding:'12px',background:editMuscles.muscles.length?'#c8ff00':'rgba(200,255,0,0.25)',border:'none',borderRadius:12,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.88rem',color:'#080808',cursor:editMuscles.muscles.length?'pointer':'not-allowed'}}>
                  Save Muscles
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL SESSION REPORT MODAL ── */}
      {fullReport && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:300,overflowY:'auto',backdropFilter:'blur(10px)'}}>
          <div style={{maxWidth:520,margin:'0 auto',padding:'20px 16px 80px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div className="bb" style={{fontSize:'1.4rem',color:'#c8ff00',letterSpacing:2}}>SESSION REPORT</div>
              <div style={{display:'flex',gap:8}}>
              <button onClick={async()=>{
                const s=sessions.find(x=>x.ai_report===fullReport)
                if(!s) return
                const exs=s.exercises?.map(ex=>({name:ex.name,muscle:ex.muscle,sets:ex.sets?.map(set=>({weight:set.weight_kg,reps:set.reps}))||[]}))
                setFullReport(null)
                try{
                  const r=await fetch('/api/session-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s.id,userId:user.id,muscles:s.muscles_trained||[],duration:s.duration_seconds||0,exercises:exs||[]})})
                  const d=await r.json()
                  if(d.report){await reload(user.id);const updated=sessions.find(x=>x.id===s.id);if(updated)setFullReport(updated.ai_report||d.report)}
                }catch(e){}
              }} className="btn-sm" style={{background:'rgba(200,255,0,0.1)',borderColor:'rgba(200,255,0,0.25)',color:'#c8ff00'}}>↺ Re-analyze</button>
              <button onClick={()=>setFullReport(null)} className="btn-sm">Close ✕</button>
            </div>
            </div>
            {/* Scores */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
              {[['Overall',fullReport.overall_rating,'#c8ff00'],['Intensity',fullReport.intensity_score,'#ef4444'],['Volume',fullReport.volume_score,'#3b82f6'],['Balance',fullReport.balance_score,'#22c55e']].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 8px'}}>
                  <div className="bb" style={{fontSize:'1.6rem',color:c,lineHeight:1}}>{v}<span style={{fontSize:'.8rem',opacity:.6}}>/10</span></div>
                  <div style={{fontSize:'.58rem',color:'rgba(255,255,255,0.3)',letterSpacing:1,marginTop:4}}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
            {/* Summary */}
            <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px',marginBottom:12,fontSize:'.88rem',color:'rgba(255,255,255,0.7)',lineHeight:1.6}}>{fullReport.summary}</div>
            {/* Muscle coverage */}
            {fullReport.muscle_coverage && (
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px',marginBottom:12}}>
                <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'rgba(255,255,255,0.3)',marginBottom:12}}>MUSCLE COVERAGE</div>
                {Object.entries(fullReport.muscle_coverage).map(([m,d])=>(
                  <div key={m} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'.82rem',fontWeight:600}}>{m}</span>
                      <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,color:d.coverage_score>=7?'#4ade80':d.coverage_score>=4?'#eab308':'#ef4444'}}>{d.coverage_score}/10</span>
                    </div>
                    <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:3}}><div style={{height:'100%',width:`${d.coverage_score*10}%`,background:d.coverage_score>=7?'#4ade80':d.coverage_score>=4?'#eab308':'#ef4444',borderRadius:3}}/></div>
                    {d.exercises_done?.length>0&&<div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)',marginTop:3}}>{d.exercises_done.join(' · ')}</div>}
                    {d.note&&<div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.35)',marginTop:1,fontStyle:'italic'}}>{d.note}</div>}
                  </div>
                ))}
              </div>
            )}
            {/* Went well + improve */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div style={{background:'rgba(74,222,128,0.05)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:12,padding:'12px'}}>
                <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'#4ade80',marginBottom:8}}>✓ WENT WELL</div>
                {fullReport.what_went_well?.map((s,i)=><div key={i} style={{fontSize:'.78rem',color:'rgba(255,255,255,0.6)',marginBottom:5,lineHeight:1.4}}>▸ {s}</div>)}
              </div>
              <div style={{background:'rgba(248,113,113,0.05)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:12,padding:'12px'}}>
                <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'#f87171',marginBottom:8}}>↑ IMPROVE</div>
                {fullReport.what_to_improve?.map((s,i)=><div key={i} style={{fontSize:'.78rem',color:'rgba(255,255,255,0.6)',marginBottom:5,lineHeight:1.4}}>▸ {s}</div>)}
              </div>
            </div>
            {fullReport.missing_exercises?.length>0&&fullReport.missing_exercises[0]&&(
              <div style={{background:'rgba(234,179,8,0.06)',border:'1px solid rgba(234,179,8,0.2)',borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'#eab308',marginBottom:8}}>⚠ CONSIDER NEXT TIME</div>
                {fullReport.missing_exercises.map((e,i)=><div key={i} style={{fontSize:'.82rem',color:'rgba(255,255,255,0.6)',marginBottom:4}}>▸ {e}</div>)}
              </div>
            )}
            {fullReport.next_session_tips?.length>0&&(
              <div style={{background:'rgba(129,140,248,0.06)',border:'1px solid rgba(129,140,248,0.18)',borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:'.62rem',fontWeight:700,letterSpacing:1.5,color:'#818cf8',marginBottom:8}}>💡 NEXT SESSION TIPS</div>
                {fullReport.next_session_tips.map((t,i)=><div key={i} style={{fontSize:'.82rem',color:'rgba(255,255,255,0.6)',marginBottom:4}}>▸ {t}</div>)}
              </div>
            )}
            {fullReport.estimated_calories>0&&(
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px',textAlign:'center'}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1.5rem',color:'#f97316'}}>{fullReport.estimated_calories}</div>
                <div style={{fontSize:'.65rem',color:'rgba(255,255,255,0.3)',letterSpacing:1,marginTop:3}}>ESTIMATED CALORIES BURNED</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTINUE SESSION MODAL ── */}
      {contSession && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.95)',zIndex:300,overflowY:'auto',padding:'20px 16px 60px',WebkitOverflowScrolling:'touch'}}>
          <div style={{maxWidth:500,margin:'0 auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <div className="bb" style={{fontSize:'1.5rem',color:'#e8ff47',letterSpacing:2}}>CONTINUE SESSION</div>
                <div style={{color:'#666',fontSize:'.8rem',marginTop:2}}>{fmtDate(contSession.session_date||contSession.created_at?.split('T')[0])}</div>
              </div>
              <button onClick={()=>setContSession(null)} className="btn-sm">Close</button>
            </div>

            {/* Existing exercises - tap to add set */}
            <div style={{color:'#aaa',fontSize:'.72rem',fontWeight:600,letterSpacing:1,marginBottom:10}}>TAP EXERCISE TO ADD A SET</div>
            {contSession.exercises?.map(ex=>(
              <div key={ex.id}>
                <div className="card-sm" style={{marginBottom:5,cursor:'pointer',transition:'all .15s',borderColor:contExId===ex.id?'#e8ff47':'#1e1e1e',background:contExId===ex.id?'#161616':'#111'}}
                  onClick={()=>{setContExId(contExId===ex.id?null:ex.id);setContMode(contExId===ex.id?null:'add_set')}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="tag" style={{background:mc(ex.muscle)+'22',color:mc(ex.muscle),border:`1px solid ${mc(ex.muscle)}44`,flexShrink:0}}>{ex.muscle}</span>
                    <span className="bb" style={{fontSize:'.95rem',flex:1,letterSpacing:1}}>{ex.name}</span>
                    <span style={{color:'#555',fontSize:'.8rem'}}>{ex.sets?.length||0} sets</span>
                    <span style={{color:contExId===ex.id?'#e8ff47':'#3a3a3a',fontSize:'1.1rem',fontWeight:700,transition:'transform .2s',transform:contExId===ex.id?'rotate(45deg)':'none'}}>+</span>
                  </div>
                </div>

                {contExId===ex.id && contMode==='add_set' && (
                  <div className="card-sm" style={{marginBottom:10,background:'#0d0d0d',borderColor:'#1e1e1e'}}>
                    {ex.sets?.length > 0 && (
                      <div style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid #1a1a1a'}}>
                        {ex.sets.map((s,i)=>(
                          <div key={s.id} style={{display:'flex',gap:10,color:'#555',fontSize:'.8rem',padding:'3px 0'}}>
                            <span style={{minWidth:42,color:'#3a3a3a'}}>Set {i+1}</span>
                            <span>{s.weight_kg} kg × {s.reps} reps</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{color:'#aaa',fontSize:'.72rem',fontWeight:600,marginBottom:8}}>ADD SET {(ex.sets?.length||0)+1}</div>
                    <div style={{display:'flex',gap:8,marginBottom:10}}>
                      <div style={{flex:1}}>
                        <div style={{color:'#777',fontSize:'.68rem',fontWeight:600,marginBottom:4}}>WEIGHT (kg)</div>
                        <input type="number" inputMode="decimal" placeholder={ex.sets?.length?String(ex.sets[ex.sets.length-1].weight_kg):'0'} value={newSet.w} onChange={e=>setNewSet(s=>({...s,w:e.target.value}))}/>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{color:'#777',fontSize:'.68rem',fontWeight:600,marginBottom:4}}>REPS</div>
                        <input type="number" inputMode="numeric" placeholder={ex.sets?.length?String(ex.sets[ex.sets.length-1].reps):'8'} value={newSet.r} onChange={e=>setNewSet(s=>({...s,r:e.target.value}))}/>
                      </div>
                    </div>
                    <button className="btn btn-y" onClick={addSetToEx} disabled={newSet.w===''||!newSet.r||saving}>{saving?'SAVING…':'+ ADD SET'}</button>
                  </div>
                )}
              </div>
            ))}

            <div style={{height:1,background:'#1e1e1e',margin:'16px 0'}}/>

            {/* Add new exercise */}
            <button className="btn btn-d" style={{marginBottom:8}} onClick={()=>setContMode(contMode==='add_exercise'?null:'add_exercise')}>
              {contMode==='add_exercise'?'▲ Cancel':'+ ADD NEW EXERCISE'}
            </button>

            {contMode==='add_exercise' && (
              <div className="card-sm" style={{marginBottom:10,background:'#0d0d0d'}}>
                {/* Image upload for exercise identification */}
                <div style={{color:'#aaa',fontSize:'.75rem',fontWeight:600,marginBottom:10}}>IDENTIFY WITH PHOTO OR TYPE NAME</div>

                {/* Mini image upload */}
                <div onClick={()=>contFileRef.current?.click()}
                  style={{border:`1px dashed ${contImgPreview?'#2a2a2a':'#222'}`,borderRadius:10,overflow:'hidden',marginBottom:8,cursor:'pointer',minHeight:contImgPreview?0:70,display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0a'}}>
                  {contImgPreview ? (
                    <div style={{position:'relative',width:'100%'}}>
                      <img src={contImgPreview} alt="" style={{width:'100%',maxHeight:140,objectFit:'cover',display:'block'}}/>
                      <button onClick={e=>{e.stopPropagation();setContImgB64(null);setContImgPreview(null)}} style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,.8)',border:'none',borderRadius:5,color:'#ef4444',padding:'4px 8px',cursor:'pointer',fontSize:'.72rem'}}>✕ Remove</button>
                    </div>
                  ) : (
                    <div style={{textAlign:'center',padding:'16px'}}>
                      <div style={{fontSize:'1.4rem',marginBottom:4}}>📷</div>
                      <div style={{color:'#555',fontSize:'.75rem'}}>Tap to add photo of machine</div>
                    </div>
                  )}
                </div>
                <input ref={contFileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadContImg(e.target.files[0])}/>

                {/* Text + Check */}
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <input type="text" placeholder="Type exercise name…" value={analyzeText} onChange={e=>{setAnalyzeText(e.target.value);setSuggested([])}} onKeyDown={e=>e.key==='Enter'&&validateExName()} style={{flex:1}}/>
                  <button onClick={validateExName} disabled={analyzing||(!analyzeText.trim()&&!contImgB64)}
                    style={{background:'#e8ff47',border:'none',borderRadius:8,padding:'0 14px',fontSize:'.82rem',cursor:'pointer',color:'#080808',fontWeight:700,whiteSpace:'nowrap',opacity:analyzing||(!analyzeText.trim()&&!contImgB64)?.35:1}}>
                    {analyzing?'…':'Check'}
                  </button>
                </div>

                {/* Suggestions from AI */}
                {suggested.length > 0 && (
                  <div style={{marginBottom:10}}>
                    <div style={{color:'#777',fontSize:'.7rem',fontWeight:600,marginBottom:6}}>AI SUGGESTIONS:</div>
                    {suggested.map((ex,i)=>(
                      <button key={i} onClick={()=>{setNewEx(p=>({...p,name:ex.canonical,muscle:normalizeMuscle(ex.primary_muscle||ex.muscle)}));setSuggested([])}}
                        style={{display:'block',width:'100%',textAlign:'left',background:i===0?'rgba(232,255,71,.08)':'#111',border:`1px solid ${i===0?'#e8ff47':'#222'}`,borderRadius:8,padding:'10px 14px',color:i===0?'#e8ff47':'#888',cursor:'pointer',marginBottom:5,fontFamily:'DM Sans,sans-serif',fontSize:'.88rem',transition:'all .15s'}}>
                        {i===0?'✓ ':''}{ex.canonical} <span style={{opacity:.5,fontSize:'.75rem'}}>· {ex.muscle}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Exercise name + muscle */}
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <div style={{flex:2}}>
                    <div style={{color:'#777',fontSize:'.68rem',fontWeight:600,marginBottom:4}}>EXERCISE NAME</div>
                    <input type="text" value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))} placeholder="Exercise name"/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:'#777',fontSize:'.68rem',fontWeight:600,marginBottom:4}}>MUSCLE</div>
                    <select value={newEx.muscle} onChange={e=>setNewEx(p=>({...p,muscle:e.target.value}))}>
                      {ALL_MUSCLES.map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Sets */}
                {newEx.sets.map((s,i)=>(
                  <div key={i} style={{display:'flex',gap:8,marginBottom:7,alignItems:'center'}}>
                    <span style={{color:'#555',fontSize:'.75rem',minWidth:38}}>Set {i+1}</span>
                    <input type="number" inputMode="decimal" placeholder="kg (0=BW)" value={s.w} onChange={e=>{const sets=[...newEx.sets];sets[i]={...sets[i],w:e.target.value};setNewEx(p=>({...p,sets}))}} style={{flex:1}}/>
                    <input type="number" inputMode="numeric" placeholder="reps" value={s.r} onChange={e=>{const sets=[...newEx.sets];sets[i]={...sets[i],r:e.target.value};setNewEx(p=>({...p,sets}))}} style={{flex:1}}/>
                    {i>0 && <button onClick={()=>setNewEx(p=>({...p,sets:p.sets.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'1rem',padding:'0 4px'}}>✕</button>}
                  </div>
                ))}
                <button onClick={()=>setNewEx(p=>({...p,sets:[...p.sets,{w:'',r:''}]}))} className="btn-sm" style={{marginBottom:12,fontSize:'.75rem'}}>+ Add set</button>
                <button className="btn btn-y" onClick={addExerciseToSession} disabled={!newEx.name.trim()||saving}>{saving?'SAVING…':'SAVE EXERCISE'}</button>
              </div>
            )}

            {/* Add muscle */}
            <button className="btn btn-d" style={{marginBottom:8}} onClick={()=>setContMode(contMode==='add_muscle'?null:'add_muscle')}>
              {contMode==='add_muscle'?'▲ Cancel':'+ ADD MUSCLE GROUP'}
            </button>
            {contMode==='add_muscle' && (
              <div style={{background:'#0d0d0d',borderRadius:14,padding:'12px',marginBottom:10,border:'1px solid #1a1a1a'}}>
                <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:1.5,color:'#555',marginBottom:10}}>SELECT MUSCLE OR SUB-MUSCLE</div>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {[
                    {id:'Chest',    color:'#ef4444', icon:'🫁'},
                    {id:'Back',     color:'#3b82f6', icon:'🔵'},
                    {id:'Shoulders',color:'#a855f7', icon:'💪'},
                    {id:'Arms',     color:'#f97316', icon:'💪'},
                    {id:'Legs',     color:'#22c55e', icon:'🦵'},
                    {id:'Core',     color:'#eab308', icon:'🔥'},
                    {id:'Cardio',   color:'#06b6d4', icon:'❤️'},
                  ].map(m => {
                    const subs = MUSCLE_TREE[m.id]?.subs || []
                    const trained = contSession.muscles_trained || []
                    const hasGroup = trained.includes(m.id)
                    const hasSomeSub = subs.some(s => trained.includes(s))
                    const alreadyAll = hasGroup || hasSomeSub
                    const isOpen = contExpandedGroup === m.id
                    return (
                      <div key={m.id} style={{borderRadius:10,overflow:'hidden',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
                        <div style={{display:'flex',alignItems:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',flex:1,cursor:alreadyAll?'default':'pointer',opacity:alreadyAll?0.4:1}}
                            onClick={()=>{ if (!alreadyAll) { addMuscleToSession(m.id); setContMode(null); setContExpandedGroup(null) } }}>
                            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:m.color}}>{m.icon} {m.id}</span>
                            {alreadyAll && <span style={{fontSize:'.6rem',color:'#444'}}>added</span>}
                          </div>
                          {subs.length > 0 && (
                            <button onClick={()=>setContExpandedGroup(isOpen?null:m.id)}
                              style={{padding:'0 13px',alignSelf:'stretch',background:'none',border:'none',borderLeft:'1px solid rgba(255,255,255,0.05)',color:isOpen?m.color:'#555',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:'.68rem',fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
                              subs
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform .15s'}}><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                          )}
                        </div>
                        {isOpen && (
                          <div style={{padding:'6px 12px 10px',borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(0,0,0,0.2)'}}>
                            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                              {subs.map(sub => {
                                const hasSub = trained.includes(sub)
                                return (
                                  <button key={sub} onClick={()=>{ if (!hasSub) { addMuscleToSession(sub); setContMode(null); setContExpandedGroup(null) } }}
                                    style={{padding:'4px 11px',background:hasSub?'rgba(255,255,255,0.02)':m.color+'18',border:'1px solid '+(hasSub?'rgba(255,255,255,0.05)':m.color+'44'),borderRadius:20,color:hasSub?'#444':m.color,cursor:hasSub?'default':'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.73rem',fontWeight:hasSub?400:600,opacity:hasSub?0.4:1}}>
                                    {hasSub?'✓ ':''}{sub}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <BottomTabs active="dashboard"/>
    </div>
  )
}

function ExPicker({ deep, mc, group, setGroup, sub, setSub, open, setOpen, query, setQuery, selected, onSelect, onClear }) {
  const allExercises = Object.entries(deep).flatMap(([g, subs]) =>
    Object.entries(subs).flatMap(([s, exes]) =>
      exes.map(n => ({ n, g, s }))
    )
  )
  const filtered = query.trim()
    ? allExercises.filter(e => e.n.toLowerCase().includes(query.toLowerCase()))
    : group
      ? allExercises.filter(e => e.g === group && (!sub || e.s === sub))
      : []

  const groups = Object.keys(deep).sort()
  const subs = group ? Object.keys(deep[group] || {}).filter(s => s !== group).sort() : []
  const col = group ? mc(group) : '#c8ff00'

  return (
    <div style={{marginBottom:12}}>
      {/* Trigger / selected display */}
      <div onClick={()=>setOpen(!open)}
        style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:selected?'rgba(200,255,0,0.06)':'rgba(255,255,255,0.03)',border:'1px solid '+(selected?'rgba(200,255,0,0.25)':'rgba(255,255,255,0.08)'),borderRadius:11,cursor:'pointer',transition:'all .15s'}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={selected?'#c8ff00':'rgba(255,255,255,0.25)'} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span style={{flex:1,fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',color:selected?'#c8ff00':'rgba(255,255,255,0.3)',fontWeight:selected?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {selected || 'Search or select an exercise…'}
        </span>
        {selected
          ? <button onClick={e=>{e.stopPropagation();onClear();setGroup(null);setSub(null);setQuery('');setOpen(false)}}
              style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:'1rem',lineHeight:1,padding:'0 2px'}}>×</button>
          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round"><polyline points={open?"18 15 12 9 6 15":"6 9 12 15 18 9"}/></svg>
        }
      </div>

      {open && (
        <div style={{marginTop:6,background:'#0a0a0f',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,overflow:'hidden'}}>
          {/* Search bar */}
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              ref={el=>el&&!query&&setTimeout(()=>el.focus(),50)}
              value={query}
              onChange={e=>{setQuery(e.target.value);if(e.target.value){setGroup(null);setSub(null)}}}
              placeholder="Type to search…"
              style={{flex:1,background:'none',border:'none',outline:'none',fontSize:'.85rem',color:'#e8e8f0',fontFamily:"'DM Sans',sans-serif"}}
            />
            {query && <button onClick={()=>setQuery('')} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:'1.1rem',lineHeight:1}}>×</button>}
          </div>

          {/* Muscle group pills - shown when no search query */}
          {!query && (
            <div style={{display:'flex',gap:5,padding:'8px 10px',flexWrap:'wrap',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              {groups.map(g => {
                const c_ = mc(g)
                const isActive = group === g
                return (
                  <button key={g} onClick={()=>{setGroup(isActive?null:g);setSub(null)}}
                    style={{padding:'4px 11px',background:isActive?c_+'18':'rgba(255,255,255,0.03)',border:'1px solid '+(isActive?c_+'50':'rgba(255,255,255,0.07)'),borderRadius:20,color:isActive?c_:'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.72rem',fontWeight:isActive?700:400,transition:'all .12s'}}>
                    {g}
                  </button>
                )
              })}
            </div>
          )}

          {/* Sub-muscle pills - shown when group selected */}
          {!query && group && subs.length > 0 && (
            <div style={{display:'flex',gap:5,padding:'6px 10px',flexWrap:'wrap',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <button onClick={()=>setSub(null)}
                style={{padding:'3px 10px',background:!sub?col+'15':'transparent',border:'1px solid '+((!sub)?col+'45':'rgba(255,255,255,0.06)'),borderRadius:20,color:!sub?col:'rgba(255,255,255,0.3)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.68rem',fontWeight:!sub?700:400}}>
                All
              </button>
              {subs.map(s=>(
                <button key={s} onClick={()=>setSub(s===sub?null:s)}
                  style={{padding:'3px 10px',background:sub===s?col+'15':'transparent',border:'1px solid '+(sub===s?col+'45':'rgba(255,255,255,0.06)'),borderRadius:20,color:sub===s?col:'rgba(255,255,255,0.3)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.68rem',fontWeight:sub===s?700:400}}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Exercise list */}
          <div style={{maxHeight:200,overflowY:'auto'}}>
            {(query || group) ? (
              filtered.length === 0
                ? <div style={{padding:'16px',textAlign:'center',fontSize:'.78rem',color:'rgba(255,255,255,0.2)',fontFamily:"'DM Sans',sans-serif"}}>No exercises found</div>
                : filtered.map(({n, g, s}) => {
                    const isSelected = selected === n
                    const c_ = mc(g)
                    return (
                      <div key={n} onClick={()=>{onSelect(n);setOpen(false);setQuery('');setGroup(null);setSub(null)}}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',cursor:'pointer',background:isSelected?'rgba(200,255,0,0.06)':'transparent',borderBottom:'1px solid rgba(255,255,255,0.03)',transition:'background .1s'}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:c_,flexShrink:0}}/>
                        <span style={{flex:1,fontFamily:"'DM Sans',sans-serif",fontSize:'.8rem',color:isSelected?'#c8ff00':'rgba(255,255,255,0.65)',fontWeight:isSelected?700:400}}>{n}</span>
                        {query && <span style={{fontSize:'.65rem',color:'rgba(255,255,255,0.2)',fontFamily:"'DM Sans',sans-serif"}}>{s}</span>}
                        {isSelected && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    )
                  })
            ) : (
              <div style={{padding:'14px',textAlign:'center',fontSize:'.78rem',color:'rgba(255,255,255,0.2)',fontFamily:"'DM Sans',sans-serif"}}>
                Select a muscle group or search above
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Loader() {
  return <div style={{minHeight:'100vh',background:'#080808',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:32,height:32,border:'3px solid #1e1e1e',borderTopColor:'#e8ff47',borderRadius:'50%',animation:'spin .8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
}
