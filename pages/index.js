import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { TopNav, BottomTabs } from '../components/Nav'
import { MUSCLE_TREE, getMuscleColor, getMuscleGroup, displayMuscle, ALL_MUSCLES_FLAT, normalizeMuscle } from '../lib/muscles'

const S = {
  AUTH:'auth', HOME:'home', SETUP:'setup', WARMUP:'warmup', UPLOAD:'upload',
  ANALYZING:'analyzing', CONFIRMING:'confirming', LOGGING:'logging',
  BETWEEN:'between', STRETCH:'stretch', DONE:'done'
}
const mc = getMuscleColor
const MUSCLES = Object.entries(MUSCLE_TREE).map(([id, {icon, subs, color}]) => ({
  id, icon, color,
  sub: subs.slice(0,3).join(' · ')
}))
const KEY = 'gt_v5'
const todayStr = () => new Date().toISOString().split('T')[0]
const fmt = s => { if(!s&&s!==0) return '0:00'; const m=Math.floor(s/60); return `${m}:${String(s%60).padStart(2,'0')}` }
const QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Strength doesn't come from what you can do - it comes from overcoming what you thought you couldn't.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Champions are made from something deep inside them - a desire, a dream, a vision.",
  "The last three reps is what makes the muscle grow. This area of pain divides champion from non-champion.",
  "Take care of your body. It's the only place you have to live.",
]

const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch(e) {} }
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)||'null') } catch(e) { return null } }
const clear = () => { try { localStorage.removeItem(KEY) } catch(e) {} }

