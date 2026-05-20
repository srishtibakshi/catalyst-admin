import Anthropic from '@anthropic-ai/sdk'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntakeResponse {
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

export interface SessionPlan {
  archetype: string
  session_overview: string
  discovery: {
    opening_line: string
    questions: Array<{ question: string; listen_for: string }>
    what_to_probe: string
  }
  knowledge: {
    tools: Array<{
      name: string
      what_it_is: string
      why_for_them: string
      demo_scenario: string
      how_to_introduce: string
      anmol_prep: string
    }>
  }
  close: {
    what_to_leave_with: string
    try_before_next: string
  }
  whatsapp_message: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function firstName(name: string): string {
  return name.trim().split(' ')[0]
}

function confidenceLevel(score: number | null): string {
  if (!score) return 'unknown'
  if (score <= 2) return 'low'
  if (score === 3) return 'medium'
  return 'high'
}

function isAnxious(response: IntakeResponse): boolean {
  const tag = (response.cohort_tag || '').toLowerCase()
  return tag.includes('anxious') || tag.includes('sceptic')
}

function buildPrompt(
  response: IntakeResponse,
  sessionNumber: 1 | 2 | 3,
  previousTranscript?: string
): string {
  const name = firstName(response.respondent_name)
  const confLevel = confidenceLevel(response.q6_confidence)
  const anxious = isAnxious(response)
  const energyList = (response.q7_energy || []).join(', ')
  const outcomesList = (response.q10_outcomes || []).join(', ')

  const baseWhatsapp: Record<1 | 2 | 3, string> = {
    1: `Hey ${name}! Anmol here. I've just gone through your answers properly — already building your first session around what you've shared. Will be in touch very soon to lock in a time.`,
    2: `Hey ${name}! Really enjoyed our first session. I've been going through everything we covered and your next one is already taking shape. Will send a time shortly.`,
    3: `Hey ${name}! You've moved fast. Session 3 is being built around exactly where you are now — this one's about making sure you leave with something that's fully yours. More soon.`,
  }

  const jargonInstruction = confLevel === 'low'
    ? 'Use plain English only. Zero technical jargon — no acronyms, no industry terms. If you must name a tool, explain it in one normal sentence first.'
    : confLevel === 'high'
    ? 'You can use some technical language but keep explanations concrete and practical, not abstract.'
    : 'Keep language accessible but do not over-explain.'

  const sessionFocus = sessionNumber === 1
    ? 'First 30 min = discovery (deeper questions building on what they shared). Last 30 min = introduce 1-2 carefully chosen AI tools relevant to their actual life and context.'
    : sessionNumber === 2
    ? 'Built entirely on the previous session transcript. What landed? What needs deepening? What new tools or practices fit where they actually are now?'
    : 'Empowerment session. They must leave owning something they can use independently without Anmol. Focus on their capability, not more tools.'

  const anxiousInstruction = anxious && sessionNumber === 1
    ? `IMPORTANT: This person is anxious or sceptical about AI. The first half of the discovery section must open by naming and gently addressing their specific worry before introducing any tools. Use their exact words from their form if possible.`
    : ''

  const previousContext = previousTranscript
    ? `\n\n## Previous Session Transcript\n${previousTranscript}\n\nFor session ${sessionNumber}, explicitly build on what happened. Reference specific moments, what clicked, what they said they found useful or confusing. Do NOT repeat tools or concepts they already got.`
    : ''

  return `You are helping Anmol, an AI advisor, prepare bespoke session plans for paid 1:1 training sessions.

## The Client
Name: ${response.respondent_name} (use first name "${name}" throughout)
Email: ${response.respondent_email}
Submitted: ${response.submitted_at}
Cohort: ${response.cohort_tag || 'unknown'}

## Their Form Answers (use their EXACT words — do not paraphrase)
Q1 - What they do: ${response.q1_intro || '(not provided)'}
Q2 - Their world: ${response.q2_world || '(not provided)'}
Q3 - Typical Tuesday: ${response.q3_tuesday || '(not provided)'}
Q4 - First reaction to AI: ${response.q4_ai_reaction || '(not provided)'}
Q5 - AI experience level: ${response.q5_ai_experience || '(not provided)'}
Q6 - Confidence score (1-5): ${response.q6_confidence ?? '(not provided)'}
Q7 - Where energy goes: ${energyList || '(not provided)'}
Q8 - What they dread most: ${response.q8_dread || '(not provided)'}
Q9 - What they'd do with 2 free hours: ${response.q9_two_hours || '(not provided)'}
Q10 - Desired outcomes: ${outcomesList || '(not provided)'}
Q11 - AI worries: ${response.q11_worries || '(not provided)'}
Q12 - What the form won't capture: ${response.q12_wildcard || '(not provided)'}
${previousContext}

## Session ${sessionNumber} Brief
${sessionFocus}

## Language Rules
${jargonInstruction}
${anxiousInstruction}

## What to produce
Return a single JSON object matching this TypeScript interface EXACTLY — no extra text, no markdown code fences, just raw JSON:

{
  "archetype": "2-3 paragraphs written for Anmol to read before the session. Who is this person really? What drives them? What are they afraid of? What is the opportunity for them with AI? Be specific and reference their actual words.",
  "session_overview": "One sentence: what is this specific session designed to do FOR THIS PERSON.",
  "discovery": {
    "opening_line": "The exact first sentence Anmol should say, referencing something specific from their form. Warm, direct, not generic.",
    "questions": [
      {
        "question": "A genuine discovery question tailored to their specific situation",
        "listen_for": "What Anmol should listen for in the answer — what it reveals about how to help them"
      }
    ],
    "what_to_probe": "What underlying theme or blocker Anmol should be listening for throughout discovery"
  },
  "knowledge": {
    "tools": [
      {
        "name": "Tool name",
        "what_it_is": "One sentence, plain English, what this thing actually does. No jargon.",
        "why_for_them": "Why specifically for THIS person — use their words, their world, their Tuesday",
        "demo_scenario": "Exact scenario using their actual context (their job, their dread, their goals)",
        "how_to_introduce": "The exact line Anmol says to introduce this tool in session",
        "anmol_prep": "What Anmol needs to know or try before the session so he can demonstrate confidently"
      }
    ]
  },
  "close": {
    "what_to_leave_with": "What ${name} should walk away from this session with — concrete, specific",
    "try_before_next": "One specific thing they can try before the next session, tied to their actual context"
  },
  "whatsapp_message": "A warm, personal WhatsApp message from Anmol. Base template: '${baseWhatsapp[sessionNumber]}' — but personalise it by weaving in ONE specific detail from their form (a word they used, something they mentioned). Keep it short. No emojis unless naturally fits. Warm but not gushing."
}

Rules:
- Use ${name}'s actual words from their form answers — quote them directly where relevant
- Choose tools based on their Tuesday, their dread, and their desired outcomes — not generic AI tools
- If session ${sessionNumber} > 1 and transcript provided: explicitly reference what happened in the previous session
- The discovery questions must feel like they were written FOR ${name}, not a generic intake
- The demo scenario must use their actual context (their job, their specific situation)
- Return ONLY valid JSON — no prose before or after`
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSessionPlan(
  response: IntakeResponse,
  sessionNumber: 1 | 2 | 3,
  previousTranscript?: string
): Promise<SessionPlan> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  const prompt = buildPrompt(response, sessionNumber, previousTranscript)

  let rawText = ''

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const block = message.content[0]
    if (block.type === 'text') {
      rawText = block.text
    }
  } catch (err) {
    console.error('Claude API error:', err)
    throw new Error('Failed to generate session plan from Claude')
  }

  // Strip any accidental markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  try {
    const plan = JSON.parse(cleaned) as SessionPlan
    return plan
  } catch (parseErr) {
    console.error('JSON parse error. Raw text:', rawText)
    // Graceful fallback
    const name = firstName(response.respondent_name)
    return {
      archetype: `Plan generation encountered an issue. Raw response stored for manual review.\n\n${rawText.slice(0, 500)}`,
      session_overview: `Session ${sessionNumber} plan for ${name} — needs manual review`,
      discovery: {
        opening_line: `Hi ${name}, great to meet you. I've been going through your form answers and I'd love to start by understanding your world a bit better.`,
        questions: [
          {
            question: `Tell me more about your typical Tuesday — what does the first hour of your day look like?`,
            listen_for: `Energy level, autonomy, repetitive vs creative tasks`,
          },
        ],
        what_to_probe: `What is the real blocker between them and feeling confident with AI`,
      },
      knowledge: {
        tools: [
          {
            name: 'ChatGPT / Claude',
            what_it_is: 'An AI assistant you can have a real conversation with — you type, it responds, like a very knowledgeable colleague.',
            why_for_them: `Based on their form, this seems like a natural starting point for ${name}`,
            demo_scenario: `Walk through a scenario from their typical Tuesday`,
            how_to_introduce: `Let me show you something that I think will immediately make sense for your situation.`,
            anmol_prep: `Prepare 2-3 examples relevant to their industry`,
          },
        ],
      },
      close: {
        what_to_leave_with: `A clear sense of what AI can do for them specifically`,
        try_before_next: `Try using an AI assistant for one task from their Tuesday`,
      },
      whatsapp_message: `Hey ${name}! Anmol here. I've been going through your form — really interesting answers. Will be in touch soon to lock in a time for your first session.`,
    }
  }
}
