import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { session_number, current_message, response } = await req.json()

  const name = (response.respondent_name as string)?.trim().split(' ')[0] || 'there'

  const contextLines = [
    response.q1_intro && `What they do: ${response.q1_intro}`,
    response.q3_tuesday && `Their Tuesday: ${response.q3_tuesday}`,
    response.q8_dread && `What they dread most: ${response.q8_dread}`,
    response.q9_two_hours && `What they'd do with 2 free hours: ${response.q9_two_hours}`,
    response.q11_worries && `AI worries: ${response.q11_worries}`,
    response.q12_wildcard && `What the form won't capture: ${response.q12_wildcard}`,
  ].filter(Boolean).join('\n')

  const sessionHint =
    session_number === 1
      ? `Give a concrete, specific hint at what Session 1 will cover for ${name} — not "building this around you" but something actual, drawn from their context.`
      : session_number === 2
      ? `Reference something real that came up in Session 1 and hint at where Session 2 is going based on that.`
      : `Tell them plainly what Session 3 is for. No hype. Just that it's about making sure they leave with something that's genuinely theirs.`

  const prompt = `Rewrite this WhatsApp message from Anmol to ${name}. It needs to sound like it came from a real person who actually read every word ${name} wrote — not a system message, not a template.

Client context (use this to make the message specific):
${contextLines}

Session: ${session_number}

Current message:
${current_message}

Rules:
- 3 to 5 sentences. This is WhatsApp, not email.
- No double dashes (--). No em dashes (—). Use a comma or a full stop instead.
- Reference something specific ${name} said. Use their actual words or name their actual situation.
- ${sessionHint}
- No filler: no "I wanted to reach out", no "I hope this finds you well", no "excited to".
- No marketing language. No "looking forward to our journey together". None of that.
- Warm but not gushing. Direct. Like someone who knows them.
- Start with "Hey ${name}!" then get straight to it.

Return only the message. No quotes around it. Nothing else.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const newMessage = msg.content[0].type === 'text'
      ? msg.content[0].text.trim().replace(/--/g, ',')
      : current_message

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase
      .from('sessions')
      .update({ whatsapp_message: newMessage })
      .eq('response_id', params.responseId)
      .eq('session_number', session_number)

    return Response.json({ whatsapp_message: newMessage })
  } catch (err) {
    console.error('Regenerate whatsapp error:', err)
    return Response.json({ error: 'Failed to regenerate' }, { status: 500 })
  }
}