export default function App() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState(S.AUTH)
  const [warmupDuration, setWarmupDuration] = useState(0)
  const [warmupSkipped, setWarmupSkipped] = useState(false)
  const [warmupExercises, setWarmupExercises] = useState([])
  const [stretchDuration, setStretchDuration] = useState(0)
  const [stretchSkipped, setStretchSkipped] = useState(false)
  const [stretchExercises, setStretchExercises] = useState([])
  const warmupStart = useRef(null)
  const stretchStart = useRef(null)
  const [date, setDate] = useState(todayStr())
  const [muscles, setMuscles] = useState([])
  const [imgB64, setImgB64] = useState(null)
  const [imgMime, setImgMime] = useState('image/jpeg')
  const [imgPreview, setImgPreview] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [pending, setPending] = useState([])
  const [cidx, setCidx] = useState(0)
  const [done, setDone] = useState([])
  const [cur, setCur] = useState(null)
  const [cset, setCset] = useState({w:'',r:''})
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [draftSessionId, setDraftSessionId] = useState(null)
  const draftIdRef = useRef(null) // ref mirror - always current, no stale closure issue
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [recentExercises, setRecentExercises] = useState([]) // past exercises for quick-pick
  const [templates, setTemplates] = useState([])             // workout templates
  const [templateQueue, setTemplateQueue] = useState([])     // exercises from selected template
  const [showTemplates, setShowTemplates] = useState(false)
  const [showQuickPick, setShowQuickPick] = useState(false)
  const [drag, setDrag] = useState(false)
  const [addMuscle, setAddMuscle] = useState(false)
  const [sessTimer, setSessTimer] = useState(0)
  const [exTimer, setExTimer] = useState(0)
  const [rest, setRest] = useState(0)
  const [restOn, setRestOn] = useState(false)
  const [restDuration, setRestDuration] = useState(90) // configurable: 60/90/120/180
  const [sessionReport, setSessionReport] = useState(null)
  const [reportError, setReportError] = useState(null)
  const liveSessionId = useRef(null) // Supabase session ID created immediately
  const liveExerciseId = useRef(null) // Current exercise row ID in Supabase
  // Custom time override
  const [customStartTime, setCustomStartTime] = useState('')
  const [customEndTime, setCustomEndTime] = useState('')
  const [showTimeEdit, setShowTimeEdit] = useState(false)

  const sessStart = useRef(null)
  const exStart = useRef(null)
  const setActiveStart = useRef(null) // tracks when current set STARTED (after rest)
  const tick = useRef(null)
  const restTick = useRef(null)
  const fileRef = useRef(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    // Safety: never let the splash spinner hang forever
    const readyTimeout = setTimeout(() => setReady(true), 5000)
    supabase.auth.getSession().then(async ({ data:{session} }) => {
      clearTimeout(readyTimeout)
      if (session?.user) {
        setUser(session.user)
        try {
          const pr = await fetch(`/api/profile?userId=${session.user.id}`)
          const pd = await pr.json()
          if (pr.ok && pd.profile && pd.profile.onboarded === false) {
            setReady(true); router.replace('/onboarding?userId='+session.user.id); return
          }
          if (pr.ok && pd.profile?.rest_duration_seconds) {
            setRestDuration(pd.profile.rest_duration_seconds)
          }
        } catch(e) {}
        // Check for template start
        const tmplRaw = localStorage.getItem('gt_template')
        if (tmplRaw) {
          try {
            const tmpl = JSON.parse(tmplRaw)
            if (tmpl.fromTemplate) {
              localStorage.removeItem('gt_template')
              setMuscles(tmpl.muscles || [])
              if (tmpl.templateExercises?.length) {
                // Store template exercises to auto-add during session
                setTemplateQueue(tmpl.templateExercises)
              }
              setScreen(S.UPLOAD)
              setReady(true)
              return
            }
          } catch(e) {}
        }
        const saved = load()
        // Never restore the analyzing screen
        if (saved?.screen === S.ANALYZING) { saved.screen = S.UPLOAD; save(saved) }
        if (saved?.screen === S.WARMUP) { saved.screen = S.SETUP; save(saved) }
        if (saved?.screen === S.STRETCH) { saved.screen = S.BETWEEN; save(saved) }
        if (saved?.screen === S.WARMUP) { saved.screen = S.SETUP; save(saved) }
        if (saved?.screen === S.STRETCH) { saved.screen = S.BETWEEN; save(saved) }
        if (saved?.screen && saved.screen !== S.AUTH && saved.screen !== S.DONE) {
          setScreen(saved.screen); setDate(saved.date||todayStr())
          setMuscles(saved.muscles||[]); setImgPreview(saved.imgPreview||null)
          setPending(saved.pending||[]); setCidx(saved.cidx||0)
          setDone(saved.done||[]); setCur(saved.cur||null)
          if (saved.sessStart) sessStart.current = saved.sessStart
          if (saved.exStart) exStart.current = saved.exStart
          if (saved.draftSessionId) {
            setDraftSessionId(saved.draftSessionId)
            draftIdRef.current = saved.draftSessionId
          }
          if (saved.liveSessionId) liveSessionId.current = saved.liveSessionId
          restoredRef.current = true
        } else { setScreen(S.HOME) }
      } else { setScreen(S.AUTH) }
      // Fetch past exercises for quick-pick
      if (session?.user) {
        try {
          const sr = await fetch('/api/sessions?userId=' + session.user.id)
          const sd = await sr.json()
          const seen = new Set(), recent = []
          ;(sd.sessions||[]).forEach(s => {
            ;(s.exercises||[]).forEach(ex => {
              const key = (ex.name||'').trim()
              if (key && !seen.has(key)) { seen.add(key); recent.push({ name: key, muscle: ex.muscle||'Other' }) }
            })
          })
          setRecentExercises(recent.slice(0,40))
        } catch(e) {}
      }
      setReady(true)
    })
    const { data:{subscription} } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        setUser(null); setScreen(S.AUTH); clear(); setReady(true)
        return
      }
      // Handle sign-in (including Google OAuth redirect callback)
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(session.user)
        // Check onboarding status
        try {
          const pr = await fetch('/api/profile?userId=' + session.user.id)
          const pd = await pr.json()
          if (pr.ok && pd.profile && pd.profile.onboarded === false) {
            setReady(true)
            router.replace('/onboarding?userId=' + session.user.id)
            return
          }
          if (pr.ok && pd.profile?.rest_duration_seconds) {
            setRestDuration(pd.profile.rest_duration_seconds)
          }
        } catch(e) {}
        // Only set HOME if we're currently on AUTH (fresh login)
        setScreen(s => s === S.AUTH ? S.HOME : s)
        setReady(true)
      }
    })
    // Listen for start-session event from bottom tab
    const onStart = () => { if (user) setScreen(S.SETUP) }
    window.addEventListener('start-session', onStart)
    return () => { clearTimeout(readyTimeout); subscription.unsubscribe(); window.removeEventListener('start-session', onStart) }
  }, [])

  useEffect(() => {
    if (!ready || screen === S.AUTH) return
    save({ screen, date, muscles, imgPreview, pending, cidx, done, cur, sessStart: sessStart.current, exStart: exStart.current, draftSessionId, liveSessionId: liveSessionId.current })
  }, [screen, date, muscles, pending, cidx, done, cur])

  useEffect(() => {
    clearInterval(tick.current)
    if (screen === S.LOGGING && sessStart.current) {
      tick.current = setInterval(() => {
        setSessTimer(Math.floor((Date.now()-sessStart.current)/1000))
        if (exStart.current) setExTimer(Math.floor((Date.now()-exStart.current)/1000))
      }, 1000)
    }
    return () => clearInterval(tick.current)
  }, [screen])

  const startRest = (dur) => {
    const d = dur || restDuration
    clearInterval(restTick.current); setRest(d); setRestOn(true)
    restTick.current = setInterval(() => setRest(s => { if(s<=1){clearInterval(restTick.current);setRestOn(false);return 0} return s-1 }), 1000)
  }

  const loadImg = file => {
    if (!file?.type.startsWith('image/')) { setErr('Please upload an image file.'); return }
    setErr('')
    // Compress to max 1200px / 80% JPEG to stay under Vercel 4.5MB body limit
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1200
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) { const ratio = Math.min(MAX/w, MAX/h); w = Math.round(w*ratio); h = Math.round(h*ratio) }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        const fr = new FileReader()
        fr.onload = e => { const d = e.target.result; setImgPreview(d); setImgB64(d.split(',')[1]); setImgMime('image/jpeg') }
        fr.readAsDataURL(blob)
      }, 'image/jpeg', 0.8)
    }
    img.onerror = () => {
      // Fallback: read as-is
      const fr = new FileReader()
      fr.onload = e => { const d=e.target.result; setImgPreview(d); setImgB64(d.split(',')[1]); setImgMime(file.type||'image/jpeg') }
      fr.readAsDataURL(file)
    }
    img.src = url
  }

  // Auto-save session to server on every significant action
  const autosave = async (extraDone, extraCur) => {
    if (!user) return
    const allDone = extraDone !== undefined ? extraDone : done
    const currentEx = extraCur !== undefined ? extraCur : cur
    const exercises = [
      ...allDone.map(ex => ({
        name: ex.name, muscle: ex.muscle, duration: ex.duration||0,
        sets: (ex.sets||[]).map(s => ({
          weight: s.weight ?? s.weight_kg ?? 0,
          reps: s.reps || 0,
          duration: s.duration || 0,
          total_duration: s.total_duration || 0
        }))
      })),
      ...(currentEx ? [{ name:currentEx.name, muscle:currentEx.muscle, duration:0,
        sets: (currentEx.sets||[]).map(s => ({
          weight: s.weight ?? s.weight_kg ?? 0,
          reps: s.reps || 0,
          duration: s.duration || 0,
          total_duration: s.total_duration || 0
        }))
      }] : [])
    ]
    if (!exercises.length && !muscles.length) return
    try {
      const r = await fetch('/api/session-draft', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId:user.id, draftId:draftIdRef.current||null, muscles, sessionDate:date, exercises, startedAt:sessStart.current })
      })
      const d = await r.json()
      if (d.sessionId && !draftIdRef.current) {
        draftIdRef.current = d.sessionId
        setDraftSessionId(d.sessionId)
        // also persist to localStorage
        try { const s=JSON.parse(localStorage.getItem(KEY)||'{}'); localStorage.setItem(KEY, JSON.stringify({...s, draftSessionId:d.sessionId})) } catch(e) {}
      }
    } catch(e) { /* silent - don't interrupt user flow */ }
  }

  const analyze = async (mode='auto') => {
    if (!imgB64 && !textInput.trim()) { setErr('Add a photo or type the exercise name.'); return }
    setScreen(S.ANALYZING); setErr('')
    const m = mode==='auto' ? (imgB64&&textInput.trim()?'both':imgB64?'image':'text') : mode

    // Check image size before sending - Vercel limit is 4.5MB body
    if (imgB64) {
      const sizeBytes = Math.round(imgB64.length * 0.75)
      if (sizeBytes > 4_000_000) {
        setErr('Photo is too large (max ~4MB). Try taking a new photo or use a smaller image.')
        setScreen(S.UPLOAD); return
      }
    }

    let r, data
    try {
      r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64:imgB64||null, imageMime:imgMime, selectedMuscles:muscles, textInput:textInput.trim()||null, mode:m })
      })
    } catch(e) {
      // True network failure (offline, DNS, CORS)
      setErr('Network error: ' + e.message)
      setScreen(S.UPLOAD); return
    }

    try {
      data = await r.json()
    } catch(e) {
      // Server returned non-JSON (HTML error page, gateway timeout, etc.)
      setErr('Server error (status ' + r.status + '). Try again in a moment.')
      setScreen(S.UPLOAD); return
    }

    if (!r.ok || data.error) {
      setErr(data.error || 'Analysis failed (status ' + r.status + ')')
      setScreen(S.UPLOAD); return
    }
    if (!data.exercises?.length) {
      setErr("Couldn't identify anything. Try a clearer photo or type the exercise name below.")
      setScreen(S.UPLOAD); return
    }
    // For machine photos (most common case) - keep only the best match
    // For workout plans/text lists - keep all exercises found
    let exList = data.exercises
    const allMachines = exList.every(e => e.isMachine)
    if (allMachines && exList.length > 1) {
      // Pick highest confidence match only
      const best = exList.find(e=>e.confidence==='high') || exList[0]
      exList = [best]
    }
    setPending(exList.map(ex=>({...ex,confirmed:null,selectedName:ex.canonical})))
    setCidx(0); setScreen(S.CONFIRMING)
  }

  const reanalyze = async () => {
    setScreen(S.ANALYZING)
    let r, data
    try {
      r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64:imgB64||null, imageMime:imgMime, selectedMuscles:muscles, textInput:textInput.trim()||null, mode:'reanalyze' })
      })
    } catch(e) {
      setErr('Network error: ' + e.message)
      setScreen(S.CONFIRMING); return
    }
    try { data = await r.json() }
    catch(e) { setErr('Server error (status ' + r.status + '). Try again.'); setScreen(S.CONFIRMING); return }
    if (!r.ok || data.error) { setErr(data.error || 'Failed'); setScreen(S.CONFIRMING); return }
    if (!data.exercises?.length) { setErr('Still unclear. Try typing the name.'); setScreen(S.UPLOAD); return }
    setPending(data.exercises.map(ex=>({...ex,confirmed:null,selectedName:ex.canonical})))
    setCidx(0); setScreen(S.CONFIRMING)
  }

  const confirm = name => {
    const u = pending.map((ex,i)=>i===cidx?{...ex,confirmed:true,selectedName:String(name)}:ex)
    setPending(u)
    const next = u.findIndex((e,i)=>i>cidx&&e.confirmed===null)
    if (next===-1) beginEx(u); else setCidx(next)
  }

  const skip = () => {
    const u = pending.map((ex,i)=>i===cidx?{...ex,confirmed:false}:ex)
    setPending(u)
    const next = u.findIndex((e,i)=>i>cidx&&e.confirmed===null)
    if (next===-1) beginEx(u); else setCidx(next)
  }

  const beginEx = async list => {
    const kept = list.filter(e=>e.confirmed===true)
    if (!kept.length) { setScreen(S.UPLOAD); setErr('No exercises selected.'); return }
    if (!sessStart.current) sessStart.current = Date.now()
    exStart.current = Date.now()
    setActiveStart.current = Date.now()
    const [first,...rest] = kept
    setCur({name:first.selectedName,muscle:normalizeMuscle(first.primary_muscle||first.muscle),sets:[],startTime:Date.now()})
    setPending(rest.length?rest.map(e=>({...e,confirmed:true})):[])
    setCset({w:'',r:''}); setScreen(S.LOGGING)

    // Create session in Supabase immediately if not already created
    if (!liveSessionId.current && user) {
      try {
        const r = await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ userId:user.id, muscles, sessionDate:date, createOnly:true }) })
        const d = await r.json()
        if (d.sessionId) {
          liveSessionId.current = d.sessionId
          save({...load()||{}, liveSessionId: d.sessionId})
        }
      } catch(e) { console.error('Failed to create live session:', e) }
    }

    // Add first exercise to Supabase
    if (liveSessionId.current && user) {
      try {
        const r = await fetch('/api/sessions', { method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ type:'add_exercise', sessionId:liveSessionId.current, exercise:{name:first.selectedName, muscle:normalizeMuscle(first.primary_muscle||first.muscle)} }) })
        const d = await r.json()
        if (d.exercise?.id) liveExerciseId.current = d.exercise.id
      } catch(e) { console.error('Failed to save exercise:', e) }
    }
  }

  const logSet = async () => {
    const w = cset.w === '' ? null : parseFloat(cset.w)
    const r = parseInt(cset.r)
    // Allow w=0 for bodyweight, but require reps
    if (w === null || isNaN(w) || !r || r <= 0) return
    const now = Date.now()
    // Active rep time: from when this set started (after rest ended)
    const activeDur = setActiveStart.current ? Math.floor((now - setActiveStart.current) / 1000) : 0
    // Total time from previous set log (includes rest): for tracking full inter-set interval
    const totalDur = exStart.current ? Math.floor((now - exStart.current) / 1000) : 0
    const newSet = { weight:w, reps:r, duration:activeDur, total_duration:totalDur }
    setCur(p=>({...p,sets:[...(p.sets||[]),newSet]}))
    setCset({w:'',r:''})
    setActiveStart.current = null // reset when rest ends
    exStart.current = now
    startRest()
    // Save to localStorage
    try {
      const state = JSON.parse(localStorage.getItem(KEY)||'{}')
      save({...state, screen, date, muscles, pending, cidx, done,
        cur:{...cur,sets:[...(cur?.sets||[]),newSet]},
        sessStart:sessStart.current, exStart:exStart.current, liveSessionId:liveSessionId.current})
    } catch(e) {}
    // Save set to Supabase immediately
    if (liveExerciseId.current) {
      try {
        await fetch('/api/sessions', { method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ type:'add_set', sessionId:liveSessionId.current, exerciseId:liveExerciseId.current,
            set:{ weight_kg:w, reps:r, duration:dur } }) })
      } catch(e) { console.error('Set save failed (data still in localStorage):', e) }
    }
  }

  const saveEdit = () => {
    if(!editing) return
    const w=parseFloat(editing.w),r=parseInt(editing.r)
    if(!w||!r) return
    setCur(p=>{const s=[...p.sets];s[editing.idx]={...s[editing.idx],weight:w,reps:r};return{...p,sets:s}})
    setEditing(null)
  }

  const delSet = idx => setCur(p=>({...p,sets:p.sets.filter((_,i)=>i!==idx)}))

  const finishEx = async () => {
    clearInterval(restTick.current); setRestOn(false)
    const dur = cur.startTime?Math.floor((Date.now()-cur.startTime)/1000):0
    const newDone = [...done,{...cur,duration:dur}]
    setDone(newDone)
    const next = pending.find(e=>e.confirmed===true)
    if (next) {
      setPending(pending.filter(e=>e!==next)); exStart.current=Date.now()
      setCur({name:next.selectedName,muscle:normalizeMuscle(next.primary_muscle||next.muscle),sets:[],startTime:Date.now()})
      setCset({w:'',r:''}); setScreen(S.LOGGING)
      // Save next exercise to Supabase immediately
      if (liveSessionId.current) {
        try {
          const r = await fetch('/api/sessions', { method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ type:'add_exercise', sessionId:liveSessionId.current, exercise:{name:next.selectedName, muscle:next.muscle} }) })
          const d = await r.json()
          if (d.exercise?.id) liveExerciseId.current = d.exercise.id
        } catch(e) { console.error('Next exercise save failed:', e) }
      }
    } else { setCur(null); setScreen(S.BETWEEN) }
    // Save all done exercises immediately after finishing
    setTimeout(() => autosave(newDone, null), 100)
  }

  const finish = async (stretchDur=0, stretchSkip=false, stretchExs=[]) => {
    setSaving(true)
    let dur = sessStart.current?Math.floor((Date.now()-sessStart.current)/1000):0
    if (customStartTime && customEndTime) {
      const start = new Date(`${date}T${customStartTime}`)
      const end = new Date(`${date}T${customEndTime}`)
      if (end > start) dur = Math.floor((end-start)/1000)
    }
    try {
      let finalSessionId = liveSessionId.current

      if (finalSessionId) {
        // Session already exists in DB - just update duration and muscles
        await fetch('/api/sessions', { method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ type:'update_session', sessionId:finalSessionId, muscles, duration:dur, warmupDuration, warmupSkipped, warmupExercises, stretchDuration:stretchDur, stretchSkipped:stretchSkip, stretchExercises:stretchExs }) })
      } else {
        // Fallback: create session with all data (in case live saving failed)
        const r = await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ userId:user.id, muscles, sessionDate:date, sessionDuration:dur, warmupDuration, warmupSkipped, warmupExercises, stretchDuration:stretchDur, stretchSkipped:stretchSkip, stretchExercises:stretchExs,
            exercises: done.map(ex=>({name:ex.name, muscle:ex.muscle, duration:ex.duration||0,
              sets:ex.sets.map(s=>({weight:s.weight, reps:s.reps, duration:s.duration||0}))})) }) })
        const d = await r.json()
        finalSessionId = d.sessionId
      }

      if (finalSessionId && done.length > 0) {
        // Generate AI report
        setReportError(null)
        fetch('/api/session-report', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ sessionId:finalSessionId, userId:user.id, muscles, duration:dur,
            exercises: done.map(ex=>({name:ex.name, muscle:ex.muscle, sets:ex.sets.map(s=>({weight:s.weight, reps:s.reps}))})) }) })
          .then(rr=>rr.json())
          .then(rd=>{
            if (rd.report) setSessionReport(rd.report)
            else setReportError(rd.error || 'Could not generate report')
          })
          .catch(e=>setReportError('Network error generating report'))
      } else if (done.length === 0) {
        setReportError('No exercises logged this session')
      }
    } catch(e) { console.error('Finish session error:', e) }
    liveSessionId.current = null; liveExerciseId.current = null
    clear(); setSaving(false); setScreen(S.DONE)
  }

  const retryReport = async () => {
    setReportError(null); setSessionReport(null)
    let dur = sessStart.current?Math.floor((Date.now()-sessStart.current)/1000):0
    try {
      // Find the most recent session for this user
      const sr = await fetch('/api/sessions?userId=' + user.id)
      const sd = await sr.json()
      const latest = (sd.sessions||[])[0]
      if (!latest) { setReportError('No session found'); return }
      const exs = (latest.exercises||[]).map(ex=>({name:ex.name, muscle:ex.muscle, sets:(ex.sets||[]).map(s=>({weight:s.weight_kg??s.weight??0, reps:s.reps}))}))
      if (!exs.length) { setReportError('No exercises in session'); return }
      const r = await fetch('/api/session-report', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sessionId:latest.id, userId:user.id, muscles:latest.muscles_trained||muscles, duration:latest.duration_seconds||dur, exercises:exs }) })
      const rd = await r.json()
      if (rd.report) setSessionReport(rd.report)
      else setReportError(rd.error || 'Could not generate report')
    } catch(e) { setReportError('Network error: ' + e.message) }
  }

  const restart = () => {
    clear(); clearInterval(tick.current); clearInterval(restTick.current)
    sessStart.current=null; exStart.current=null; restoredRef.current=false
    setDate(todayStr()); setMuscles([]); setImgB64(null); setImgPreview(null); setTextInput('')
    setPending([]); setCidx(0); setDone([]); setCur(null); setCset({w:'',r:''})
    setRestOn(false); setErr(''); setSessTimer(0); setExTimer(0); setSessionReport(null)
    setCustomStartTime(''); setCustomEndTime(''); setShowTimeEdit(false)
    setReportError(null)
    setScreen(S.HOME)
  }

  // Cancel current exercise - go back to upload/between without saving
  const cancelExercise = () => {
    clearInterval(restTick.current); setRestOn(false)
    setCur(null); setCset({w:'',r:''})
    setImgB64(null); setImgPreview(null); setTextInput(''); setErr('')
    if (done.length > 0) {
      setScreen(S.BETWEEN)
    } else {
      setScreen(S.UPLOAD)
    }
  }

  // Cancel entire session - clear everything and go home
  const cancelSession = async () => {
    clearInterval(tick.current); clearInterval(restTick.current)
    // Delete the session from Supabase - try draftSessionId first, then check for any session today
    const sessionToDelete = draftIdRef.current || draftSessionId || liveSessionId?.current
    if (sessionToDelete && user) {
      try {
        await fetch('/api/sessions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'session', id: sessionToDelete })
        })
      } catch(e) {}
    }
    // Also clear from localStorage
    clear()
    sessStart.current = null; exStart.current = null
    if (liveSessionId) liveSessionId.current = null
    setDate(todayStr()); setMuscles([]); setImgB64(null); setImgPreview(null); setTextInput('')
    setPending([]); setCidx(0); setDone([]); setCur(null); setCset({w:'',r:''})
    setRestOn(false); setErr(''); setSessTimer(0); setExTimer(0); setSessionReport(null)
    draftIdRef.current = null; setDraftSessionId(null); setScreen(S.HOME)
  }

  const pex = pending[cidx]
  const curSets = cur?.sets||[]
  const quote = QUOTES[new Date().getDay()%QUOTES.length]

  if (!ready) return <Splash/>
  if (screen === S.AUTH) return <AuthScreen/>

  const pageContent = () => {
    switch(screen) {
      case S.HOME: return <HomeScreen user={user} onStart={()=>setScreen(S.SETUP)} router={router}/>
      case S.SETUP: return <SetupScreen date={date} setDate={setDate} muscles={muscles} setMuscles={setMuscles} onNext={()=>setScreen(S.WARMUP)} onBack={()=>setScreen(S.HOME)} templates={templates} showTemplates={showTemplates} setShowTemplates={setShowTemplates} setTemplateQueue={setTemplateQueue}/>
      case S.WARMUP: return <WarmupScreen muscles={muscles}
      onStart={(dur,exs)=>{setWarmupDuration(dur);setWarmupSkipped(false);setWarmupExercises(exs||[]);setScreen(S.UPLOAD)}}
      onSkip={()=>{setWarmupSkipped(true);setWarmupDuration(0);setWarmupExercises([]);setScreen(S.UPLOAD)}}
    />
    case S.UPLOAD: return <UploadScreen muscles={muscles} setMuscles={setMuscles} addMuscle={addMuscle} setAddMuscle={setAddMuscle} imgPreview={imgPreview} imgB64={imgB64} textInput={textInput} setTextInput={setTextInput} drag={drag} setDrag={setDrag} fileRef={fileRef} loadImg={loadImg} analyze={analyze} err={err} done={done} sessTimer={sessTimer} finish={()=>setScreen(S.STRETCH)} saving={saving} onBack={()=>setScreen(done.length>0?S.BETWEEN:S.SETUP)} recentExercises={recentExercises} showQuickPick={showQuickPick} setShowQuickPick={setShowQuickPick} templateQueue={templateQueue} onQuickPick={(ex)=>{const item={canonical:ex.name,muscle:ex.muscle,primary_muscle:ex.muscle,secondary_muscles:[],other_muscles:[],alternatives:[],rawText:'',isMachine:false,confidence:'high',confirmed:true,selectedName:ex.name};beginEx([item])}}/>
      case S.ANALYZING: return <AnalyzingScreen onCancel={()=>{setErr('Cancelled.');setScreen(S.UPLOAD)}} sessTimer={sessTimer}/>
      case S.CONFIRMING: return pex ? <ConfirmScreen pex={pex} cidx={cidx} total={pending.length} confirm={confirm} skip={skip} reanalyze={reanalyze} textInput={textInput} setTextInput={setTextInput} imgB64={imgB64} analyze={analyze} err={err}/> : null
      case S.LOGGING: return cur ? <LoggingScreen cur={cur} curSets={curSets} sessTimer={sessTimer} exTimer={exTimer} rest={rest} restOn={restOn} setRest={setRest} setRestOn={setRestOn} restTick={restTick} restDuration={restDuration} setRestDuration={setRestDuration} startRest={startRest} cset={cset} setCset={setCset} logSet={logSet} finishEx={finishEx} editing={editing} setEditing={setEditing} saveEdit={saveEdit} delSet={delSet} mc={mc} cancelExercise={cancelExercise} cancelSession={cancelSession} hasDone={done.length>0}/> : null
      case S.BETWEEN: return <BetweenScreen done={done} sessTimer={sessTimer} muscles={muscles} setMuscles={setMuscles} addMuscle={addMuscle} setAddMuscle={setAddMuscle} onAdd={()=>{setImgB64(null);setImgPreview(null);setTextInput('');setErr('');setScreen(S.UPLOAD)}} finish={()=>setScreen(S.STRETCH)} saving={saving} showTimeEdit={showTimeEdit} setShowTimeEdit={setShowTimeEdit} customStartTime={customStartTime} setCustomStartTime={setCustomStartTime} customEndTime={customEndTime} setCustomEndTime={setCustomEndTime} date={date} mc={mc} cancelSession={cancelSession}
        onSaveTemplate={async()=>{
          const name = prompt('Template name (e.g. "Chest Day", "Push"):')
          if (!name?.trim()) return
          const exList = done.map(ex=>({name:ex.name, muscle:ex.muscle||''}) )
          const r = await fetch('/api/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,name:name.trim(),muscles,exercises:exList})})
          if(r.ok){const d=await r.json();setTemplates(p=>[d.template,...p]);alert('Template saved!')}
        }}/>
      case S.STRETCH: return <StretchScreen muscles={muscles}
      onDone={(dur,exs)=>{setStretchDuration(dur);setStretchSkipped(false);setStretchExercises(exs||[]);finish(dur,false,exs||[])}}
      onSkip={()=>{setStretchSkipped(true);setStretchDuration(0);setStretchExercises([]);finish(0,true,[])}}
    />
    case S.DONE: return <DoneScreen sessionReport={sessionReport} reportError={reportError} onRetry={retryReport} onDashboard={()=>router.push('/dashboard')} onRestart={restart}/>
      default: return null
    }
  }

  const showNav = [S.HOME, S.SETUP, S.UPLOAD, S.CONFIRMING, S.DONE, S.BETWEEN].includes(screen)
  const showBottom = [S.HOME].includes(screen)
  const isLogging = screen === S.LOGGING
  const isAnalyzing = screen === S.ANALYZING

  return (
    <div style={{minHeight:'100vh',background:'#050508',color:'var(--text-primary)'}}>
      {showNav && <TopNav user={user} title={screen===S.HOME?null:screen===S.SETUP?'New Session':screen===S.UPLOAD?'Add Exercise':screen===S.CONFIRMING?'Confirm Exercise':screen===S.BETWEEN?'Session Active':screen===S.DONE?'Session Complete':null} back={screen===S.SETUP?()=>setScreen(S.HOME):screen===S.UPLOAD?()=>setScreen(done.length>0?S.BETWEEN:S.SETUP):screen===S.BETWEEN?null:null} onSignOut={()=>supabase.auth.signOut().then(()=>setScreen(S.AUTH))}/>}
      {isLogging && <LoggingHeader sessTimer={sessTimer} exTimer={exTimer} curName={cur?.name}/>}
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>loadImg(e.target.files[0])}/>
      <div style={{paddingBottom: showBottom?'calc(80px + env(safe-area-inset-bottom))':'20px'}}>
        {pageContent()}
      </div>
      {showBottom && <BottomTabs active="home"/>}
    </div>
  )
}

