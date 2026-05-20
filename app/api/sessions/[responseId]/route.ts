import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateSessionPlan, IntakeResponse } from '@/lib/session-generator'
import { sendPushNotification } from '@/lib/push'

// GET: Fetch all sessions for a response
export async function GET(
  _req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { responseId } = params

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('response_id', responseId)
    .order('session_number', { ascending: true })

  if (error) {
    console.error('Sessions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

// POST: Manually trigger Session 1 plan generation (fallback if webhook didn't fire)
export async function POST(
  req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { responseId } = params

  let body: { response: IntakeResponse }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { response } = body

  // Check if session 1 already exists
  const { data: existing } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('response_id', responseId)
    .eq('session_number', 1)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Session 1 already exists' }, { status: 409 })
  }

  try {
    const plan = await generateSessionPlan(response, 1)

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert({
        response_id: responseId,
        session_number: 1,
        archetype: plan.archetype,
        plan: JSON.stringify(plan),
        whatsapp_message: plan.whatsapp_message,
        status: 'plan_ready',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Session insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    // Notify push subscribers
    const { data: subscriptions } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')

    if (subscriptions && subscriptions.length > 0) {
      await Promise.allSettled(
        subscriptions.map((row: { subscription: Parameters<typeof sendPushNotification>[0] }) =>
          sendPushNotification(
            row.subscription,
            'Session 1 plan ready',
            `Session 1 plan for ${response.respondent_name} is ready`,
            '/admin'
          )
        )
      )
    }

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('Manual plan generation error:', err)
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 })
  }
}
