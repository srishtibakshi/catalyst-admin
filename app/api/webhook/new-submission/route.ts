import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateSessionPlan, IntakeResponse } from '@/lib/session-generator'
import { sendPushNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { type: string; record: IntakeResponse }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.type !== 'INSERT' || !body.record) {
    return NextResponse.json({ error: 'Unexpected payload' }, { status: 400 })
  }

  const record = body.record

  try {
    // Generate Session 1 plan
    const plan = await generateSessionPlan(record, 1)

    // Insert into sessions table
    const { error: insertError } = await supabaseAdmin.from('sessions').insert({
      response_id: record.id,
      session_number: 1,
      archetype: plan.archetype,
      plan: JSON.stringify(plan),
      whatsapp_message: plan.whatsapp_message,
      status: 'plan_ready',
    })

    if (insertError) {
      console.error('Session insert error:', insertError)
    }

    // Fetch push subscriptions and notify
    const { data: subscriptions } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')

    if (subscriptions && subscriptions.length > 0) {
      await Promise.allSettled(
        subscriptions.map((row: { subscription: Parameters<typeof sendPushNotification>[0] }) =>
          sendPushNotification(
            row.subscription,
            'New submission — plan ready',
            `New submission from ${record.respondent_name} — Session 1 plan is ready`,
            '/admin'
          )
        )
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
