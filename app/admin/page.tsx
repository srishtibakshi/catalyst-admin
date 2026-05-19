'use client'

import { useState, useEffect, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

// ── Types ────────────────────────────────────────────────
interface Response {
  id: string
  submitted_at: string
  respondent_name: string
  respondent_email: string
  q1_intro: string | null
  q2_world: string | null
  q3_tuesday: string | null
  q4_ai_reaction: string | null
  q5_ai_experience: string | null
  q6_confidence: number | null
  q7_energy: string[] | null
  q8_dread: string | null
  q9_two_hours: string | null
  q10_outcomes: string[] | null
  q11_worries: string | null
  q12_wildcard: string | null
  cohort_tag: string | null
}

// ── Helpers ──────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function cohortClass(tag: string | null) {
  if (!tag) return ''
  return 'cohort-' + tag.replace(/[\s/]+/g, '-')
}

function exportCSV(data: Response[]) {
  const headers = [
    'Submitted','Name','Email','Role','World','Tuesday','AI Reaction',
    'AI Experience','Confidence','Energy Areas','Dread','2 Free Hours',
    'Desired Outcomes','AI Worries','Wildcard','Cohort'
  ]
  const rows = data.map(r => [
    fmtDate(r.submitted_at), r.respondent_name, r.respondent_email,
    r.q1_intro ?? '', r.q2_world ?? '', r.q3_tuesday ?? '',
    r.q4_ai_reaction ?? '', r.q5_ai_experience ?? '',
    r.q6_confidence ?? '', (r.q7_energy ?? []).join(' | '),
    r.q8_dread ?? '', r.q9_two_hours ?? '',
    (r.q10_outcomes ?? []).join(' | '),
    r.q11_worries ?? '', r.q12_wildcard ?? '', r.cohort_tag ?? ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`))

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `catalyst-intake-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ───────────────────────────────────────
export default function AdminDashboard() {
  const [responses, setResponses]   = useState<Response[]>([])
  const [loading, setLoading]       = useState(true)
  const [openId, setOpenId]         = useState<string | null>(null)
  const [filter, setFilter]         = useState<string>('all')
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('intake_responses')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (error) console.error(error)
    else setResponses(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Stats
  const total    = responses.length
  const cohorts  = [...new Set(responses.map(r => r.cohort_tag).filter(Boolean))]
  const thisWeek = responses.filter(r => {
    const d = new Date(r.submitted_at)
    const now = new Date()
    return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000
  }).length

  // Filtered list
  const filtered = filter === 'all'
    ? responses
    : responses.filter(r => r.cohort_tag === filter)

  // Detail section
  const QA = ({ q, a, pills }: { q: string; a: string | string[] | number | null; pills?: boolean }) => {
    if (Array.isArray(a)) {
      return (
        <div className="qa-row">
          <div className="qa-q">{q}</div>
          {a.length > 0 ? (
            <div className="qa-pills">{a.map(v => <span key={v} className="qa-pill">{v}</span>)}</div>
          ) : <div className="qa-a empty">—</div>}
        </div>
      )
    }
    if (typeof a === 'number') {
      return (
        <div className="qa-row">
          <div className="qa-q">{q}</div>
          <div className="confidence-bar">
            <div className="conf-pips">
              {[1,2,3,4,5].map(n => (
                <div key={n} className={`conf-pip${n <= a ? ' filled' : ''}`} />
              ))}
            </div>
            <span className="conf-label">{a} / 5</span>
          </div>
        </div>
      )
    }
    return (
      <div className="qa-row">
        <div className="qa-q">{q}</div>
        <div className={`qa-a${!a ? ' empty' : ''}`}>{a || '—'}</div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-logo">Catalyst<span> AI</span></div>
        <div className="header-actions">
          <button className="btn-sm accent" onClick={() => exportCSV(filtered)}>
            Export CSV
          </button>
          <button className="btn-sm" onClick={load}>↻</button>
          <button className="btn-sm" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-val">{total}</div>
          <div className="stat-label">Total responses</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{thisWeek}</div>
          <div className="stat-label">This week</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{cohorts.length}</div>
          <div className="stat-label">Cohort types</div>
        </div>
      </div>

      {/* Filter */}
      <div className="list-wrap">
        <div className="list-header">
          <div className="list-title">Responses</div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            <option value="all">All cohorts</option>
            {cohorts.map(c => <option key={c!} value={c!}>{c}</option>)}
          </select>
        </div>

        {loading && <div className="loading">Loading responses…</div>}

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <h3>No responses yet</h3>
            <p>Share your form link and responses will appear here.</p>
          </div>
        )}

        {filtered.map(r => (
          <div
            key={r.id}
            className={`response-card${openId === r.id ? ' open' : ''}`}
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
          >
            <div className="card-row">
              <div className="card-avatar">{initials(r.respondent_name)}</div>
              <div className="card-main">
                <div className="card-name">{r.respondent_name}</div>
                <div className="card-email">{r.respondent_email}</div>
              </div>
              <div className="card-right">
                <div className="card-date">{fmtDate(r.submitted_at)}</div>
                {r.cohort_tag && (
                  <span className={`cohort-badge ${cohortClass(r.cohort_tag)}`}>
                    {r.cohort_tag}
                  </span>
                )}
              </div>
            </div>

            {/* Detail panel */}
            {openId === r.id && (
              <div className="detail-panel" onClick={e => e.stopPropagation()}>

                <div className="detail-section">
                  <div className="detail-section-title">About them</div>
                  <QA q="What they do" a={r.q1_intro} />
                  <QA q="Their world" a={r.q2_world} />
                  <QA q="Typical Tuesday" a={r.q3_tuesday} />
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">Their relationship with AI</div>
                  <QA q="First reaction to AI" a={r.q4_ai_reaction} />
                  <QA q="AI experience level" a={r.q5_ai_experience} />
                  <QA q="Confidence talking about AI" a={r.q6_confidence} />
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">Their world & energy</div>
                  <QA q="Where energy goes each week" a={r.q7_energy} />
                  <QA q="What they dread most" a={r.q8_dread} />
                  <QA q="What they'd do with 2 free hours" a={r.q9_two_hours} />
                </div>

                <div className="detail-section">
                  <div className="detail-section-title">What they want</div>
                  <QA q="Desired outcomes from sessions" a={r.q10_outcomes} />
                  <QA q="AI worries" a={r.q11_worries} />
                  <QA q="What the form won't capture" a={r.q12_wildcard} />
                </div>

              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
