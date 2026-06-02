import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { messages, clientContext } = await req.json()

  const systemPrompt = `You are Anmol's private AI planning assistant for Catalyst AI — a bespoke 1:1 AI training business.

You help Anmol prepare, customise, and refine session plans for his clients. You have full access to the client's intake form answers and any generated session plans below.

## Current Client Context
${clientContext}

## Your Role
- Answer questions about this specific client based on their intake answers
- Research and recommend AI tools tailored to their exact situation, role, and Tuesday
- Help rewrite or improve WhatsApp messages, discovery questions, session plans
- Suggest demo scenarios using their actual context (their job, their dread, their goals)
- Do live web research when asked about specific tools or workflows
- Be direct and practical — Anmol is a busy operator, not a student

Always refer to the client by their first name. Always ground your answers in what they actually wrote in their form — quote their words back when relevant.`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          tools: [{ type: 'web_search_20260209' as const, name: 'web_search' }],
          messages,
          stream: true,
        })

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err) {
        console.error('Chat stream error:', err)
        controller.enqueue(encoder.encode('\n\n[Error generating response]'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