// ── Sub-screens ─────────────────────────────────────────────────────────────

const WARMUP_RECS = {
  Chest:     ['5 min light cardio', 'Arm circles x 20', 'Band pull-aparts x 15', 'Push-up negatives x 10'],
  Back:      ['5 min light cardio', 'Cat-cow stretch x 10', 'Band pull-aparts x 15', 'Shoulder circles x 20'],
  Shoulders: ['Arm circles x 20', 'Band dislocates x 10', 'Wall slides x 15', 'Neck rolls x 10'],
  Arms:      ['Wrist circles x 20', 'Arm swings x 20', 'Band curl warmups x 15', 'Elbow flexion rotations x 15'],
  Legs:      ['5 min walk or bike', 'Leg swings x 20 each', 'Hip circles x 15', 'Bodyweight squats x 20'],
  Core:      ['5 min light cardio', 'Hip flexor stretch 30s', 'Cat-cow x 10', 'Dead bug x 10'],
  Cardio:    ['3 min easy jog', 'Dynamic stretches x 10', 'High knees x 20', 'Jumping jacks x 20'],
}
const STRETCH_RECS = {
  Chest:     ['Doorway chest stretch 45s', 'Pec stretch on foam roller 60s', 'Cross-body arm stretch 30s each', 'Thread the needle 30s each'],
  Back:      ["Child's pose 60s", 'Cat-cow x 15 slow', 'Seated spinal twist 30s each', 'Lat stretch on cable 45s'],
  Shoulders: ['Cross-body shoulder stretch 30s each', 'Sleeper stretch 45s each', 'Doorway stretch 45s', 'Overhead tricep stretch 30s each'],
  Arms:      ['Wrist flexor stretch 30s each', 'Wrist extensor stretch 30s each', 'Bicep wall stretch 45s', 'Overhead tricep stretch 30s each'],
  Legs:      ['Quad stretch 45s each', 'Hamstring stretch 60s each', 'Hip flexor lunge 45s each', 'Calf stretch against wall 45s each'],
  Core:      ['Cobra stretch 45s', "Child's pose 60s", 'Seated spinal twist 45s each', 'Hip flexor stretch 45s each'],
  Cardio:    ['Hamstring stretch 60s', 'Calf stretch 45s each', 'Hip flexor lunge 45s each', 'Standing quad stretch 45s each'],
}

