import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { chatMessages, clientContext, sessionSummary } = await req.json()

  const prompt = `You are helping Anmol update his private coaching notes for a client.

## Client context
${clientContext}

## Current session status
${sessionSummary}

## Chat conversation (the brainstorming session)
${chatMessages.map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Anmol' : 'Claude'}: ${m.content}`).join('\n\n')}

---

Based on this brainstorming conversation, write updated coaching notes for this client. These notes should capture:
- Key insights about who this person is and how they think about AI
- What you now understand about their specific situation that the intake form didn't fully capture
- The session strategy direction that emerged from this conversation
- Any specific tools, demos, or angles that were identified as particularly relevant
- What stage they're at in their journey and what the priority is for the next interaction

Write in first-person from Anmol's perspective. Be specific and direct. No headers, no bullet points — just clear, useful paragraphs that Anmol can read before a call. 150-250 words.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const updatedNotes = response.content[0].type === 'text' ? response.content[0].text : ''

    // Save to supabase — update srishti_notes on session 1 (primary notes holder)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, session_number')
      .eq('response_id', params.responseId)
      .order('session_number', { ascending: true })

    if (sessions && sessions.length > 0) {
      const session1 = sessions.find(s => s.session_number === 1) || sessions[0]
      await supabase
        .from('sessions')
        .update({ srishti_notes: updatedNotes })
        .eq('id', session1.id)
    }

    return NextResponse.json({ notes: updatedNotes })
  } catch (err) {
    console.error('update-from-chat error:', err)
    return NextResponse.json({ error: 'Failed to generate update' }, { status: 500 })
  }
}
