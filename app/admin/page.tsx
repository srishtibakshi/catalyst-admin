'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import type { SessionPlan } from '@/lib/session-generator'

// ── Chat types ────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Types ────────────────────────────────────────────────

interface IntakeResponse {
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

interface Session {
  id: string
  response_id: string
  session_number: 1 | 2 | 3
  archetype: string | null
  plan: string | null
  whatsapp_message: string | null
  transcript: string | null
  srishti_notes: string | null
  status: 'generating' | 'plan_ready' | 'transcript_added' | 'complete'
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function cohortClass(tag: string | null) {
  if (!tag) return ''
  return 'cohort-' + tag.replace(/[\s/]+/g, '-')
}

function exportCSV(data: IntakeResponse[]) {
  const headers = [
    'Submitted', 'Name', 'Email', 'Role', 'World', 'Tuesday', 'AI Reaction',
    'AI Experience', 'Confidence', 'Energy Areas', 'Dread', '2 Free Hours',
    'Desired Outcomes', 'AI Worries', 'Wildcard', 'Cohort',
  ]
  const rows = data.map(r => [
    fmtDate(r.submitted_at), r.respondent_name, r.respondent_email,
    r.q1_intro ?? '', r.q2_world ?? '', r.q3_tuesday ?? '',
    r.q4_ai_reaction ?? '', r.q5_ai_experience ?? '',
    r.q6_confidence ?? '', (r.q7_energy ?? []).join(' | '),
    r.q8_dread ?? '', r.q9_two_hours ?? '',
    (r.q10_outcomes ?? []).join(' | '),
    r.q11_worries ?? '', r.q12_wildcard ?? '', r.cohort_tag ?? '',
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

function parsePlan(planStr: string | null): SessionPlan | null {
  if (!planStr) return null
  try {
    return JSON.parse(planStr) as SessionPlan
  } catch {
    return null
  }
}

function sessionStatusLabel(status: Session['status']) {
  switch (status) {
    case 'generating': return 'Generating...'
    case 'plan_ready': return 'Plan ready'
    case 'transcript_added': return 'Transcript added'
    case 'complete': return 'Complete'
    default: return status
  }
}

// ── Sub-components ────────────────────────────────────────

function QA({ q, a }: { q: string; a: string | string[] | number | null }) {
  if (Array.isArray(a)) {
    return (
      <div className="qa-row">
        <div className="qa-q">{q}</div>
        {a.length > 0
          ? <div className="qa-pills">{a.map(v => <span key={v} className="qa-pill">{v}</span>)}</div>
          : <div className="qa-a empty">—</div>}
      </div>
    )
  }
  if (typeof a === 'number') {
    return (
      <div className="qa-row">
        <div className="qa-q">{q}</div>
        <div className="confidence-bar">
          <div className="conf-pips">
            {[1, 2, 3, 4, 5].map(n => (
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

function AnswersTab({ r }: { r: IntakeResponse }) {
  return (
    <>
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
    </>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
      {copied ? '✓ Copied' : (label || 'Copy message')}
    </button>
  )
}

function PlanDisplay({ plan }: { plan: SessionPlan }) {
  return (
    <>
      {plan.session_overview && (
        <div className="session-overview">{plan.session_overview}</div>
      )}

      {/* Opening line */}
      <div className="opening-line-block">
        <div className="opening-line-label">Opening line</div>
        <div className="opening-line-text">&ldquo;{plan.discovery.opening_line}&rdquo;</div>
      </div>

      {/* Discovery */}
      <div className="plan-section">
        <div className="plan-section-title">Discovery questions</div>
        {plan.discovery.questions.map((q, i) => (
          <div key={i} className="discovery-question">
            <div className="dq-text">{i + 1}. {q.question}</div>
            <div className="dq-listen">{q.listen_for}</div>
          </div>
        ))}
        {plan.discovery.what_to_probe && (
          <div className="probe-block">
            <strong>Underlying theme to listen for: </strong>{plan.discovery.what_to_probe}
          </div>
        )}
      </div>

      {/* Tools */}
      {plan.knowledge.tools.length > 0 && (
        <div className="plan-section">
          <div className="plan-section-title">Tools for this session</div>
          {plan.knowledge.tools.map((tool, i) => (
            <div key={i} className="tool-card">
              <div className="tool-name">{tool.name}</div>
              <div className="tool-field">
                <div className="tool-field-label">What it is</div>
                <div className="tool-field-value">{tool.what_it_is}</div>
              </div>
              <div className="tool-field">
                <div className="tool-field-label">Why for them</div>
                <div className="tool-field-value">{tool.why_for_them}</div>
              </div>
              <div className="tool-field">
                <div className="tool-field-label">Demo scenario</div>
                <div className="tool-field-value">{tool.demo_scenario}</div>
              </div>
              <div className="tool-field">
                <div className="tool-field-label">How to introduce</div>
                <div className="tool-field-value" style={{ fontStyle: 'italic' }}>
                  &ldquo;{tool.how_to_introduce}&rdquo;
                </div>
              </div>
              <div className="tool-field">
                <div className="tool-field-label">Anmol prep</div>
                <div className="tool-field-value prep">{tool.anmol_prep}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Close */}
      <div className="plan-section">
        <div className="plan-section-title">Close</div>
        <div className="close-block">
          <div className="close-item">
            <div className="close-item-label">What they leave with</div>
            <div className="close-item-value">{plan.close.what_to_leave_with}</div>
          </div>
          {plan.close.try_before_next && (
            <div className="close-item">
              <div className="close-item-label">Try before next session</div>
              <div className="close-item-value">{plan.close.try_before_next}</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

interface SessionBlockProps {
  sessionNum: 1 | 2 | 3
  session: Session | undefined
  previousSession: Session | undefined
  response: IntakeResponse
  onTranscriptSubmit: (sessionNum: 1 | 2, transcript: string) => Promise<void>
  onGeneratePlan: () => Promise<void>
  onRegenerateWhatsapp: () => Promise<void>
  isGenerating: boolean
  regeneratingWhatsapp: boolean
  transcriptDraft: string
  onTranscriptDraftChange: (val: string) => void
}

function SessionBlock({
  sessionNum,
  session,
  previousSession,
  response,
  onTranscriptSubmit,
  onGeneratePlan,
  onRegenerateWhatsapp,
  isGenerating,
  regeneratingWhatsapp,
  transcriptDraft,
  onTranscriptDraftChange,
}: SessionBlockProps) {
  const [submittingTranscript, setSubmittingTranscript] = useState(false)

  const sessionTitles = {
    1: 'Session 1 — Discovery + First Tools',
    2: 'Session 2 — Deepening',
    3: 'Session 3 — Empowerment',
  }

  // Determine lock state
  const isLocked = sessionNum > 1 && (!previousSession || previousSession.status === 'plan_ready')
  const isGeneratingThis = isGenerating && !session

  // Status for styling
  const statusClass = isLocked ? 'locked' : (session?.status || 'locked')
  const blockClass = `session-block ${isLocked ? 'locked' : (session?.status || '')}`

  const plan = parsePlan(session?.plan || null)

  const canSubmitTranscript =
    session &&
    (session.status === 'plan_ready' || session.status === 'transcript_added') &&
    sessionNum < 3

  const handleTranscriptSubmit = async () => {
    if (!transcriptDraft.trim()) return
    setSubmittingTranscript(true)
    try {
      await onTranscriptSubmit(sessionNum as 1 | 2, transcriptDraft)
    } finally {
      setSubmittingTranscript(false)
    }
  }

  return (
    <div className={blockClass}>
      <div className="session-header">
        <div className="session-title">{sessionTitles[sessionNum]}</div>
        <span className={`session-status ${isLocked ? 'locked' : (session?.status || 'locked')}`}>
          {isGeneratingThis
            ? 'Generating...'
            : isLocked
              ? `Waiting for S${sessionNum - 1} transcript`
              : session
                ? sessionStatusLabel(session.status)
                : 'No plan yet'}
        </span>
      </div>

      {/* Generating state */}
      {isGeneratingThis && (
        <div className="generating-pulse">
          <div className="dots">
            <div className="dot" />
            <div className="dot" />
            <div className="dot" />
          </div>
          <span>Generating session plan with Claude...</span>
        </div>
      )}

      {/* No plan yet — CTA to generate (session 1 only) */}
      {!session && !isGeneratingThis && sessionNum === 1 && (
        <div className="generate-plan-cta">
          <p className="generate-plan-hint">
            Session 1 plan hasn&apos;t been generated yet. This happens automatically via webhook — or you can trigger it manually.
          </p>
          <button
            className="generate-btn"
            onClick={onGeneratePlan}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Session 1 Plan'}
          </button>
        </div>
      )}

      {/* Plan content */}
      {session && plan && !isGeneratingThis && (
        <div className="session-plan-wrap">
          <PlanDisplay plan={plan} />

          {/* WhatsApp message */}
          {session.whatsapp_message && (
            <div className="whatsapp-block">
              <div className="whatsapp-label">WhatsApp message</div>
              <div className="whatsapp-text">
                {regeneratingWhatsapp
                  ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Rewriting...</span>
                  : session.whatsapp_message}
              </div>
              <div className="whatsapp-actions">
                <CopyButton text={session.whatsapp_message} />
                <button
                  className="regen-btn"
                  onClick={onRegenerateWhatsapp}
                  disabled={regeneratingWhatsapp}
                >
                  {regeneratingWhatsapp ? '...' : '↺ Regenerate'}
                </button>
              </div>
            </div>
          )}

          {/* Transcript input (sessions 1 & 2 only) */}
          {canSubmitTranscript && (
            <div className="transcript-block">
              <div className="transcript-label">
                Session {sessionNum} transcript — paste after the session
              </div>
              {session.transcript ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                    Transcript saved. Session {sessionNum + 1} plan has been generated.
                  </div>
                  <details>
                    <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                      View transcript
                    </summary>
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: 'var(--muted)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      maxHeight: 200,
                      overflow: 'auto',
                      background: 'var(--surface2)',
                      padding: 10,
                      borderRadius: 6,
                    }}>
                      {session.transcript}
                    </div>
                  </details>
                </div>
              ) : (
                <>
                  <textarea
                    className="transcript-area"
                    placeholder={`Paste the Session ${sessionNum} transcript here after the call...`}
                    value={transcriptDraft}
                    onChange={e => onTranscriptDraftChange(e.target.value)}
                  />
                  <button
                    className="generate-btn"
                    onClick={handleTranscriptSubmit}
                    disabled={submittingTranscript || !transcriptDraft.trim()}
                  >
                    {submittingTranscript
                      ? 'Saving & generating...'
                      : `Submit transcript + generate Session ${sessionNum + 1} plan`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session with no parseable plan */}
      {session && !plan && !isGeneratingThis && (
        <div className="session-plan-wrap">
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Plan data could not be parsed. Raw status: {session.status}
          </p>
        </div>
      )}

      {/* Locked state */}
      {isLocked && !isGeneratingThis && (
        <div className="locked-msg">
          Complete Session {sessionNum - 1} and submit its transcript to unlock this session plan.
        </div>
      )}
    </div>
  )
}

// ── Journey checkpoints ──────────────────────────────────

interface Checkpoint {
  label: string
  done: boolean
  active: boolean
}

function getSessionCheckpoints(
  sessionNum: 1 | 2 | 3,
  session: Session | undefined,
  nextSession: Session | undefined
): Checkpoint[] {
  const planReady = !!session && session.status !== 'generating'
  const hasTranscript = !!session?.transcript
  const nextGenerated = !!nextSession

  if (sessionNum === 3) {
    return [
      { label: 'Plan ready', done: planReady, active: !planReady },
      { label: 'Session delivered', done: hasTranscript, active: planReady && !hasTranscript },
      { label: 'Journey complete', done: session?.status === 'complete', active: hasTranscript && session?.status !== 'complete' },
    ]
  }

  return [
    { label: 'Plan ready', done: planReady, active: !planReady },
    { label: 'Session delivered', done: hasTranscript, active: planReady && !hasTranscript },
    { label: 'Transcript logged', done: hasTranscript, active: false },
    { label: `Session ${sessionNum + 1} generated`, done: nextGenerated, active: hasTranscript && !nextGenerated },
  ]
}

function CheckpointBar({ checkpoints }: { checkpoints: Checkpoint[] }) {
  return (
    <div className="checkpoint-bar">
      {checkpoints.map((cp, i) => (
        <div key={i} className={`checkpoint${cp.done ? ' done' : cp.active ? ' active' : ''}`}>
          <div className="checkpoint-icon">
            {cp.done ? '✓' : <span className="checkpoint-dot" />}
          </div>
          <div className="checkpoint-label">{cp.label}</div>
          {i < checkpoints.length - 1 && <div className="checkpoint-line" />}
        </div>
      ))}
    </div>
  )
}

// ── Session tab content ───────────────────────────────────

interface SessionTabContentProps {
  sessionNum: 1 | 2 | 3
  session: Session | undefined
  nextSession: Session | undefined
  response: IntakeResponse
  isLocked: boolean
  isGenerating: boolean
  regeneratingWhatsapp: boolean
  transcriptDraft: string
  onTranscriptDraftChange: (val: string) => void
  onGeneratePlan: () => Promise<void>
  onTranscriptSubmit: (sessionNum: 1 | 2, transcript: string) => Promise<void>
  onRegenerateWhatsapp: () => Promise<void>
}

function SessionTabContent({
  sessionNum, session, nextSession, response, isLocked, isGenerating,
  regeneratingWhatsapp, transcriptDraft, onTranscriptDraftChange,
  onGeneratePlan, onTranscriptSubmit, onRegenerateWhatsapp,
}: SessionTabContentProps) {
  const [submittingTranscript, setSubmittingTranscript] = useState(false)
  const plan = parsePlan(session?.plan || null)
  const checkpoints = getSessionCheckpoints(sessionNum, session, nextSession)
  const canAddTranscript = !!session && session.status !== 'generating' && sessionNum < 3

  const handleSubmit = async () => {
    if (!transcriptDraft.trim()) return
    setSubmittingTranscript(true)
    try {
      await onTranscriptSubmit(sessionNum as 1 | 2, transcriptDraft)
    } finally {
      setSubmittingTranscript(false)
    }
  }

  if (isLocked) {
    return (
      <div className="session-tab-locked">
        <div className="locked-icon">◎</div>
        <div className="locked-title">Session {sessionNum} locked</div>
        <div className="locked-sub">
          Submit the Session {sessionNum - 1} transcript to generate this plan.
        </div>
      </div>
    )
  }

  return (
    <div className="session-tab-content">
      <CheckpointBar checkpoints={checkpoints} />

      {/* Generating */}
      {isGenerating && !session && (
        <div className="generating-pulse" style={{ padding: '24px 0' }}>
          <div className="dots">
            <div className="dot" /><div className="dot" /><div className="dot" />
          </div>
          <span>Generating plan with Claude...</span>
        </div>
      )}

      {/* No plan yet — S1 only */}
      {!session && !isGenerating && sessionNum === 1 && (
        <div className="generate-plan-cta">
          <p className="generate-plan-hint">
            Session 1 plan hasn&apos;t been generated yet. This normally happens automatically on form submission.
          </p>
          <button className="generate-btn" onClick={onGeneratePlan}>
            Generate Session 1 Plan
          </button>
        </div>
      )}

      {/* Plan content */}
      {session && plan && (
        <div className="session-plan-wrap">
          <PlanDisplay plan={plan} />

          {/* WhatsApp block */}
          {session.whatsapp_message && (
            <div className="whatsapp-block">
              <div className="whatsapp-label">WhatsApp message</div>
              <div className="whatsapp-text">
                {regeneratingWhatsapp
                  ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Rewriting...</span>
                  : session.whatsapp_message}
                {!regeneratingWhatsapp && (
                  <div className="whatsapp-link-preview">{CALENDLY_LINKS[sessionNum]}</div>
                )}
              </div>
              <div className="whatsapp-actions">
                <CopyButton text={`${session.whatsapp_message}\n\n${CALENDLY_LINKS[sessionNum]}`} label="Copy with link" />
                <button className="regen-btn" onClick={onRegenerateWhatsapp} disabled={regeneratingWhatsapp}>
                  {regeneratingWhatsapp ? '...' : '↺ Regenerate'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calendly booking link */}
      {session && plan && (
        <div className="calendly-block">
          <a
            href={CALENDLY_LINKS[sessionNum]}
            target="_blank"
            rel="noopener noreferrer"
            className="calendly-btn"
          >
            <span className="calendly-icon">📅</span>
            Book Session {sessionNum} on Calendly
          </a>
        </div>
      )}

      {/* No parseable plan */}
      {session && !plan && !isGenerating && (
        <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--muted)' }}>
          Plan data could not be parsed. Status: {session.status}
        </div>
      )}

      {/* Transcript section — always at the bottom if applicable */}
      {canAddTranscript && (
        <div className="transcript-block">
          <div className="transcript-label">
            Session {sessionNum} transcript
          </div>
          {session?.transcript ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
                ✓ Transcript saved — Session {sessionNum + 1} generated
              </div>
              <details>
                <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                  View transcript
                </summary>
                <div style={{
                  marginTop: 8, fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap',
                  lineHeight: 1.6, maxHeight: 200, overflow: 'auto',
                  background: 'var(--surface2)', padding: 10, borderRadius: 6,
                }}>
                  {session.transcript}
                </div>
              </details>
            </div>
          ) : (
            <>
              <textarea
                className="transcript-area"
                placeholder={`Paste the Session ${sessionNum} transcript after the call...`}
                value={transcriptDraft}
                onChange={e => onTranscriptDraftChange(e.target.value)}
              />
              <button
                className="generate-btn"
                onClick={handleSubmit}
                disabled={submittingTranscript || !transcriptDraft.trim()}
              >
                {submittingTranscript
                  ? 'Saving & generating next plan...'
                  : `Submit transcript → unlock Session ${sessionNum + 1}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Archetype tab ─────────────────────────────────────────

function ArchetypeTab({
  response, sessions, notes, notesSaving, onNotesChange,
}: {
  response: IntakeResponse
  sessions: Session[]
  notes: string
  notesSaving: boolean
  onNotesChange: (val: string) => void
}) {
  const session1 = sessions.find(s => s.session_number === 1)
  const session2 = sessions.find(s => s.session_number === 2)
  const session3 = sessions.find(s => s.session_number === 3)

  const archetype = session1?.archetype || parsePlan(session1?.plan || null)?.archetype || null

  const stageLabel = (() => {
    if (session3?.transcript) return 'Journey complete'
    if (session3) return 'Session 3 in progress'
    if (session2?.transcript) return 'Awaiting Session 3 plan'
    if (session2) return 'Session 2 in progress'
    if (session1?.transcript) return 'Awaiting Session 2 plan'
    if (session1) return 'Session 1 in progress'
    return 'Not started'
  })()

  const completedCount = [session1, session2, session3].filter(s => !!s?.transcript).length

  return (
    <div className="archetype-tab-content">
      {/* Stage indicator */}
      <div className="journey-stage">
        <div className="journey-stage-pips">
          {[1, 2, 3].map(n => {
            const s = [session1, session2, session3][n - 1]
            const isDone = !!s?.transcript
            const isActive = !!s && !s.transcript
            return (
              <div key={n} className={`journey-stage-pip${isDone ? ' done' : isActive ? ' active' : ''}`}>
                {isDone ? '✓' : n}
              </div>
            )
          })}
        </div>
        <div className="journey-stage-label">{stageLabel}</div>
        {completedCount > 0 && (
          <div className="journey-stage-count">{completedCount} of 3 sessions complete</div>
        )}
      </div>

      {/* Archetype */}
      {archetype ? (
        <div className="archetype-block">
          <div className="archetype-label">Who they are</div>
          <div className="archetype-text">{archetype}</div>
        </div>
      ) : (
        <div className="archetype-placeholder">
          Archetype appears once Session 1 plan is generated.
        </div>
      )}

      {/* Notes */}
      <div className="notes-block">
        <div className="notes-label">Your context</div>
        <textarea
          className="notes-textarea"
          placeholder="Things the form didn't capture — impressions from discovery, context from Srishti, relevant background..."
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
        />
        {notesSaving && <div className="notes-saving">Saving...</div>}
      </div>
    </div>
  )
}

// ── Journey tab (outer shell with inner tabs) ─────────────

interface JourneyTabProps {
  response: IntakeResponse
  sessions: Session[]
  onSessionsUpdate: (sessions: Session[]) => void
  generatingFor: string | null
  setGeneratingFor: (id: string | null) => void
}

type JourneyInnerTab = 'archetype' | 's1' | 's2' | 's3'

function JourneyTab({ response, sessions, onSessionsUpdate, generatingFor, setGeneratingFor }: JourneyTabProps) {
  const [innerTab, setInnerTab] = useState<JourneyInnerTab>('archetype')
  const [notes, setNotes] = useState(sessions.find(s => s.session_number === 1)?.srishti_notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transcriptDrafts, setTranscriptDrafts] = useState<Record<number, string>>({})
  const [regeneratingWhatsapp, setRegeneratingWhatsapp] = useState<Record<number, boolean>>({})

  const session1 = sessions.find(s => s.session_number === 1)
  const session2 = sessions.find(s => s.session_number === 2)
  const session3 = sessions.find(s => s.session_number === 3)

  // Sync notes when sessions prop updates (e.g. after chat-to-journey update)
  useEffect(() => {
    const n = sessions.find(s => s.session_number === 1)?.srishti_notes || ''
    setNotes(n)
  }, [sessions])

  const handleNotesChange = (val: string) => {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true)
      try {
        await fetch(`/api/sessions/${response.id}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: val }),
        })
      } finally {
        setNotesSaving(false)
      }
    }, 1200)
  }

  const handleGenerateS1 = async () => {
    setGeneratingFor(response.id)
    setInnerTab('s1')
    try {
      const res = await fetch(`/api/sessions/${response.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (res.ok) {
        const newSession = await res.json() as Session
        onSessionsUpdate([newSession, ...sessions.filter(s => s.session_number !== 1)])
      }
    } finally {
      setGeneratingFor(null)
    }
  }

  const handleRegenerateWhatsapp = async (sessionNum: 1 | 2 | 3) => {
    const session = sessions.find(s => s.session_number === sessionNum)
    if (!session?.whatsapp_message) return
    setRegeneratingWhatsapp(prev => ({ ...prev, [sessionNum]: true }))
    try {
      const res = await fetch(`/api/sessions/${response.id}/regenerate-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_number: sessionNum, current_message: session.whatsapp_message, response }),
      })
      if (res.ok) {
        const { whatsapp_message } = await res.json() as { whatsapp_message: string }
        onSessionsUpdate(sessions.map(s =>
          s.session_number === sessionNum ? { ...s, whatsapp_message } : s
        ))
      }
    } finally {
      setRegeneratingWhatsapp(prev => ({ ...prev, [sessionNum]: false }))
    }
  }

  const handleTranscriptSubmit = async (sessionNum: 1 | 2, transcript: string) => {
    const res = await fetch(`/api/sessions/${response.id}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_number: sessionNum, transcript, response }),
    })
    if (res.ok) {
      const newSession = await res.json() as Session
      const updatedSessions = sessions.map(s =>
        s.session_number === sessionNum ? { ...s, transcript, status: 'transcript_added' as const } : s
      )
      onSessionsUpdate([...updatedSessions, newSession])
      // Auto-advance to next session tab
      setTimeout(() => setInnerTab(sessionNum === 1 ? 's2' : 's3'), 400)
    }
  }

  const s1Done = !!session1?.transcript
  const s2Done = !!session2?.transcript

  const tabMeta: { id: JourneyInnerTab; label: string; locked: boolean; hasPlan: boolean }[] = [
    { id: 'archetype', label: 'Archetype', locked: false, hasPlan: false },
    { id: 's1', label: 'Session 1', locked: false, hasPlan: !!session1 },
    { id: 's2', label: 'Session 2', locked: !s1Done, hasPlan: !!session2 },
    { id: 's3', label: 'Session 3', locked: !s2Done, hasPlan: !!session3 },
  ]

  return (
    <div className="journey-tabbed">
      {/* Inner tab bar */}
      <div className="journey-inner-tabs">
        {tabMeta.map(t => (
          <button
            key={t.id}
            className={`journey-inner-tab${innerTab === t.id ? ' active' : ''}${t.locked ? ' locked' : ''}`}
            onClick={() => !t.locked && setInnerTab(t.id)}
            disabled={t.locked}
          >
            {t.locked && <span className="jtab-lock">◎</span>}
            {t.label}
            {t.hasPlan && !t.locked && (
              <span className={`jtab-dot${
                t.id === 's1' && s1Done ? ' done' :
                t.id === 's2' && s2Done ? ' done' :
                t.id === 's3' && session3?.status === 'complete' ? ' done' :
                ' ready'
              }`} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="journey-inner-content">
        {innerTab === 'archetype' && (
          <ArchetypeTab
            response={response}
            sessions={sessions}
            notes={notes}
            notesSaving={notesSaving}
            onNotesChange={handleNotesChange}
          />
        )}
        {(['s1', 's2', 's3'] as const).map((tabId, i) => {
          const num = (i + 1) as 1 | 2 | 3
          const session = [session1, session2, session3][i]
          const nextSession = [session2, session3, undefined][i]
          const isLocked = tabMeta[i + 1].locked
          return innerTab === tabId ? (
            <SessionTabContent
              key={tabId}
              sessionNum={num}
              session={session}
              nextSession={nextSession}
              response={response}
              isLocked={isLocked}
              isGenerating={generatingFor === response.id && !session}
              regeneratingWhatsapp={!!regeneratingWhatsapp[num]}
              transcriptDraft={transcriptDrafts[num] || ''}
              onTranscriptDraftChange={val => setTranscriptDrafts(prev => ({ ...prev, [num]: val }))}
              onGeneratePlan={handleGenerateS1}
              onTranscriptSubmit={handleTranscriptSubmit}
              onRegenerateWhatsapp={() => handleRegenerateWhatsapp(num)}
            />
          ) : null
        })}
      </div>
    </div>
  )
}

// ── Session dots ─────────────────────────────────────────

function SessionDots({ sessions }: { sessions: Session[] }) {
  const getDotClass = (num: 1 | 2 | 3) => {
    const s = sessions.find(s => s.session_number === num)
    if (!s) return 'session-dot'
    if (s.status === 'generating') return 'session-dot generating'
    if (s.status === 'complete') return 'session-dot complete'
    if (s.status === 'transcript_added') return 'session-dot complete'
    if (s.status === 'plan_ready') return 'session-dot plan-ready'
    return 'session-dot'
  }

  return (
    <div className="card-sessions">
      {([1, 2, 3] as const).map(n => (
        <div key={n} className={getDotClass(n)} title={`Session ${n}`} />
      ))}
    </div>
  )
}

// ── Chat Tab ─────────────────────────────────────────────

function buildClientContext(response: IntakeResponse, sessions: Session[]): string {
  const plan1 = parsePlan(sessions.find(s => s.session_number === 1)?.plan || null)
  const plan2 = parsePlan(sessions.find(s => s.session_number === 2)?.plan || null)
  const plan3 = parsePlan(sessions.find(s => s.session_number === 3)?.plan || null)
  const transcript1 = sessions.find(s => s.session_number === 1)?.transcript
  const transcript2 = sessions.find(s => s.session_number === 2)?.transcript
  const notes = sessions.find(s => s.session_number === 1)?.srishti_notes

  return `### Client: ${response.respondent_name}
Email: ${response.respondent_email}
Cohort: ${response.cohort_tag || 'unknown'}
Submitted: ${response.submitted_at}

### Intake Form Answers
- What they do: ${response.q1_intro || '—'}
- Their world: ${response.q2_world || '—'}
- Typical Tuesday: ${response.q3_tuesday || '—'}
- First reaction to AI: ${response.q4_ai_reaction || '—'}
- AI experience: ${response.q5_ai_experience || '—'}
- Confidence (1-5): ${response.q6_confidence ?? '—'}
- Where energy goes: ${(response.q7_energy || []).join(', ') || '—'}
- What they dread: ${response.q8_dread || '—'}
- 2 free hours: ${response.q9_two_hours || '—'}
- Desired outcomes: ${(response.q10_outcomes || []).join(', ') || '—'}
- AI worries: ${response.q11_worries || '—'}
- Wildcard: ${response.q12_wildcard || '—'}

${notes ? `### Anmol's Notes\n${notes}\n` : ''}
${plan1 ? `### Session 1 Plan (Generated)\nArchetype: ${plan1.archetype}\nOverview: ${plan1.session_overview}\nTools: ${plan1.knowledge.tools.map(t => t.name).join(', ')}\n` : ''}
${transcript1 ? `### Session 1 Transcript\n${transcript1}\n` : ''}
${plan2 ? `### Session 2 Plan (Generated)\nArchetype: ${plan2.archetype}\nOverview: ${plan2.session_overview}\nTools: ${plan2.knowledge.tools.map(t => t.name).join(', ')}\n` : ''}
${transcript2 ? `### Session 2 Transcript\n${transcript2}\n` : ''}
${plan3 ? `### Session 3 Plan (Generated)\nOverview: ${plan3.session_overview}\n` : ''}`
}

const CALENDLY_LINKS: Record<1 | 2 | 3, string> = {
  1: 'https://calendly.com/anmoluxplorer/ai-discovery-session-with-anmol-60min-clone',
  2: 'https://calendly.com/anmoluxplorer/going-deeper-with-ai-session-with-anmol-60min-clone',
  3: 'https://calendly.com/anmoluxplorer/30min',
}

const QUICK_PROMPTS = [
  'What tools should I demo in Session 1?',
  'Research the best AI tools for their role',
  'Rewrite the WhatsApp message',
  'What should I listen for in discovery?',
  'Build a custom workflow for their Tuesday',
  'What are their biggest AI opportunities?',
]

interface ChatTabProps {
  response: IntakeResponse
  sessions: Session[]
  messages: ChatMessage[]
  onMessagesChange: (msgs: ChatMessage[]) => void
  onJourneyUpdated: (notes: string) => void
}

function buildSessionSummary(sessions: Session[]): string {
  if (sessions.length === 0) return 'No sessions started yet.'
  return sessions.map(s => {
    const statusMap: Record<string, string> = {
      generating: 'plan generating',
      plan_ready: 'plan ready, not yet delivered',
      transcript_added: 'session delivered, transcript logged',
      complete: 'complete',
    }
    return `Session ${s.session_number}: ${statusMap[s.status] || s.status}`
  }).join('\n')
}

function ChatTab({ response, sessions, messages, onMessagesChange, onJourneyUpdated }: ChatTabProps) {
  const [input, setInput] = useState('')
  const [updatingJourney, setUpdatingJourney] = useState(false)
  const [journeyUpdated, setJourneyUpdated] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const firstName = response.respondent_name.trim().split(' ')[0]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    onMessagesChange(newMessages)
    setInput('')
    setStreaming(true)

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    onMessagesChange([...newMessages, assistantMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          clientContext: buildClientContext(response, sessions),
        }),
      })

      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value)
        onMessagesChange([...newMessages, { role: 'assistant', content: accumulated }])
      }
    } catch {
      onMessagesChange([...newMessages, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setStreaming(false)
    }
  }

  const handleUpdateJourney = async () => {
    if (!messages.length || updatingJourney) return
    setUpdatingJourney(true)
    try {
      const res = await fetch(`/api/sessions/${response.id}/update-from-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatMessages: messages,
          clientContext: buildClientContext(response, sessions),
          sessionSummary: buildSessionSummary(sessions),
        }),
      })
      if (res.ok) {
        const data = await res.json() as { notes: string }
        onJourneyUpdated(data.notes)
        setJourneyUpdated(true)
        setTimeout(() => setJourneyUpdated(false), 4000)
      }
    } finally {
      setUpdatingJourney(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="chat-wrap">
      {messages.length === 0 && (
        <div className="chat-empty">
          <div className="chat-empty-title">Plan {firstName}&apos;s journey</div>
          <div className="chat-empty-sub">Ask anything about {firstName} — tools, research, session planning, WhatsApp messages.</div>
          <div className="chat-quick-prompts">
            {QUICK_PROMPTS.map(p => (
              <button key={p} className="quick-prompt" onClick={() => sendMessage(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
              <div className="chat-msg-role">{msg.role === 'user' ? 'You' : 'Claude'}</div>
              <div className="chat-msg-content">{msg.content}{streaming && i === messages.length - 1 && msg.role === 'assistant' && <span className="chat-cursor" />}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {messages.length > 1 && (
        <div className="chat-actions-bar">
          <button
            className={`chat-update-journey${journeyUpdated ? ' done' : ''}`}
            onClick={handleUpdateJourney}
            disabled={updatingJourney || streaming}
          >
            {updatingJourney ? '⟳ Updating…' : journeyUpdated ? '✓ Journey updated' : '↗ Apply to journey notes'}
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={`Ask about ${firstName}...`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={streaming}
        />
        <button
          className="chat-send"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || streaming}
        >
          {streaming ? '…' : '↑'}
        </button>
      </div>
    </div>
  )
}

// ── New Prospect Panel ───────────────────────────────────

function NewProspectPanel({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [context, setContext] = useState('')
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    if (!name.trim()) return
    setGenerating(true)
    setMessage('')
    try {
      const res = await fetch('/api/prospects/generate-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), context: context.trim() }),
      })
      if (res.ok) {
        const data = await res.json() as { message: string }
        setMessage(data.message)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback */ }
  }

  return (
    <div className="prospect-overlay" onClick={onClose}>
      <div className="prospect-panel" onClick={e => e.stopPropagation()}>
        <div className="prospect-header">
          <div className="prospect-title">New prospect</div>
          <button className="prospect-close" onClick={onClose}>✕</button>
        </div>

        <div className="prospect-body">
          <div className="prospect-field">
            <label className="prospect-label">Their name</label>
            <input
              className="prospect-input"
              placeholder="e.g. Priya Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !generating && name.trim() && handleGenerate()}
            />
          </div>

          <div className="prospect-field">
            <label className="prospect-label">Context from Srishti</label>
            <textarea
              className="prospect-textarea"
              placeholder="What do you know about them? Their job, how Srishti knows them, why they might be a good fit, anything relevant..."
              value={context}
              onChange={e => setContext(e.target.value)}
              rows={4}
            />
          </div>

          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={generating || !name.trim()}
          >
            {generating ? 'Generating...' : message ? '↺ Regenerate message' : 'Generate message'}
          </button>

          {message && (
            <div className="prospect-message-block">
              <div className="prospect-message-label">WhatsApp message to send</div>
              <div className="prospect-message-text">{message}</div>
              <button
                className={`copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '✓ Copied' : 'Copy message'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Row session dots ─────────────────────────────────────

function RowDots({ sessions }: { sessions: Session[] }) {
  const dotClass = (num: 1 | 2 | 3) => {
    const s = sessions.find(s => s.session_number === num)
    if (!s) return 'row-dot'
    if (s.status === 'generating') return 'row-dot generating'
    if (s.status === 'complete' || s.status === 'transcript_added') return 'row-dot complete'
    if (s.status === 'plan_ready') return 'row-dot ready'
    return 'row-dot'
  }
  return (
    <div className="row-sessions">
      {([1, 2, 3] as const).map(n => <div key={n} className={dotClass(n)} title={`S${n}`} />)}
    </div>
  )
}

// ── Main component ───────────────────────────────────────

export default function AdminDashboard() {
  const [responses, setResponses] = useState<IntakeResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  // Journey state
  const [sessionsMap, setSessionsMap] = useState<Record<string, Session[]>>({})
  const [activeTab, setActiveTab] = useState<Record<string, 'answers' | 'journey' | 'chat'>>({})
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [loadedSessions, setLoadedSessions] = useState<Set<string>>(new Set())

  const [chatMap, setChatMap] = useState<Record<string, ChatMessage[]>>({})
  const [showNewProspect, setShowNewProspect] = useState(false)

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

  useEffect(() => {
    async function registerPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.ready
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          })
        }
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        })
      } catch { /* silent fail */ }
    }
    registerPush()
  }, [])

  const loadSessions = useCallback(async (responseId: string) => {
    if (loadedSessions.has(responseId)) return
    try {
      const res = await fetch(`/api/sessions/${responseId}`)
      if (res.ok) {
        const data = await res.json() as Session[]
        setSessionsMap(prev => ({ ...prev, [responseId]: data }))
        setLoadedSessions(prev => new Set([...prev, responseId]))
        if (data.length > 0) {
          setActiveTab(prev => ({ ...prev, [responseId]: 'journey' }))
        }
      }
    } catch { /* silent fail */ }
  }, [loadedSessions])

  const handleSelectClient = (id: string) => {
    setSelectedId(id)
    loadSessions(id)
  }

  const updateSessionsForResponse = (responseId: string, sessions: Session[]) => {
    setSessionsMap(prev => ({ ...prev, [responseId]: sessions }))
  }

  const total = responses.length
  const cohorts = [...new Set(responses.map(r => r.cohort_tag).filter(Boolean))]
  const thisWeek = responses.filter(r => {
    const d = new Date(r.submitted_at)
    const now = new Date()
    return (now.getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000
  }).length

  const filtered = responses
    .filter(r => filter === 'all' || r.cohort_tag === filter)
    .filter(r => !search || r.respondent_name.toLowerCase().includes(search.toLowerCase()) || r.respondent_email.toLowerCase().includes(search.toLowerCase()))

  const selected = responses.find(r => r.id === selectedId) ?? null
  const selectedSessions = selectedId ? (sessionsMap[selectedId] || []) : []
  const selectedTab = selectedId ? (activeTab[selectedId] || 'answers') : 'answers'

  return (
    <div className="admin-shell">
      {showNewProspect && <NewProspectPanel onClose={() => setShowNewProspect(false)} />}

      {/* Top bar — spans full width */}
      <div className="main-topbar">
        <div className="topbar-logo">Catalyst<span> AI</span></div>

        <div className="topbar-center">
          <input
            className="topbar-search"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="topbar-actions">
          <div className="topbar-stats">
            <div className="topbar-stat">
              <span className="topbar-stat-val">{total}</span>
              <span className="topbar-stat-label">clients</span>
            </div>
            <div className="topbar-stat">
              <span className="topbar-stat-val">{thisWeek}</span>
              <span className="topbar-stat-label">this week</span>
            </div>
          </div>
          <button className="btn-sm accent" onClick={() => setShowNewProspect(true)}>+ Prospect</button>
          <button className="btn-sm" onClick={() => exportCSV(filtered)}>Export</button>
          <button className="btn-sm" onClick={load}>↻</button>
          <button className="btn-sm" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* Client list panel */}
      <div className="client-list-panel">
        <div className="list-panel-header">
          <div className="list-panel-meta">
            <div className="list-panel-title">Clients</div>
            <div className="list-panel-count">{filtered.length}</div>
          </div>
          <select
            className="list-panel-filter"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All cohorts</option>
            {cohorts.map(c => <option key={c!} value={c!}>{c}</option>)}
          </select>
        </div>

        <div className="client-rows">
          {loading && <div className="loading">Loading…</div>}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              {search ? 'No matches' : 'No responses yet'}
            </div>
          )}

          {filtered.map(r => {
            const sessions = sessionsMap[r.id] || []
            return (
              <div
                key={r.id}
                className={`client-row${selectedId === r.id ? ' selected' : ''}`}
                onClick={() => handleSelectClient(r.id)}
              >
                <div className="row-avatar">{initials(r.respondent_name)}</div>
                <div className="row-body">
                  <div className="row-name">{r.respondent_name}</div>
                  <div className="row-sub">
                    <span className="row-date">{fmtDate(r.submitted_at)}</span>
                    {r.cohort_tag && (
                      <span className={`cohort-badge ${cohortClass(r.cohort_tag)}`} style={{ fontSize: 9, padding: '1px 5px' }}>
                        {r.cohort_tag}
                      </span>
                    )}
                  </div>
                  <RowDots sessions={sessions} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail area */}
      <div className="detail-area">
        {!selected ? (
          <div className="detail-empty">
            <div className="detail-empty-icon">←</div>
            <div className="detail-empty-title">Select a client</div>
            <div className="detail-empty-sub">Choose someone from the list to view their intake answers, session journey, and AI chat.</div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="detail-header">
              <div className="detail-avatar">{initials(selected.respondent_name)}</div>
              <div className="detail-identity">
                <div className="detail-name">{selected.respondent_name}</div>
                <div className="detail-email">{selected.respondent_email}</div>
                <div className="detail-meta">
                  {selected.cohort_tag && (
                    <span className={`cohort-badge ${cohortClass(selected.cohort_tag)}`}>
                      {selected.cohort_tag}
                    </span>
                  )}
                  {selected.q6_confidence != null && (
                    <div className="detail-conf">
                      {[1,2,3,4,5].map(n => (
                        <div key={n} className={`detail-conf-pip${n <= (selected.q6_confidence ?? 0) ? ' filled' : ''}`} />
                      ))}
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
                        {selected.q6_confidence}/5 confidence
                      </span>
                    </div>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(selected.submitted_at)}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="detail-tabs">
              <button
                className={`detail-tab${selectedTab === 'answers' ? ' active' : ''}`}
                onClick={() => setActiveTab(prev => ({ ...prev, [selected.id]: 'answers' }))}
              >
                Intake answers
              </button>
              <button
                className={`detail-tab${selectedTab === 'journey' ? ' active' : ''}`}
                onClick={() => setActiveTab(prev => ({ ...prev, [selected.id]: 'journey' }))}
              >
                Journey
              </button>
              <button
                className={`detail-tab${selectedTab === 'chat' ? ' active' : ''}`}
                onClick={() => setActiveTab(prev => ({ ...prev, [selected.id]: 'chat' }))}
              >
                Chat
              </button>
            </div>

            {/* Tab content */}
            <div className="detail-content">
              {selectedTab === 'answers' && <AnswersTab r={selected} />}

              {selectedTab === 'journey' && (
                <JourneyTab
                  response={selected}
                  sessions={selectedSessions}
                  onSessionsUpdate={updated => updateSessionsForResponse(selected.id, updated)}
                  generatingFor={generatingFor}
                  setGeneratingFor={setGeneratingFor}
                />
              )}

              {selectedTab === 'chat' && (
                <ChatTab
                  response={selected}
                  sessions={selectedSessions}
                  messages={chatMap[selected.id] || []}
                  onMessagesChange={msgs => setChatMap(prev => ({ ...prev, [selected.id]: msgs }))}
                  onJourneyUpdated={notes => {
                    // Update session 1 notes in sessionsMap so Journey tab reflects it immediately
                    setSessionsMap(prev => {
                      const existing = prev[selected.id] || []
                      const updated = existing.map(s =>
                        s.session_number === 1 ? { ...s, srishti_notes: notes } : s
                      )
                      return { ...prev, [selected.id]: updated }
                    })
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Utils ─────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}