function WarmupScreen({ muscles, onStart, onSkip }) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [checked, setChecked] = useState({})
  const timerRef = useRef(null)

  const recs = [...new Set(
    (muscles.length ? muscles : ['Chest']).flatMap(m => WARMUP_RECS[m] || WARMUP_RECS.Chest)
  )].slice(0, 6)

  const toggle = () => {
    if (running) { clearInterval(timerRef.current); setRunning(false) }
    else { timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000); setRunning(true) }
  }
  useEffect(() => () => clearInterval(timerRef.current), [])
  const fmt = s => { const m = Math.floor(s/60); return m+':'+String(s%60).padStart(2,'0') }
  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div style={{minHeight:'100dvh',background:'#080808',color:'#f0f0f0',display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',width:'100%'}}>
      {/* Scrollable content */}
      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'env(safe-area-inset-top) 16px 16px'}}>
        {/* Header */}
        <div style={{paddingTop:20}}>
          <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:3,color:'rgba(255,255,255,0.25)',marginBottom:6}}>BEFORE YOU START</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.2rem',letterSpacing:2,color:'#f97316',lineHeight:1}}>WARM UP</div>
          <div style={{fontSize:'.78rem',color:'rgba(255,255,255,0.35)',marginTop:4}}>Get your body ready · reduces injury risk</div>
        </div>

        {/* Timer */}
        <div style={{margin:'20px 0',background:'linear-gradient(135deg,rgba(249,115,22,0.1),rgba(249,115,22,0.04))',border:'1px solid rgba(249,115,22,0.2)',borderRadius:16,padding:'22px 16px',textAlign:'center'}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'3.4rem',letterSpacing:3,color:'#f97316',lineHeight:1}}>{fmt(elapsed)}</div>
          <div style={{fontSize:'.62rem',color:'rgba(255,255,255,0.3)',letterSpacing:2,marginTop:4}}>WARMUP TIME</div>
          <button onClick={toggle}
            style={{marginTop:14,padding:'11px 30px',background:running?'rgba(249,115,22,0.15)':'#f97316',border:'1px solid rgba(249,115,22,0.4)',borderRadius:30,color:running?'#f97316':'#080808',fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.88rem',cursor:'pointer',letterSpacing:1,WebkitTapHighlightColor:'transparent'}}>
            {running ? '⏸ PAUSE' : elapsed > 0 ? '▶ RESUME' : '▶ START TIMER'}
          </button>
        </div>

        {/* Recommendations checklist */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.25)'}}>
            RECOMMENDED FOR {muscles.slice(0,3).join(', ').toUpperCase() || 'YOUR SESSION'}
          </div>
          {doneCount > 0 && <div style={{fontSize:'.7rem',color:'rgba(249,115,22,0.7)',fontWeight:700}}>{doneCount}/{recs.length}</div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {recs.map((r, i) => {
            const done = checked[i]
            return (
              <div key={i} onClick={() => setChecked(p => ({...p, [i]: !p[i]}))}
                style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:done?'rgba(249,115,22,0.08)':'rgba(255,255,255,0.03)',border:'1px solid '+(done?'rgba(249,115,22,0.3)':'rgba(255,255,255,0.07)'),borderRadius:10,cursor:'pointer',transition:'all .15s',WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:24,height:24,borderRadius:6,border:'2px solid '+(done?'#f97316':'rgba(255,255,255,0.15)'),background:done?'#f97316':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                  {done && <svg width="11" height="11" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#080808" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:'.88rem',color:done?'rgba(249,115,22,0.85)':'rgba(255,255,255,0.7)',textDecoration:done?'line-through':'none',lineHeight:1.3}}>{r}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sticky actions */}
      <div style={{padding:'12px 16px calc(16px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid rgba(255,255,255,0.06)',background:'#080808'}}>
        <button onClick={() => onStart(elapsed, recs.filter((_,i)=>checked[i]))}
          style={{width:'100%',padding:'15px',background:'#c8ff00',border:'none',borderRadius:12,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:'#080808',cursor:'pointer',letterSpacing:1,WebkitTapHighlightColor:'transparent'}}>
          {elapsed > 0 ? 'DONE - START WORKOUT →' : 'START WORKOUT →'}
        </button>
        <button onClick={onSkip}
          style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,color:'rgba(255,255,255,0.4)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',WebkitTapHighlightColor:'transparent'}}>
          Skip Warmup
        </button>
      </div>
    </div>
  )
}

function StretchScreen({ muscles, onDone, onSkip }) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [checked, setChecked] = useState({})
  const timerRef = useRef(null)

  const recs = [...new Set(
    (muscles.length ? muscles : ['Chest']).flatMap(m => STRETCH_RECS[m] || STRETCH_RECS.Chest)
  )].slice(0, 6)

  const toggle = () => {
    if (running) { clearInterval(timerRef.current); setRunning(false) }
    else { timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000); setRunning(true) }
  }
  useEffect(() => () => clearInterval(timerRef.current), [])
  const fmt = s => { const m = Math.floor(s/60); return m+':'+String(s%60).padStart(2,'0') }
  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div style={{minHeight:'100dvh',background:'#080808',color:'#f0f0f0',display:'flex',flexDirection:'column',maxWidth:480,margin:'0 auto',width:'100%'}}>
      {/* Scrollable content */}
      <div style={{flex:1,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'env(safe-area-inset-top) 16px 16px'}}>
        {/* Header */}
        <div style={{paddingTop:20}}>
          <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:3,color:'rgba(255,255,255,0.25)',marginBottom:6}}>GREAT WORK!</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.2rem',letterSpacing:2,color:'#4ade80',lineHeight:1}}>COOL DOWN</div>
          <div style={{fontSize:'.78rem',color:'rgba(255,255,255,0.35)',marginTop:4}}>Stretching speeds up recovery</div>
        </div>

        {/* Timer + progress */}
        <div style={{margin:'20px 0',background:'linear-gradient(135deg,rgba(74,222,128,0.08),rgba(74,222,128,0.03))',border:'1px solid rgba(74,222,128,0.2)',borderRadius:16,padding:'20px 16px',textAlign:'center'}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'3.4rem',letterSpacing:3,color:'#4ade80',lineHeight:1}}>{fmt(elapsed)}</div>
          <div style={{fontSize:'.62rem',color:'rgba(255,255,255,0.3)',letterSpacing:2,marginTop:2}}>STRETCHING TIME</div>
          {recs.length > 0 && (
            <div style={{marginTop:8,fontSize:'.72rem',color:'rgba(74,222,128,0.7)'}}>
              {doneCount}/{recs.length} stretches done
            </div>
          )}
          <button onClick={toggle}
            style={{marginTop:12,padding:'10px 28px',background:running?'rgba(74,222,128,0.12)':'#4ade80',border:'1px solid rgba(74,222,128,0.4)',borderRadius:30,color:running?'#4ade80':'#080808',fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.86rem',cursor:'pointer',letterSpacing:1,WebkitTapHighlightColor:'transparent'}}>
            {running ? '⏸ PAUSE' : elapsed > 0 ? '▶ RESUME' : '▶ START TIMER'}
          </button>
        </div>

        {/* Stretch checklist */}
        <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.25)',marginBottom:10}}>
          STRETCH CHECKLIST
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {recs.map((r, i) => {
            const done = checked[i]
            return (
              <div key={i} onClick={() => setChecked(p => ({...p, [i]: !p[i]}))}
                style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:done?'rgba(74,222,128,0.07)':'rgba(255,255,255,0.03)',border:'1px solid '+(done?'rgba(74,222,128,0.3)':'rgba(255,255,255,0.07)'),borderRadius:10,cursor:'pointer',transition:'all .15s',WebkitTapHighlightColor:'transparent'}}>
                <div style={{width:24,height:24,borderRadius:6,border:'2px solid '+(done?'#4ade80':'rgba(255,255,255,0.15)'),background:done?'#4ade80':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
                  {done && <svg width="11" height="11" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#080808" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:'.88rem',color:done?'rgba(74,222,128,0.8)':'rgba(255,255,255,0.7)',textDecoration:done?'line-through':'none',lineHeight:1.3}}>{r}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sticky actions */}
      <div style={{padding:'12px 16px calc(16px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid rgba(255,255,255,0.06)',background:'#080808'}}>
        <button onClick={() => onDone(elapsed, recs.filter((_,i)=>checked[i]))}
          style={{width:'100%',padding:'15px',background:'#4ade80',border:'none',borderRadius:12,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:'#080808',cursor:'pointer',letterSpacing:1,WebkitTapHighlightColor:'transparent'}}>
          ✓ FINISH SESSION
        </button>
        <button onClick={onSkip}
          style={{width:'100%',padding:'12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,color:'rgba(255,255,255,0.4)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',WebkitTapHighlightColor:'transparent'}}>
          Skip Stretching
        </button>
      </div>
    </div>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState('main') // main | login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const doGoogle = () => supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:typeof window!=='undefined'?window.location.origin:''}})

  const doLogin = async () => {
    if (!email||!password) { setErr('Enter email and password.'); return }
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr(error.message)
    setLoading(false)
  }

  const doSignup = async () => {
    if (!email||!password||!name) { setErr('Fill in all fields.'); return }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return }
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() } }
    })
    if (error) { setErr(error.message) }
    else { setMsg('Check your email to confirm your account, then sign in.'); setMode('login') }
    setLoading(false)
  }

  const doReset = async () => {
    if (!email) { setErr('Enter your email first.'); return }
    setLoading(true); setErr('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window!=='undefined'?window.location.origin+'/':''
    })
    if (error) setErr(error.message)
    else setMsg('Password reset email sent - check your inbox.')
    setLoading(false)
  }

  const INPUT_S = {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',color:'#e8e8f0',padding:'14px 16px',fontFamily:"'DM Sans',sans-serif",fontSize:'.95rem',borderRadius:12,outline:'none',width:'100%',transition:'border .2s',marginBottom:10}

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px',background:'#050508',overflow:'hidden',position:'relative'}}>
      <div style={{position:'absolute',top:'15%',left:'50%',transform:'translateX(-50%)',width:400,height:400,background:'radial-gradient(circle, rgba(200,255,0,0.06) 0%, transparent 70%)',pointerEvents:'none'}}/>
      <style>{`input[type=email],input[type=password],input[type=text]{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:#e8e8f0;padding:14px 16px;font-family:'DM Sans',sans-serif;font-size:.95rem;border-radius:12px;outline:none;width:100%;transition:border .2s;margin-bottom:10px;box-sizing:border-box} input:focus{border-color:#c8ff00;background:rgba(200,255,0,0.04)} ::placeholder{color:rgba(255,255,255,0.25)}`}</style>

      <div style={{width:'100%',maxWidth:360,position:'relative',zIndex:1}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{width:72,height:72,background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.25)',borderRadius:22,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:'2rem'}}>🏋️</div>
          <div className="bb" style={{fontSize:'2.8rem',color:'#c8ff00',lineHeight:.95}}>GYM</div>
          <div className="bb" style={{fontSize:'2.8rem',lineHeight:.95,marginBottom:6}}>TRACKER</div>
          <div style={{color:'rgba(255,255,255,0.3)',fontSize:'.8rem'}}>AI-powered workout companion</div>
        </div>

        {err && <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:10,padding:'10px 14px',color:'#fca5a5',fontSize:'.82rem',marginBottom:12,lineHeight:1.5}}>{err}</div>}
        {msg && <div style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',borderRadius:10,padding:'10px 14px',color:'#4ade80',fontSize:'.82rem',marginBottom:12,lineHeight:1.5}}>{msg}</div>}

        {/* MAIN - choose method */}
        {mode === 'main' && (
          <div>
            <button onClick={doGoogle}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,width:'100%',padding:'15px',background:'#fff',color:'#111',border:'none',borderRadius:14,fontSize:'.95rem',fontFamily:"'Space Grotesk',sans-serif",cursor:'pointer',fontWeight:700,marginBottom:12,boxShadow:'0 4px 20px rgba(255,255,255,0.08)'}}>
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <div style={{flex:1,height:1,background:'rgba(255,255,255,0.08)'}}/><span style={{color:'rgba(255,255,255,0.2)',fontSize:'.72rem',fontWeight:700}}>OR</span><div style={{flex:1,height:1,background:'rgba(255,255,255,0.08)'}}/>
            </div>
            <button onClick={()=>{setMode('login');setErr('');setMsg('')}}
              style={{width:'100%',padding:'15px',background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.25)',borderRadius:14,fontSize:'.95rem',fontFamily:"'Space Grotesk',sans-serif",cursor:'pointer',fontWeight:700,color:'#c8ff00',marginBottom:10}}>
              Sign in with Email
            </button>
            <button onClick={()=>{setMode('signup');setErr('');setMsg('')}}
              style={{width:'100%',padding:'15px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:14,fontSize:'.95rem',fontFamily:"'Space Grotesk',sans-serif",cursor:'pointer',fontWeight:700,color:'rgba(255,255,255,0.7)'}}>
              Create Account
            </button>
            <div style={{color:'rgba(255,255,255,0.2)',fontSize:'.72rem',textAlign:'center',marginTop:16}}>Free · No credit card · Your data stays yours</div>
          </div>
        )}

        {/* LOGIN */}
        {mode === 'login' && (
          <div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'1.1rem',marginBottom:16}}>Sign In</div>
            <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
            <button onClick={doLogin} disabled={loading}
              style={{width:'100%',padding:'15px',background:'#c8ff00',border:'none',borderRadius:14,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.95rem',color:'#080808',cursor:loading?'not-allowed':'pointer',marginBottom:10,opacity:loading?.7:1}}>
              {loading?'Signing in…':'Sign In →'}
            </button>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={()=>{setMode('main');setErr('');setMsg('')}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.35)',cursor:'pointer',fontSize:'.8rem',fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
              <button onClick={doReset} style={{background:'none',border:'none',color:'rgba(200,255,0,0.5)',cursor:'pointer',fontSize:'.8rem',fontFamily:"'DM Sans',sans-serif"}}>Forgot password?</button>
            </div>
            <div style={{textAlign:'center',marginTop:12}}>
              <button onClick={()=>{setMode('signup');setErr('');setMsg('')}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:'.8rem',fontFamily:"'DM Sans',sans-serif"}}>No account? <span style={{color:'#c8ff00',fontWeight:700}}>Create one →</span></button>
            </div>
          </div>
        )}

        {/* SIGNUP */}
        {mode === 'signup' && (
          <div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'1.1rem',marginBottom:16}}>Create Account</div>
            <input type="text" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}/>
            <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/>
            <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSignup()}/>
            <button onClick={doSignup} disabled={loading}
              style={{width:'100%',padding:'15px',background:'#c8ff00',border:'none',borderRadius:14,fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.95rem',color:'#080808',cursor:loading?'not-allowed':'pointer',marginBottom:10,opacity:loading?.7:1}}>
              {loading?'Creating…':'Create Account →'}
            </button>
            <div style={{textAlign:'center'}}>
              <button onClick={()=>{setMode('main');setErr('');setMsg('')}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.35)',cursor:'pointer',fontSize:'.8rem',fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
            </div>
            <div style={{textAlign:'center',marginTop:12}}>
              <button onClick={()=>{setMode('login');setErr('');setMsg('')}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:'.8rem',fontFamily:"'DM Sans',sans-serif"}}>Already have an account? <span style={{color:'#c8ff00',fontWeight:700}}>Sign in →</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function HomeScreen({ user, onStart, router }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      fetch('/api/sessions?userId=' + user.id).then(r => r.json()).catch(() => ({ sessions: [] })),
      fetch('/api/weight?userId=' + user.id).then(r => r.json()).catch(() => ({ entries: [] })),
      fetch('/api/profile?userId=' + user.id).then(r => r.json()).catch(() => ({ profile: null })),
    ]).then(([sessData, weightData, profileData]) => {
      const sessions = sessData.sessions || []
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]

      // Streak
      const sessionDays = new Set(sessions.map(s => s.session_date || s.created_at?.split('T')[0]))
      let streak = 0
      const check = new Date(now)
      if (!sessionDays.has(todayStr)) check.setDate(check.getDate() - 1)
      while (true) {
        const d = check.toISOString().split('T')[0]
        if (sessionDays.has(d)) { streak++; check.setDate(check.getDate() - 1) } else break
      }

      // This week
      const monday = new Date(now)
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      monday.setHours(0, 0, 0, 0)
      const weekSessions = sessions.filter(s => {
        const d = new Date((s.session_date || s.created_at?.split('T')[0]) + 'T12:00:00')
        return d >= monday
      })

      const last = sessions[0]
      const lastDate = last ? new Date((last.session_date || last.created_at?.split('T')[0]) + 'T12:00:00') : null
      const daysSinceLast = lastDate ? Math.floor((now - lastDate) / 86400000) : null

      // Week volume - raw kg always, display based on unit setting
      let weekVolKg = 0
      weekSessions.forEach(s => s.exercises?.forEach(ex => ex.sets?.forEach(st => {
        weekVolKg += (st.weight_kg || 0) * (st.reps || 0)
      })))

      const muscleCounts = {}
      weekSessions.forEach(s => (s.muscles_trained || []).forEach(m => {
        muscleCounts[m] = (muscleCounts[m] || 0) + 1
      }))
      const topMuscle = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

      const trainedToday = sessionDays.has(todayStr)
      const todaySession = sessions.find(s => (s.session_date || s.created_at?.split('T')[0]) === todayStr)

      // Weight & unit from profile
      const weightEntries = weightData.entries || []
      const latestWeightKg = weightEntries[0]?.weight_kg || null
      const profile = profileData.profile || {}
      const isImperial = profile.unit_system === 'imperial'
      const weightUnit = isImperial ? 'lbs' : 'kg'
      const volUnit = isImperial ? 'lbs' : 'kg'
      const displayWeight = latestWeightKg ? (isImperial ? Math.round(latestWeightKg * 2.205) : latestWeightKg) : null
      const weekVol = isImperial ? Math.round(weekVolKg * 2.205) : Math.round(weekVolKg)

      setStats({
        streak, weekSessions: weekSessions.length, weekVol, volUnit,
        topMuscle, totalSessions: sessions.length, daysSinceLast, trainedToday,
        lastMusclesToday: todaySession?.muscles_trained || [],
        displayWeight, weightUnit, isImperial,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Athlete'
  const hour = new Date().getHours()

  const COACH_MESSAGES = [
    { text: "Champions train when nobody is watching.", sub: "Be consistent." },
    { text: "Every set is a vote for who you want to become.", sub: "Make it count." },
    { text: "Your body adapts to the stress you give it.", sub: "Progressive overload is law." },
    { text: "Soreness is weakness leaving the body.", sub: "Recover and come back harder." },
    { text: "The only bad workout is the one you skipped.", sub: "Show up every time." },
    { text: "Results don't come from what you do occasionally.", sub: "They come from what you do consistently." },
    { text: "Discipline is choosing what you want most over what you want now.", sub: "Stay locked in." },
  ]
  const todayMsg = COACH_MESSAGES[new Date().getDay() % COACH_MESSAGES.length]

  // Daily challenge only shown when user has NOT trained today
  const DAILY_CHALLENGES = [
    "Hit a new personal best on any lift today.",
    "Add one extra set to every exercise.",
    "Log your full session - no gaps.",
    "Train a muscle group you have been neglecting.",
    "Complete warmup AND stretch. Full session.",
    "Beat last week's volume on your main lift.",
    "Stay under 60s rest between sets.",
  ]
  const todayChallenge = DAILY_CHALLENGES[new Date().getDay() % DAILY_CHALLENGES.length]

  const getStatus = () => {
    if (!stats) return null
    if (stats.trainedToday) return {
      icon: '✅', color: '#c8ff00',
      label: 'SESSION LOGGED TODAY',
      sub: stats.lastMusclesToday.length ? stats.lastMusclesToday.join(' · ') : 'Well done. Rest and recover.',
    }
    if (stats.daysSinceLast === null) return { icon: '🏆', color: '#c8ff00', label: 'START YOUR FIRST SESSION', sub: 'Every champion started at zero.' }
    if (stats.daysSinceLast >= 3) return { icon: '⚡', color: '#f97316', label: stats.daysSinceLast + ' DAYS WITHOUT TRAINING', sub: 'Your muscles are recovered. Time to move.' }
    if (stats.daysSinceLast === 1) return { icon: '💪', color: 'rgba(255,255,255,0.8)', label: 'TRAINED YESTERDAY', sub: stats.topMuscle ? 'Last focus: ' + stats.topMuscle : 'Keep the momentum.' }
    return { icon: '🔄', color: 'rgba(255,255,255,0.7)', label: 'REST DAY', sub: 'Recover well. Come back stronger.' }
  }
  const status = getStatus()

  const fmtVol = v => v >= 1000 ? (v/1000).toFixed(1)+'K' : String(v)

  return (
    <div style={{minHeight:'calc(100dvh - 80px)',background:'#050508',overflowX:'hidden'}}>
      <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:600,height:400,background:'radial-gradient(ellipse at 50% 0%,rgba(200,255,0,0.06) 0%,transparent 65%)',pointerEvents:'none',zIndex:0}}/>
      <div style={{position:'relative',zIndex:1,padding:'0 16px',maxWidth:480,margin:'0 auto'}}>

        {/* ── Header ── */}
        <div style={{paddingTop:28,marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:'.58rem',fontWeight:700,letterSpacing:3,color:'rgba(255,255,255,0.2)',marginBottom:4}}>
              {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.2rem',letterSpacing:2,color:'#c8ff00',lineHeight:1}}>{firstName}</div>
            <div style={{fontSize:'.72rem',fontWeight:700,letterSpacing:1,color:'rgba(255,255,255,0.3)',marginTop:4}}>
              {hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'}
            </div>
          </div>
          {/* Current weight - tappable */}
          {!loading && stats?.displayWeight && (
            <div onClick={() => router.push('/weight')}
              style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,padding:'10px 14px',textAlign:'center',cursor:'pointer',minWidth:60}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.5rem',color:'#c8ff00',lineHeight:1}}>{stats.displayWeight}</div>
              <div style={{fontSize:'.5rem',fontWeight:700,letterSpacing:1.5,color:'rgba(255,255,255,0.3)',marginTop:2}}>{stats.weightUnit.toUpperCase()}</div>
            </div>
          )}
        </div>

        {/* ── 3 KPI cards - streak, sessions this week, all-time ── */}
        {loading ? (
          <div style={{height:80,background:'rgba(255,255,255,0.02)',borderRadius:14,marginBottom:16,border:'1px solid rgba(255,255,255,0.05)'}}/>
        ) : stats && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
            {[
              {
                value: stats.streak || 0,
                label: stats.streak === 1 ? 'DAY STREAK' : 'DAY STREAK',
                sub: stats.streak >= 3 ? 'ON FIRE' : stats.streak === 0 ? 'START TODAY' : 'KEEP GOING',
                color: stats.streak >= 3 ? '#f97316' : stats.streak >= 1 ? '#c8ff00' : 'rgba(255,255,255,0.4)',
              },
              {
                value: stats.weekSessions + 'x',
                label: 'THIS WEEK',
                sub: stats.weekSessions >= 4 ? 'GREAT WEEK' : stats.weekSessions >= 2 ? 'BUILDING' : 'GET MOVING',
                color: '#c8ff00',
              },
              {
                value: stats.weekVol > 0 ? fmtVol(stats.weekVol) + ' ' + stats.volUnit : '-',
                label: 'WEEK VOLUME',
                sub: stats.weekVol > 0 ? 'TOTAL LIFTED' : 'NO DATA YET',
                color: '#3b82f6',
                small: true,
              },
            ].map(({ value, label, sub, color, small }) => (
              <div key={label} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 10px',textAlign:'center'}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize: small ? '.95rem' : '1.8rem',color,lineHeight:1,letterSpacing:.5,marginBottom:4}}>
                  {value}
                </div>
                <div style={{fontSize:'.48rem',fontWeight:700,letterSpacing:1.5,color:'rgba(255,255,255,0.22)'}}>{label}</div>
                <div style={{fontSize:'.46rem',letterSpacing:1,color:color+'99',marginTop:3}}>{sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── START SESSION ── */}
        <div onClick={onStart}
          style={{background:'linear-gradient(135deg,#c8ff00 0%,#a8e000 100%)',borderRadius:20,padding:'24px',marginBottom:12,cursor:'pointer',position:'relative',overflow:'hidden',WebkitTapHighlightColor:'transparent'}}
          onTouchStart={e => e.currentTarget.style.transform='scale(.98)'}
          onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}>
          <div style={{position:'absolute',top:0,right:0,bottom:0,width:'40%',background:'repeating-linear-gradient(135deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 8px)',pointerEvents:'none'}}/>
          <div style={{position:'relative',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
            <div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.8rem',color:'#080808',lineHeight:.9,letterSpacing:2}}>START</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.8rem',color:'rgba(0,0,0,0.35)',lineHeight:.9,letterSpacing:2,marginBottom:14}}>SESSION</div>
              <div style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(0,0,0,0.12)',padding:'8px 16px',borderRadius:30}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:'#080808',animation:'pulse 1.5s infinite'}}/>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.78rem',color:'#080808',letterSpacing:1}}>READY TO TRAIN</span>
              </div>
            </div>
            {!loading && stats && stats.streak > 0 && (
              <div style={{textAlign:'right',paddingBottom:4}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2.6rem',color:'rgba(0,0,0,0.15)',lineHeight:1}}>{stats.streak}</div>
                <div style={{fontSize:'.5rem',fontWeight:700,color:'rgba(0,0,0,0.3)',letterSpacing:1}}>DAY STREAK</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Status card ── */}
        {!loading && status && (
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:'14px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:40,height:40,borderRadius:12,background:status.color+'18',border:'1px solid '+status.color+'30',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1.2rem'}}>
              {status.icon}
            </div>
            <div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.85rem',color:status.color,letterSpacing:.5}}>{status.label}</div>
              <div style={{fontSize:'.72rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>{status.sub}</div>
            </div>
          </div>
        )}

        {/* ── Daily Challenge - only shown when user has NOT trained today ── */}
        {!loading && stats && !stats.trainedToday && (
          <div style={{background:'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(59,130,246,0.03))',border:'1px solid rgba(59,130,246,0.2)',borderRadius:16,padding:'14px 16px',marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <span style={{fontSize:'.9rem'}}>🎯</span>
              <div style={{fontSize:'.55rem',fontWeight:700,letterSpacing:2,color:'rgba(59,130,246,0.7)'}}>TODAY'S CHALLENGE</div>
            </div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'rgba(255,255,255,0.85)',lineHeight:1.4}}>{todayChallenge}</div>
          </div>
        )}

        {/* ── Coach Message ── */}
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:16,padding:'14px 16px',marginBottom:16}}>
          <div style={{fontSize:'.55rem',fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.2)',marginBottom:6}}>COACH SAYS</div>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.88rem',color:'rgba(255,255,255,0.8)',lineHeight:1.5,marginBottom:4}}>"{todayMsg.text}"</div>
          <div style={{fontSize:'.72rem',color:'rgba(200,255,0,0.5)',fontWeight:600}}>{todayMsg.sub}</div>
        </div>

        {/* ── Weekly volume bar ── */}
        {!loading && stats && stats.weekVol > 0 && (
          <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:'14px 16px',marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
              <div style={{fontSize:'.55rem',fontWeight:700,letterSpacing:2,color:'rgba(255,255,255,0.25)'}}>WEEKLY VOLUME</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'1rem',color:'#c8ff00'}}>{fmtVol(stats.weekVol)} {stats.volUnit}</div>
            </div>
            <div style={{display:'flex',gap:5}}>
              {['M','T','W','T','F','S','S'].map((d, i) => {
                const dayOffset = (new Date().getDay() + 6) % 7
                const isToday = i === dayOffset
                const isPast = i < dayOffset
                return (
                  <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
                    <div style={{width:'100%',height:3,borderRadius:2,background: isToday ? '#c8ff00' : isPast ? 'rgba(200,255,0,0.2)' : 'rgba(255,255,255,0.06)'}}/>
                    <div style={{fontSize:'.48rem',color: isToday ? '#c8ff00' : 'rgba(255,255,255,0.2)',fontWeight:700}}>{d}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Quick nav - Progress & Body AI only (Meals/Library are in bottom tabs) ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:24}}>
          {[
            {icon:'📊',label:'My Progress',sub:'Charts & history',path:'/dashboard',color:'#3b82f6'},
            {icon:'🫵',label:'Body AI',sub:'Physique analysis',path:'/body',color:'#a855f7'},
          ].map(({ icon, label, sub, path, color }) => (
            <div key={label} onClick={() => router.push(path)}
              style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:16,padding:'16px',cursor:'pointer',position:'relative',overflow:'hidden',WebkitTapHighlightColor:'transparent'}}
              onTouchStart={e => e.currentTarget.style.transform='scale(.96)'}
              onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}>
              <div style={{position:'absolute',bottom:-12,right:-12,width:50,height:50,background:color+'14',borderRadius:'50%'}}/>
              <div style={{fontSize:'1.5rem',marginBottom:8}}>{icon}</div>
              <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.9rem',marginBottom:2,color:'rgba(255,255,255,0.85)'}}>{label}</div>
              <div style={{fontSize:'.68rem',color:'rgba(255,255,255,0.25)'}}>{sub}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

function AddMusclePanel({ muscles, setMuscles, onClose }) {
  const [expandedGroup, setExpandedGroup] = useState(null)

  const addItem = (m) => {
    if (!muscles.includes(m)) setMuscles(p => [...p, m])
    onClose()
  }

  return (
    <div>
      <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:8}}>
        {MUSCLES.map(m => {
          const subs = MUSCLE_TREE[m.id]?.subs || []
          const isOpen = expandedGroup === m.id
          const alreadyHas = muscles.includes(m.id) || subs.some(s => muscles.includes(s))
          return (
            <div key={m.id} style={{borderRadius:10,overflow:'hidden',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
              <div style={{display:'flex',alignItems:'center'}}>
                {/* Group tap */}
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',flex:1,cursor:'pointer',opacity:alreadyHas?0.4:1}}
                  onClick={()=>{ if (!alreadyHas) { addItem(m.id) } }}>
                  <span style={{fontSize:'1rem',flexShrink:0}}>{m.icon}</span>
                  <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.85rem',color:m.color}}>
                    {m.id}
                    {alreadyHas && <span style={{fontSize:'.6rem',color:'rgba(255,255,255,0.3)',marginLeft:5,fontWeight:400}}>already selected</span>}
                  </span>
                </div>
                {/* Expand for subs */}
                {subs.length > 0 && (
                  <button onClick={()=>setExpandedGroup(isOpen ? null : m.id)}
                    style={{padding:'0 14px',alignSelf:'stretch',background:'none',border:'none',borderLeft:'1px solid rgba(255,255,255,0.05)',color:isOpen?m.color:'rgba(255,255,255,0.2)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:'.68rem',fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
                    subs
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform .2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                )}
              </div>
              {/* Sub-muscles */}
              {isOpen && (
                <div style={{padding:'6px 12px 10px',borderTop:'1px solid rgba(255,255,255,0.05)',background:'rgba(0,0,0,0.2)'}}>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                    {subs.map(sub => {
                      const hasSub = muscles.includes(sub)
                      return (
                        <button key={sub} onClick={()=>{ if (!hasSub) addItem(sub) }}
                          style={{padding:'4px 11px',background:hasSub?'rgba(255,255,255,0.04)':m.color+'18',border:'1px solid '+(hasSub?'rgba(255,255,255,0.06)':m.color+'44'),borderRadius:20,color:hasSub?'rgba(255,255,255,0.25)':m.color,cursor:hasSub?'default':'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.73rem',fontWeight:hasSub?400:600,opacity:hasSub?0.5:1}}>
                          {hasSub ? '✓ ' : ''}{sub}
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
      <button onClick={onClose}
        style={{width:'100%',padding:'8px',background:'transparent',border:'1px solid rgba(255,255,255,0.08)',borderRadius:9,color:'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.78rem'}}>
        Cancel
      </button>
    </div>
  )
}

function SetupScreen({date,setDate,muscles,setMuscles,onNext,onBack,templates,showTemplates,setShowTemplates,setTemplateQueue}) {
  const [expanded, setExpanded] = useState(null)
  const toggleGroup = (gid) => {
    const subs = MUSCLE_TREE[gid]?.subs||[]
    const on = muscles.includes(gid)||subs.some(s=>muscles.includes(s))
    if (!on) setMuscles(p=>[...p,gid])
    else setMuscles(p=>p.filter(m=>m!==gid&&!subs.includes(m)))
  }
  const toggleSub = (gid,sub) => {
    const subs = MUSCLE_TREE[gid]?.subs||[]
    const on = muscles.includes(sub)
    if (on) setMuscles(p=>p.filter(m=>m!==sub&&m!==gid))
    else setMuscles(p=>[...p.filter(m=>m!==gid),sub])
  }
  const isActive = g => muscles.includes(g)||(MUSCLE_TREE[g]?.subs||[]).some(s=>muscles.includes(s))
  const activeSubs = g => (MUSCLE_TREE[g]?.subs||[]).filter(s=>muscles.includes(s))

  return (
    <div style={{padding:'0 0 0',minHeight:'100vh',background:'#050508'}}>
      {/* Header */}
      <div style={{padding:'20px 20px 0',marginBottom:16}}>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:900,fontSize:'1.6rem',color:'#c8ff00',letterSpacing:-1,marginBottom:2}}>New Session</div>
        <input type="date" value={date} max={todayStr()} onChange={e=>setDate(e.target.value)}
          style={{background:'transparent',border:'none',color:'rgba(255,255,255,0.4)',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem',outline:'none',cursor:'pointer',padding:0}}/>
      </div>

      {/* Muscle grid */}
      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
        {MUSCLES.map(m=>{
          const on = isActive(m.id)
          const subs = activeSubs(m.id)
          const isOpen = expanded===m.id
          return (
            <div key={m.id} style={{borderRadius:14,overflow:'hidden',background:on?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.02)',border:`1px solid ${on?m.color+'60':'rgba(255,255,255,0.06)'}`,boxShadow:on?`0 0 20px ${m.color}20`:'none',transition:'all .2s'}}>
              <div style={{display:'flex',alignItems:'center',gap:0}}>
                {/* Color bar */}
                <div style={{width:3,alignSelf:'stretch',background:on?m.color:'transparent',flexShrink:0,transition:'background .2s'}}/>
                {/* Main tap area */}
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',flex:1,cursor:'pointer',minWidth:0}} onClick={()=>toggleGroup(m.id)}>
                  <span style={{fontSize:'1.3rem',flexShrink:0,filter:on?'none':'grayscale(80%) opacity(0.5)'}}>{m.icon}</span>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:800,fontSize:'.92rem',color:on?m.color:'rgba(255,255,255,0.5)',letterSpacing:.5,transition:'color .2s'}}>{m.id.toUpperCase()}</div>
                    <div style={{fontSize:'.62rem',color:on&&subs.length?m.color+'99':'rgba(255,255,255,0.2)',marginTop:2,letterSpacing:.3}}>
                      {subs.length?subs.join(' · '):(MUSCLE_TREE[m.id]?.subs||[]).slice(0,3).join(' · ')}
                    </div>
                  </div>
                  {on&&<div style={{width:20,height:20,borderRadius:'50%',background:m.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>}
                </div>
                {/* Expand button */}
                <button onClick={()=>setExpanded(isOpen?null:m.id)}
                  style={{padding:'0 16px',alignSelf:'stretch',background:'none',border:'none',borderLeft:`1px solid ${on?m.color+'30':'rgba(255,255,255,0.05)'}`,color:isOpen?m.color:'rgba(255,255,255,0.2)',cursor:'pointer',fontSize:'.8rem',transition:'all .2s',display:'flex',alignItems:'center'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform .2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              {/* Sub-muscles */}
              {isOpen&&(
                <div style={{padding:'8px 16px 14px',borderTop:`1px solid ${m.color}20`,background:'rgba(0,0,0,0.2)'}}>
                  <div style={{fontSize:'.58rem',fontWeight:700,letterSpacing:2,color:m.color+'60',marginBottom:8}}>SELECT SPECIFIC MUSCLES</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {(MUSCLE_TREE[m.id]?.subs||[]).map(sub=>{
                      const sel=muscles.includes(sub)
                      return (
                        <button key={sub} onClick={()=>toggleSub(m.id,sub)}
                          style={{padding:'5px 14px',background:sel?m.color+'20':'rgba(255,255,255,0.04)',border:`1px solid ${sel?m.color:'rgba(255,255,255,0.1)'}`,borderRadius:20,color:sel?m.color:'rgba(255,255,255,0.4)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.75rem',fontWeight:sel?700:400,transition:'all .15s'}}>
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

      {/* Selected summary */}
      {muscles.length>0&&(
        <div style={{padding:'0 16px',marginBottom:16}}>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {muscles.map(m=>(
              <span key={m} style={{background:mc(m)+'18',border:`1px solid ${mc(m)}44`,color:mc(m),padding:'4px 11px',borderRadius:20,fontSize:'.72rem',fontWeight:700}}>{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Template picker */}
      {templates?.length > 0 && (
        <div style={{padding:'0 16px',marginBottom:12}}>
          <button onClick={()=>setShowTemplates(v=>!v)}
            style={{width:'100%',padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.82rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>📋 My Templates ({templates.length})</span>
            <span style={{color:'rgba(255,255,255,0.25)'}}>{showTemplates?'▲':'▼'}</span>
          </button>
          {showTemplates && (
            <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:5}}>
              {templates.map(t => (
                <button key={t.id} onClick={()=>{
                  setMuscles(t.muscles||[])
                  setTemplateQueue(t.exercises||[])
                  setShowTemplates(false)
                  onNext()
                }}
                  style={{padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,color:'rgba(255,255,255,0.7)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:700}}>{t.name}</div>
                    <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>
                      {(t.muscles||[]).join(' · ')} · {(t.exercises||[]).length} exercises
                    </div>
                  </div>
                  <span style={{color:'#c8ff00',fontSize:'.8rem'}}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div style={{padding:'0 16px'}}>
        <button className="btn btn-y" disabled={!muscles.length} onClick={onNext}
          style={{width:'100%',position:'relative',overflow:'hidden'}}>
          Choose Exercise {muscles.length>0&&`(${muscles.length} target${muscles.length>1?'s':''})`}
        </button>
      </div>
    </div>
  )
}

function UploadScreen({muscles,setMuscles,addMuscle,setAddMuscle,imgPreview,imgB64,textInput,setTextInput,drag,setDrag,fileRef,loadImg,analyze,err,done,sessTimer,finish,saving,onBack,recentExercises,showQuickPick,setShowQuickPick,templateQueue,onQuickPick}) {
  return (
    <div style={{padding:'16px 16px 0'}} className="anim-up">
      {done.length>0&&(
        <div style={{background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.2)',borderRadius:14,padding:'12px 16px',marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div style={{color:'#c8ff00',fontSize:'.82rem',fontWeight:600}}>{done.length} exercise{done.length>1?'s':''} · {fmt(sessTimer)}</div>
            <button className="btn-sm" style={{background:'rgba(200,255,0,0.15)',borderColor:'rgba(200,255,0,0.4)',color:'#c8ff00'}} onClick={finish} disabled={saving}>{saving?'Saving…':'Finish Session'}</button>
          </div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{done.map((ex,i)=><span key={i} className="tag" style={{background:mc(ex.muscle)+'22',color:mc(ex.muscle),border:`1px solid ${mc(ex.muscle)}44`,fontSize:'.65rem'}}>{ex.name}</span>)}</div>
        </div>
      )}
      <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:12,alignItems:'center'}}>
        {muscles.map(m=><span key={m} className="tag" style={{background:mc(m)+'22',color:mc(m),border:`1px solid ${mc(m)}44`}}>{m}</span>)}
        <button className="btn-sm" onClick={()=>setAddMuscle(true)} style={{fontSize:'.7rem',padding:'4px 9px'}}>+ muscle</button>
      </div>
      {addMuscle&&(
        <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'12px',marginBottom:12}}>
          <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:1.5,color:'rgba(255,255,255,0.3)',marginBottom:10}}>ADD MUSCLE / SUB-MUSCLE</div>
          <AddMusclePanel muscles={muscles} setMuscles={setMuscles} onClose={()=>setAddMuscle(false)}/>
        </div>
      )}
      {/* Template exercises quick-add */}
      {templateQueue && templateQueue.length > 0 && (
        <div style={{marginBottom:10,padding:'10px 14px',background:'rgba(200,255,0,0.06)',border:'1px solid rgba(200,255,0,0.18)',borderRadius:12}}>
          <div style={{fontSize:'.6rem',fontWeight:700,letterSpacing:1.5,color:'rgba(200,255,0,0.6)',marginBottom:8}}>FROM YOUR TEMPLATE - TAP TO LOG</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {templateQueue.map((ex,i) => (
              <button key={i} onClick={()=>onQuickPick({name:ex.name,muscle:ex.muscle||muscles[0]||'Other'})}
                style={{padding:'5px 12px',background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.25)',borderRadius:20,color:'#c8ff00',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.78rem',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:mc(ex.muscle||'Other'),display:'inline-block',flexShrink:0}}/>
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Recent exercises quick-pick - collapsible menu */}
      {recentExercises && recentExercises.length > 0 && (() => {
        // Filter to exercises matching session muscles
        const filtered = muscles.length === 0 ? recentExercises : recentExercises.filter(ex => {
          const em = (ex.muscle || '').toLowerCase()
          return muscles.some(sel => {
            const s = sel.toLowerCase()
            return em.includes(s) || s.includes(em) ||
              (MUSCLE_TREE[sel]?.subs || []).some(sub => em.includes(sub.toLowerCase()))
          })
        })
        const toShow = filtered.length > 0 ? filtered : recentExercises
        return (
          <div style={{marginBottom:12}}>
            <button onClick={()=>setShowQuickPick(v=>!v)}
              style={{width:'100%',padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.82rem',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>⚡ Recent Exercises ({toShow.length})</span>
              <span style={{color:'rgba(255,255,255,0.25)'}}>{showQuickPick ? '▲' : '▼'}</span>
            </button>
            {showQuickPick && (
              <div style={{marginTop:6,padding:'10px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10}}>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {toShow.slice(0, 20).map((ex, i) => (
                    <button key={i} onClick={() => onQuickPick(ex)}
                      style={{padding:'6px 13px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:20,color:'rgba(255,255,255,0.75)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.78rem',fontWeight:600,display:'flex',alignItems:'center',gap:6,transition:'all .12s'}}
                      onTouchStart={e=>{e.currentTarget.style.background='rgba(200,255,0,0.12)';e.currentTarget.style.color='#c8ff00'}}
                      onTouchEnd={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.color='rgba(255,255,255,0.75)'}}>
                      <span style={{width:7,height:7,borderRadius:'50%',background:mc(ex.muscle||'Other'),flexShrink:0,display:'inline-block'}}/>
                      {ex.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
      {/* Drop zone */}
      <div onClick={()=>{fileRef.current.removeAttribute('capture');fileRef.current.click()}}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);loadImg(e.dataTransfer.files[0])}}
        style={{border:`2px dashed ${drag?'#c8ff00':imgPreview?'rgba(255,255,255,0.12)':'rgba(255,255,255,0.08)'}`,borderRadius:16,overflow:'hidden',marginBottom:10,cursor:'pointer',minHeight:imgPreview?0:150,display:'flex',alignItems:'center',justifyContent:'center',background:drag?'rgba(200,255,0,0.04)':'rgba(0,0,0,0.2)',transition:'all .2s'}}>
        {imgPreview?(
          <img src={imgPreview} alt="" style={{width:'100%',maxHeight:220,objectFit:'cover',display:'block'}}/>
        ):(
          <div style={{textAlign:'center',padding:'28px 20px'}}>
            <div style={{fontSize:'2rem',marginBottom:8,opacity:.5}}>📷</div>
            <div className="bb" style={{color:'var(--text-muted)',fontSize:'.95rem',letterSpacing:2}}>TAP TO ADD PHOTO</div>
            <div style={{color:'var(--text-muted)',fontSize:'.72rem',marginTop:4,opacity:.6}}>Machine · plan · whiteboard</div>
          </div>
        )}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <button className="btn-ghost" style={{flex:1,padding:'11px'}} onClick={()=>{fileRef.current.removeAttribute('capture');fileRef.current.click()}}>🖼 Gallery</button>
        <button className="btn-ghost" style={{flex:1,padding:'11px'}} onClick={()=>{fileRef.current.setAttribute('capture','environment');fileRef.current.click()}}>📷 Camera</button>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:10,margin:'4px 0 10px'}}>
        <div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/><div style={{color:'var(--text-muted)',fontSize:'.72rem',fontWeight:600}}>OR TYPE IT</div><div style={{flex:1,height:1,background:'rgba(255,255,255,0.06)'}}/>
      </div>
      <input type="text" placeholder="e.g. bench press, squats, lateral raises…" value={textInput} onChange={e=>setTextInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyze()} style={{marginBottom:textInput&&imgPreview?6:12}}/>
      {textInput&&imgPreview&&<div style={{color:'#c8ff00',fontSize:'.72rem',marginBottom:10,fontWeight:600}}>✓ AI will cross-check photo + text</div>}
      {err&&<div style={{color:'#fca5a5',fontSize:'.82rem',marginBottom:10,padding:'10px 14px',background:'rgba(239,68,68,.08)',borderRadius:10,border:'1px solid rgba(239,68,68,.2)'}}>{err}</div>}
      <button className="btn btn-y" onClick={()=>analyze()} disabled={!imgB64&&!textInput.trim()}>Identify Exercise →</button>
    </div>
  )
}

function AnalyzingScreen({ onCancel }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  // Auto-cancel after 45 seconds to prevent getting stuck
  useEffect(() => {
    if (elapsed >= 45 && onCancel) onCancel()
  }, [elapsed])
  return (
    <div style={{minHeight:'60vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,textAlign:'center'}}>
      <div style={{width:56,height:56,border:'3px solid rgba(200,255,0,0.2)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite',marginBottom:24}}/>
      <div className="bb" style={{fontSize:'1.5rem',letterSpacing:3,color:'#c8ff00',marginBottom:8}}>IDENTIFYING…</div>
      <div style={{color:'var(--text-muted)',fontSize:'.85rem',marginBottom:6}}>Reading your exercise from the image</div>
      <div style={{color:'rgba(255,255,255,0.2)',fontSize:'.75rem',marginBottom:24}}>{elapsed}s</div>
      {elapsed > 8 && (
        <button onClick={onCancel}
          style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'10px 20px',color:'rgba(255,255,255,0.5)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem'}}>
          Cancel & go back
        </button>
      )}
    </div>
  )
}

function ConfirmScreen({pex,cidx,total,confirm,skip,reanalyze,textInput,setTextInput,imgB64,analyze,err}) {
  return (
    <div style={{padding:'16px 16px 0'}} className="anim-up">
      <div style={{color:'var(--text-muted)',fontSize:'.72rem',fontWeight:700,letterSpacing:1,marginBottom:12}}>EXERCISE {cidx+1} OF {total}</div>
      <div className="card" style={{marginBottom:12}}>
        {pex.rawText&&<div style={{color:'var(--text-muted)',fontSize:'.75rem',marginBottom:10}}>Seen in image: <span style={{fontStyle:'italic',color:'var(--text-secondary)'}}>{pex.rawText}</span></div>}
        {pex.isMachine&&<div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(200,255,0,0.08)',border:'1px solid rgba(200,255,0,0.2)',borderRadius:8,padding:'5px 11px',marginBottom:10,fontSize:'.72rem',color:'#c8ff00',fontWeight:600}}>🏋️ Machine detected</div>}
        {pex.confidence==='low'&&<div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(234,179,8,0.08)',border:'1px solid rgba(234,179,8,0.2)',borderRadius:8,padding:'5px 11px',marginBottom:10,fontSize:'.72rem',color:'#eab308',fontWeight:600}}>⚠ Low confidence</div>}
        <div style={{height:1,background:'rgba(255,255,255,0.06)',marginBottom:12}}/>
        <div style={{marginBottom:10}}>
          <span className="tag" style={{background:mc(pex.muscle)+'22',color:mc(pex.muscle),border:`1px solid ${mc(pex.muscle)}44`,display:'inline-block',marginRight:5}}>{pex.muscle}</span>
          {pex.primaryMuscle&&<span style={{fontSize:'.7rem',color:mc(pex.muscle),fontWeight:700,opacity:.8}}>→ {pex.primaryMuscle}</span>}
        </div>
        <div className="bb" style={{fontSize:'1.8rem',lineHeight:1.1,marginBottom:8}}>{pex.canonical}</div>
        {(pex.secondaryMuscles?.length>0||pex.otherMuscles?.length>0)&&(
          <div style={{marginBottom:8}}>
            {pex.secondaryMuscles?.length>0&&(
              <div style={{fontSize:'.72rem',color:'rgba(255,255,255,0.45)',marginBottom:3}}>
                <span style={{fontWeight:700,color:'rgba(255,255,255,0.5)'}}>Secondary:</span> {pex.secondaryMuscles.join(', ')}
              </div>
            )}
            {pex.otherMuscles?.length>0&&(
              <div style={{fontSize:'.7rem',color:'rgba(255,255,255,0.3)'}}>
                <span style={{fontWeight:700}}>Also works:</span> {pex.otherMuscles.join(', ')}
              </div>
            )}
          </div>
        )}
        <div style={{color:'var(--text-muted)',fontSize:'.78rem'}}>Is this the exercise you're doing?</div>
      </div>
      <button className="btn btn-y" style={{marginBottom:8}} onClick={()=>confirm(pex.canonical)}>✓ Yes, that's correct</button>
      {pex.alternatives?.length>0&&(
        <><div className="label" style={{margin:'10px 0 8px'}}>{pex.isMachine?'Other positions on this machine':'Or did you mean'}</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
          {pex.alternatives.map((a,i)=><button key={i} className="alt" onClick={()=>confirm(a)}>{a}</button>)}
        </div></>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <button className="btn-ghost btn" style={{padding:'12px'}} onClick={reanalyze}>🔍 Look harder</button>
        <button className="btn-ghost btn" style={{padding:'12px',fontSize:'.82rem'}} onClick={skip}>Skip this</button>
      </div>
      <div className="card-inset">
        <div style={{color:'var(--text-muted)',fontSize:'.72rem',fontWeight:600,marginBottom:7}}>Or type the correct name:</div>
        <div style={{display:'flex',gap:8}}>
          <input type="text" placeholder="Exercise name…" value={textInput} onChange={e=>setTextInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyze(imgB64?'both':'text')}/>
          <button onClick={()=>analyze(imgB64?'both':'text')} disabled={!textInput.trim()}
            style={{background:'#c8ff00',border:'none',borderRadius:8,padding:'0 14px',fontSize:'.82rem',cursor:'pointer',color:'#080808',fontWeight:800,whiteSpace:'nowrap',opacity:textInput.trim()?1:.4}}>Check</button>
        </div>
      </div>
    </div>
  )
}

function LoggingHeader({sessTimer,exTimer,curName}) {
  return (
    <div style={{background:'rgba(5,5,8,0.9)',borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'10px 16px',display:'flex',gap:0,position:'sticky',top:0,zIndex:50,backdropFilter:'blur(20px)'}}>
      {[['SESSION',fmt(sessTimer),'#c8ff00'],['EXERCISE',fmt(exTimer),'rgba(255,255,255,0.5)'],['NOW',curName||'-','rgba(255,255,255,0.35)']].map(([l,v,c])=>(
        <div key={l} style={{flex:1,textAlign:'center'}}>
          <div className="bb" style={{fontSize:'1.1rem',color:c,lineHeight:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',padding:'0 4px'}}>{v}</div>
          <div style={{fontSize:'.55rem',color:'rgba(255,255,255,0.25)',letterSpacing:1,marginTop:2}}>{l}</div>
        </div>
      ))}
    </div>
  )
}

function LoggingScreen({cur,curSets,sessTimer,exTimer,rest,restOn,setRest,setRestOn,restTick,restDuration,setRestDuration,startRest,cset,setCset,logSet,finishEx,editing,setEditing,saveEdit,delSet,mc,cancelExercise,cancelSession,hasDone}) {
  return (
    <div style={{padding:'16px 16px 0'}}>
      {/* Edit modal */}
      {editing&&(
        <div className="modal-overlay" onClick={()=>setEditing(null)}>
          <div className="modal-sheet" onClick={e=>e.stopPropagation()}>
            <div className="modal-handle"/>
            <div className="bb" style={{fontSize:'1.3rem',marginBottom:16}}>EDIT SET {editing.idx+1}</div>
            <div style={{display:'flex',gap:10,marginBottom:14}}>
              <div style={{flex:1}}><div className="label" style={{marginBottom:6}}>Weight (kg)</div><input type="number" inputMode="decimal" value={editing.w} onChange={e=>setEditing(s=>({...s,w:e.target.value}))}/></div>
              <div style={{flex:1}}><div className="label" style={{marginBottom:6}}>Reps</div><input type="number" inputMode="numeric" value={editing.r} onChange={e=>setEditing(s=>({...s,r:e.target.value}))}/></div>
            </div>
            <div style={{display:'flex',gap:8}}><button className="btn btn-y" style={{flex:2}} onClick={saveEdit}>Save</button><button className="btn-ghost btn" style={{flex:1}} onClick={()=>setEditing(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Exercise header */}
      <div style={{marginBottom:16}}>
        <span className="tag" style={{background:mc(cur.muscle)+'22',color:mc(cur.muscle),border:`1px solid ${mc(cur.muscle)}44`,marginBottom:8,display:'inline-block'}}>{cur.muscle}</span>
        <div className="bb" style={{fontSize:'2rem',lineHeight:1.1,marginTop:4}}>{cur.name}</div>
        <div style={{color:'var(--text-muted)',fontSize:'.8rem',marginTop:4}}>{curSets.length===0?'Start your first set':`${curSets.length} set${curSets.length>1?'s':''} logged`}</div>
      </div>

      {/* Logged sets */}
      {curSets.length>0&&(
        <div style={{marginBottom:14}}>
          {curSets.map((s,i)=>(
            <div key={i} className="setrow">
              <span className="bb" style={{color:'#c8ff00',fontSize:'.82rem',minWidth:46}}>SET {i+1}</span>
              <span style={{fontSize:'.9rem',flex:1,color:'var(--text-primary)'}}>{s.weight} kg × {s.reps} reps</span>
              <span style={{color:'var(--text-muted)',fontSize:'.68rem',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:1}}>
                {s.duration>0 && <span style={{color:'#c8ff00',opacity:.7}}>rep: {fmt(s.duration)}</span>}
                {s.total_duration>0 && <span>total: {fmt(s.total_duration)}</span>}
              </span>
              <button className="btn-icon" style={{width:28,height:28,borderRadius:8,fontSize:'.78rem'}} onClick={()=>setEditing({idx:i,w:s.weight,r:s.reps})}>✏️</button>
              <button className="btn-icon" style={{width:28,height:28,borderRadius:8,fontSize:'.78rem'}} onClick={()=>delSet(i)}>🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Rest timer */}
      {restOn&&(
        <div style={{background:'rgba(200,255,0,0.06)',border:'1px solid rgba(200,255,0,0.18)',borderRadius:14,padding:'12px 14px',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
            <span className="bb" style={{fontSize:'2rem',color:'#c8ff00',minWidth:54,lineHeight:1}}>{rest}s</span>
            <div style={{flex:1}}>
              <div style={{fontSize:'.65rem',color:'rgba(255,255,255,0.4)',fontWeight:700,letterSpacing:1,marginBottom:5}}>REST TIMER</div>
              <div style={{height:5,background:'rgba(255,255,255,0.08)',borderRadius:3}}>
                <div style={{height:'100%',background:'#c8ff00',width:Math.round((rest/restDuration)*100)+'%',transition:'width 1s linear',borderRadius:3}}/>
              </div>
            </div>
            <button className="btn-icon" onClick={()=>{clearInterval(restTick.current);setRestOn(false)}}>✕</button>
          </div>
          <div style={{display:'flex',gap:5}}>
            {[60,90,120,180].map(d=>(
              <button key={d} onClick={()=>{setRestDuration(d);startRest(d)}}
                style={{flex:1,padding:'5px 0',background:restDuration===d?'rgba(200,255,0,0.15)':'rgba(255,255,255,0.04)',border:'1px solid '+(restDuration===d?'rgba(200,255,0,0.35)':'rgba(255,255,255,0.08)'),borderRadius:8,color:restDuration===d?'#c8ff00':'rgba(255,255,255,0.35)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:'.72rem',fontWeight:700}}>
                {d}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Log set input */}
      <div className="card" style={{marginBottom:12}}>
        <div className="label" style={{marginBottom:12}}>Log Set {curSets.length+1}</div>
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          <div style={{flex:1}}><div className="label" style={{marginBottom:6}}>Weight (kg) <span style={{fontWeight:400,opacity:.5,fontSize:'.6rem'}}>- enter 0 for bodyweight</span></div><input type="number" inputMode="decimal" placeholder={curSets.length?String(curSets[curSets.length-1].weight):'0'} value={cset.w} onChange={e=>setCset(s=>({...s,w:e.target.value}))}/></div>
          <div style={{flex:1}}><div className="label" style={{marginBottom:6}}>Reps</div><input type="number" inputMode="numeric" placeholder={curSets.length?String(curSets[curSets.length-1].reps):'8'} value={cset.r} onChange={e=>setCset(s=>({...s,r:e.target.value}))}/></div>
        </div>
        <button className="btn btn-y" onClick={logSet} disabled={cset.w===''||!cset.r}>+ Log Set</button>
      </div>
      {curSets.length>0&&<button className="btn-ghost btn" onClick={finishEx}>Done with {cur.name} →</button>}

      {/* Cancel options */}
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button onClick={cancelExercise}
          style={{flex:1,padding:'12px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:10,color:'rgba(255,255,255,0.7)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:'.82rem'}}>
          ↩ Skip Exercise
        </button>
        <button onClick={()=>setShowCancelConfirm(true)}
          style={{flex:1,padding:'12px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:10,color:'#f87171',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:'.82rem'}}>
          ✕ Cancel Session
        </button>
      </div>
    </div>
  )
}

function BetweenScreen({done,sessTimer,muscles,setMuscles,addMuscle,setAddMuscle,onAdd,finish,saving,showTimeEdit,setShowTimeEdit,customStartTime,setCustomStartTime,customEndTime,setCustomEndTime,date,mc,cancelSession,onSaveTemplate}) {
  return (
    <div style={{padding:'16px 16px 0'}} className="anim-up">
      <div style={{marginBottom:16}}>
        <div className="bb" style={{fontSize:'1.4rem',color:'#c8ff00',lineHeight:1}}>Exercise Complete</div>
        <div style={{color:'var(--text-muted)',fontSize:'.82rem',marginTop:4}}>{done.length} done · {fmt(sessTimer)}</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:8}}>
          {done.map((ex,i)=><span key={i} className="tag" style={{background:mc(ex.muscle)+'22',color:mc(ex.muscle),border:`1px solid ${mc(ex.muscle)}44`,fontSize:'.65rem'}}>{ex.name}</span>)}
        </div>
      </div>
      <button className="btn btn-y" style={{marginBottom:8}} onClick={onAdd}>+ Add Another Exercise</button>
      <button className="btn-ghost btn" style={{marginBottom:8}} onClick={()=>setAddMuscle(true)}>+ Add Muscle Group</button>
      {addMuscle&&(
        <div className="card-sm" style={{marginBottom:8}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
            {MUSCLES.filter(m=>!muscles.includes(m.id)).map(m=>(
              <button key={m.id} className="btn-sm" onClick={()=>{setMuscles(p=>[...p,m.id]);setAddMuscle(false)}}>{m.icon} {m.id}</button>
            ))}
          </div>
          <button className="btn-sm" onClick={()=>setAddMuscle(false)}>Cancel</button>
        </div>
      )}
      {/* Time override */}
      <button className="btn-ghost btn" style={{marginBottom:8,fontSize:'.82rem'}} onClick={()=>setShowTimeEdit(v=>!v)}>
        ⏱ {showTimeEdit?'Hide':'Edit Session Time'}
      </button>
      {showTimeEdit&&(
        <div className="card-sm" style={{marginBottom:8}}>
          <div style={{color:'var(--text-secondary)',fontSize:'.78rem',marginBottom:10}}>Override the auto-calculated session duration. Useful if you started tracking late.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><div className="label" style={{marginBottom:5}}>Started at</div><input type="time" value={customStartTime} onChange={e=>setCustomStartTime(e.target.value)}/></div>
            <div><div className="label" style={{marginBottom:5}}>Finished at</div><input type="time" value={customEndTime} onChange={e=>setCustomEndTime(e.target.value)}/></div>
          </div>
        </div>
      )}
      <button className="btn-ghost btn" onClick={finish} disabled={saving}>{saving?'Saving…':'Finish Session ✓'}</button>
      {onSaveTemplate && (
        <button onClick={onSaveTemplate}
          style={{width:'100%',padding:'10px',background:'rgba(200,255,0,0.05)',border:'1px solid rgba(200,255,0,0.15)',borderRadius:10,color:'rgba(200,255,0,0.6)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.78rem',marginTop:4}}>
          ⭐ Save as Template
        </button>
      )}
      <button onClick={cancelSession} style={{width:'100%',padding:'11px',background:'transparent',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,color:'rgba(248,113,113,0.45)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.78rem',marginTop:6}}>
        ✕ Cancel entire session
      </button>
    </div>
  )
}

function DoneScreen({sessionReport,reportError,onRetry,onDashboard,onRestart}) {
  return (
    <div style={{padding:'24px 16px 0'}} className="anim-up">
      <div style={{textAlign:'center',marginBottom:24}}>
        <div style={{fontSize:'3rem',marginBottom:10}}>🔥</div>
        <div className="bb" style={{fontSize:'2.5rem',color:'#c8ff00',lineHeight:1}}>SESSION</div>
        <div className="bb" style={{fontSize:'2.5rem',lineHeight:1,marginBottom:8}}>LOGGED!</div>
      </div>
      {sessionReport?(
        <div className="anim-in">
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:12}}>
            {[['Rating',sessionReport.overall_rating+'/10','#c8ff00'],['Intensity',sessionReport.intensity_score+'/10','#ef4444'],['Volume',sessionReport.volume_score+'/10','#3b82f6'],['Balance',sessionReport.balance_score+'/10','#22c55e']].map(([l,v,c])=>(
              <div key={l} className="stat-card"><div className="bb" style={{fontSize:'1.1rem',color:c,lineHeight:1}}>{v}</div><div style={{fontSize:'.55rem',color:'var(--text-muted)',letterSpacing:1,marginTop:3}}>{l.toUpperCase()}</div></div>
            ))}
          </div>
          <div className="card" style={{marginBottom:10,fontSize:'.88rem',color:'var(--text-secondary)',lineHeight:1.6}}>{sessionReport.summary}</div>
          {sessionReport.muscle_coverage&&(
            <div className="card" style={{marginBottom:10}}>
              <div className="label" style={{marginBottom:10}}>Muscle Coverage</div>
              {Object.entries(sessionReport.muscle_coverage).map(([m,d])=>(
                <div key={m} style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:'.82rem',color:'var(--text-primary)',fontWeight:600}}>{m}</span>
                    <span style={{fontSize:'.75rem',color:d.coverage_score>=7?'#4ade80':d.coverage_score>=4?'#eab308':'#ef4444',fontWeight:700}}>{d.coverage_score}/10</span>
                  </div>
                  <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2}}><div style={{height:'100%',width:`${d.coverage_score*10}%`,background:d.coverage_score>=7?'#4ade80':d.coverage_score>=4?'#eab308':'#ef4444',borderRadius:2,transition:'width .8s ease'}}/></div>
                  {d.note&&<div style={{fontSize:'.7rem',color:'var(--text-muted)',marginTop:2}}>{d.note}</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            <div className="card-sm" style={{background:'rgba(74,222,128,0.05)',borderColor:'rgba(74,222,128,0.15)'}}>
              <div className="label" style={{color:'#4ade80',marginBottom:8}}>✓ Went Well</div>
              {sessionReport.what_went_well?.map((s,i)=><div key={i} style={{fontSize:'.78rem',color:'var(--text-secondary)',marginBottom:4,lineHeight:1.4}}>▸ {s}</div>)}
            </div>
            <div className="card-sm" style={{background:'rgba(248,113,113,0.05)',borderColor:'rgba(248,113,113,0.15)'}}>
              <div className="label" style={{color:'#f87171',marginBottom:8}}>↑ Improve</div>
              {sessionReport.what_to_improve?.map((s,i)=><div key={i} style={{fontSize:'.78rem',color:'var(--text-secondary)',marginBottom:4,lineHeight:1.4}}>▸ {s}</div>)}
            </div>
          </div>
          {sessionReport.missing_exercises?.length>0&&sessionReport.missing_exercises[0]&&(
            <div className="card-sm" style={{background:'rgba(234,179,8,0.05)',borderColor:'rgba(234,179,8,0.15)',marginBottom:10}}>
              <div className="label" style={{color:'#eab308',marginBottom:8}}>⚠ Consider Next Time</div>
              {sessionReport.missing_exercises.map((e,i)=><div key={i} style={{fontSize:'.82rem',color:'var(--text-secondary)',marginBottom:4}}>▸ {e}</div>)}
            </div>
          )}
        </div>
      ):reportError?(
        <div style={{textAlign:'center',padding:'16px 0 20px'}}>
          <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:12,padding:'16px 18px',marginBottom:10}}>
            <div style={{fontSize:'.85rem',color:'#f87171',marginBottom:4,fontWeight:600}}>Report unavailable</div>
            <div style={{fontSize:'.78rem',color:'var(--text-muted)',lineHeight:1.4}}>{reportError}</div>
          </div>
          {onRetry && (
            <button onClick={onRetry} style={{padding:'10px 24px',background:'rgba(200,255,0,0.1)',border:'1px solid rgba(200,255,0,0.3)',borderRadius:10,color:'#c8ff00',fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:'.85rem',cursor:'pointer'}}>
              ↺ Retry Analysis
            </button>
          )}
        </div>
      ):(
        <div style={{textAlign:'center',padding:'16px 0 20px'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:'10px 18px',color:'var(--text-muted)',fontSize:'.85rem'}}>
            <div style={{width:14,height:14,border:'2px solid rgba(200,255,0,0.3)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
            Analyzing your session…
          </div>
        </div>
      )}
      <button className="btn btn-y" style={{marginBottom:8}} onClick={onDashboard}>View My Progress →</button>
      <button className="btn-ghost btn" onClick={onRestart}>Start Another Session</button>
    </div>
  )
}

function Splash() {
  return (
    <div style={{minHeight:'100vh',background:'#050508',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:36,height:36,border:'3px solid rgba(200,255,0,0.2)',borderTopColor:'#c8ff00',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
    </div>
  )
}
