import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const FORM_LINK = 'https://catalyst-form-rho.vercel.app'

export async function POST(req: NextRequest) {
  const { name, context } = await req.json() as { name: string; context: string }

  const firstName = name.trim().split(' ')[0]

  const prompt = `Write a WhatsApp message from Anmol to ${firstName}. This is the very first message ${firstName} receives. Srishti knows them personally and has passed their details to Anmol.

What Anmol knows about them:
${context || 'No extra context provided.'}

The message must:
- Open with "Hey ${firstName}! I'm Anmol."
- One sentence on why Srishti thought they'd be a good fit for an AI advisory session. Make it specific to what's known about them — not generic. If no context is provided, keep it warm and simple.
- One sentence on what the form is and why it matters: that it means their first session will be built around their actual world, not a generic starting point.
- Include this link on its own line: ${FORM_LINK}
- End with: "No wrong answers."

Rules:
- No double dashes (--). No em dashes (—).
- No filler phrases. No "I hope this finds you well". No "excited to".
- No marketing language. Sound like a person, not a brand.
- Warm, direct. Like a message from someone who actually knows why they're reaching out.
- 4 to 6 sentences total, plus the link on its own line.

Return only the message. Nothing else.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const message = msg.content[0].type === 'text'
      ? msg.content[0].text.trim().replace(/--/g, ',')
      : `Hey ${firstName}! I'm Anmol. Srishti thought we'd be a good fit. Before we meet, could you fill this in? Takes about 5 minutes and means our first session is built around your world, not a generic starting point.\n\n${FORM_LINK}\n\nNo wrong answers.`

    return Response.json({ message })
  } catch (err) {
    console.error('generate-outreach error:', err)
    return Response.json({ error: 'Failed to generate' }, { status: 500 })
  }
}
