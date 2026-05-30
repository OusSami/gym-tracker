import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { TopNav, BottomTabs } from '../components/Nav'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const todayStr = () => new Date().toISOString().split('T')[0]
const fmt1 = n => Math.round((n||0)*10)/10

export default function WeightPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')

  // Form
  const [weight, setWeight] = useState('')
  const [date, setDate] = useState(todayStr())
  const [period, setPeriod] = useState('3m') // 1m 3m 6m 1y all

  const isMetric = profile?.unit_system !== 'imperial'
  const unit = isMetric ? 'kg' : 'lbs'

  const load = useCallback(async (uid) => {
    const [pr, wr] = await Promise.all([
      fetch('/api/profile?userId=' + uid),
      fetch('/api/weight?userId=' + uid)
    ])
    const pd = await pr.json()
    const wd = await wr.json()
    if (pd.profile) {
      setProfile(pd.profile)
      // Pre-fill with current weight from profile
      if (pd.profile.weight_kg && !weight) {
        const w = pd.profile.unit_system === 'imperial'
          ? fmt1(pd.profile.weight_kg / 0.453592)
          : fmt1(pd.profile.weight_kg)
        setWeight(String(w))
      }
    }
    if (wd.entries) setEntries(wd.entries)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.push('/'); return }
      setUser(session.user)
      load(session.user.id)
    })
  }, [])

  const save = async () => {
    if (!weight || !user) return
    const w = parseFloat(weight)
    if (isNaN(w) || w < 20 || w > 500) { setErr('Please enter a valid weight.'); return }
    setSaving(true); setErr(''); setSuccess('')
    try {
      const r = await fetch('/api/weight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, weight_kg: w, recorded_at: date, unit_system: profile?.unit_system })
      })
      const d = await r.json()
      if (!r.ok || d.error) { setErr(d.error || 'Save failed'); setSaving(false); return }
      setSuccess('Weight saved!')
      setTimeout(() => setSuccess(''), 2000)
      await load(user.id)
    } catch(e) { setErr('Error: ' + e.message) }
    setSaving(false)
  }

  const del = async (id) => {
    if (!confirm('Delete this entry?')) return
    setDeleting(id)
    await fetch('/api/weight', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, userId: user.id }) })
    await load(user.id)
    setDeleting(null)
  }

  // Filter entries by period for chart
  const filterEntries = () => {
    if (period === 'all') return entries
    const now = new Date()
    const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[period] || 3
    const cutoff = new Date(now.setMonth(now.getMonth() - months)).toISOString().split('T')[0]
    return entries.filter(e => e.recorded_at >= cutoff)
  }

  const chartData = filterEntries().map(e => ({
    date: e.recorded_at,
    label: new Date(e.recorded_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: isMetric ? fmt1(e.weight_kg) : fmt1(e.weight_kg / 0.453592)
  }))

  // Stats
  const allWeights = entries.map(e => isMetric ? e.weight_kg : e.weight_kg / 0.453592)
  const current = allWeights.length ? fmt1(allWeights[allWeights.length - 1]) : null
  const firstInPeriod = chartData.length ? chartData[0].weight : null
  const change = current !== null && firstInPeriod !== null ? fmt1(current - firstInPeriod) : null
  const minW = allWeights.length ? fmt1(Math.min(...allWeights)) : null
  const maxW = allWeights.length ? fmt1(Math.max(...allWeights)) : null

  const INP = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8e8f0', padding: '13px 16px', fontFamily: "'DM Sans',sans-serif", fontSize: '.95rem', borderRadius: 12, outline: 'none', width: '100%', transition: 'border .2s' }

  return (
    <div style={{ minHeight: '100vh', background: '#050508', color: '#e8e8f0' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.5)} input:focus{border-color:#c8ff00 !important;background:rgba(200,255,0,0.04) !important}`}</style>
      <TopNav title="Weight" user={user} back="/dashboard" onSignOut={() => supabase.auth.signOut().then(() => router.push('/'))} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px calc(90px + env(safe-area-inset-bottom))' }}>

        {/* Log weight */}
        <div style={{ background: 'rgba(200,255,0,0.05)', border: '1px solid rgba(200,255,0,0.18)', borderRadius: 18, padding: '18px', marginBottom: 20 }}>
          <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(200,255,0,0.6)', marginBottom: 14 }}>LOG WEIGHT</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 6 }}>WEIGHT ({unit})</div>
              <input
                type="number" inputMode="decimal" placeholder={isMetric ? '75.0' : '165.0'}
                value={weight} onChange={e => setWeight(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                style={INP}
              />
            </div>
            <div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 6 }}>DATE</div>
              <input
                type="date" value={date} max={todayStr()}
                onChange={e => setDate(e.target.value)}
                style={INP}
              />
            </div>
          </div>

          {date !== todayStr() && (
            <div style={{ fontSize: '.72rem', color: '#eab308', fontWeight: 600, marginBottom: 10 }}>
              📅 Logging historical entry - {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}

          {err && <div style={{ color: '#fca5a5', fontSize: '.8rem', marginBottom: 10, padding: '9px 13px', background: 'rgba(239,68,68,.08)', borderRadius: 9, border: '1px solid rgba(239,68,68,.2)' }}>{err}</div>}
          {success && <div style={{ color: '#4ade80', fontSize: '.8rem', marginBottom: 10, padding: '9px 13px', background: 'rgba(74,222,128,.08)', borderRadius: 9, border: '1px solid rgba(74,222,128,.2)' }}>✓ {success}</div>}

          <button onClick={save} disabled={saving || !weight}
            style={{ width: '100%', padding: '14px', background: (!weight || saving) ? 'rgba(200,255,0,0.3)' : '#c8ff00', border: 'none', borderRadius: 12, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '.95rem', color: '#080808', cursor: (!weight || saving) ? 'not-allowed' : 'pointer', transition: 'all .2s' }}>
            {saving ? 'Saving…' : date === todayStr() ? 'Log Today\'s Weight' : 'Save Historical Entry'}
          </button>
        </div>

        {/* Stats row */}
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
            {[
              ['Current', current, unit, '#c8ff00'],
              ['Change', change !== null ? (change > 0 ? '+' + change : change) : '--', unit, change > 0 ? '#ef4444' : change < 0 ? '#4ade80' : '#888'],
              ['All-Time Low', minW, unit, '#3b82f6'],
            ].map(([label, val, u, col]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: '1.1rem', color: col, lineHeight: 1 }}>{val ?? '--'}<span style={{ fontSize: '.6rem', opacity: .6, marginLeft: 2 }}>{u}</span></div>
                <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,0.28)', letterSpacing: 1, marginTop: 4, fontWeight: 700 }}>{label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)' }}>WEIGHT HISTORY</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['1m', '3m', '6m', '1y', 'all'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    style={{ padding: '4px 9px', background: period === p ? 'rgba(200,255,0,0.15)' : 'transparent', border: '1px solid ' + (period === p ? 'rgba(200,255,0,0.35)' : 'rgba(255,255,255,0.08)'), borderRadius: 20, color: period === p ? '#c8ff00' : 'rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '.7rem', fontWeight: 700 }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#e8e8f0' }}
                  formatter={(v) => [v + ' ' + unit, 'Weight']}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '.78rem' }}
                />
                <Line type="monotone" dataKey="weight" stroke="#c8ff00" strokeWidth={2.5} dot={{ fill: '#c8ff00', r: 3 }} activeDot={{ r: 5 }} />
                {/* Goal line if profile has a target */}
                {profile?.weight_kg && (
                  <ReferenceLine y={isMetric ? profile.weight_kg : fmt1(profile.weight_kg / 0.453592)} stroke="rgba(200,255,0,0.2)" strokeDasharray="4 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
            {chartData.length > 0 && (
              <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'center' }}>
                {chartData.length} entries · {period === 'all' ? 'All time' : 'Last ' + period}
              </div>
            )}
          </div>
        )}

        {/* History list */}
        {entries.length > 0 && (
          <div>
            <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>ALL ENTRIES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...entries].reverse().map((e, i) => {
                const w = isMetric ? fmt1(e.weight_kg) : fmt1(e.weight_kg / 0.453592)
                const prev = entries[entries.length - 2 - i]
                const prevW = prev ? (isMetric ? prev.weight_kg : prev.weight_kg / 0.453592) : null
                const diff = prevW !== null ? fmt1(e.weight_kg - prev.weight_kg) : null
                const diffDisp = prevW !== null ? (isMetric ? diff : fmt1(diff / 0.453592)) : null
                const isToday = e.recorded_at === todayStr()
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', background: isToday ? 'rgba(200,255,0,0.05)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isToday ? 'rgba(200,255,0,0.15)' : 'rgba(255,255,255,0.06)'), borderRadius: 11 }}>
                    <div>
                      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '.88rem' }}>
                        {w} {unit}
                        {diffDisp !== null && diffDisp !== 0 && (
                          <span style={{ marginLeft: 8, fontSize: '.72rem', fontWeight: 600, color: diffDisp > 0 ? '#ef4444' : '#4ade80' }}>
                            {diffDisp > 0 ? '+' : ''}{diffDisp} {unit}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                        {new Date(e.recorded_at + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        {isToday && <span style={{ marginLeft: 6, color: '#c8ff00', fontWeight: 700 }}>· Today</span>}
                      </div>
                    </div>
                    <button onClick={() => del(e.id)} disabled={deleting === e.id}
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 10px', color: '#f87171', cursor: 'pointer', fontSize: '.75rem', opacity: deleting === e.id ? 0.5 : 1 }}>
                      {deleting === e.id ? '…' : '✕'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 10 }}>⚖️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No weight logged yet</div>
            <div style={{ fontSize: '.82rem' }}>Log your first entry above to start tracking</div>
          </div>
        )}
      </div>
      <BottomTabs active="progress" />
    </div>
  )
}
