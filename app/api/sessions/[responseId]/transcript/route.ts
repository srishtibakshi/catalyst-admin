import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { generateSessionPlan, IntakeResponse } from '@/lib/session-generator'
import { sendPushNotification } from '@/lib/push'

export async function POST(
  req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { responseId } = params

  let body: { session_number: 1 | 2; transcript: string; response: IntakeResponse }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { session_number, transcript, response } = body

  if (!session_number || !transcript || !response) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const nextSessionNumber = (session_number + 1) as 2 | 3

  if (nextSessionNumber > 3) {
    return NextResponse.json({ error: 'No session after session 3' }, { status: 400 })
  }

  try {
    // Update current session with transcript
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({ transcript, status: 'transcript_added' })
      .eq('response_id', responseId)
      .eq('session_number', session_number)

    if (updateError) {
      console.error('Transcript update error:', updateError)
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
    }

    // Generate next session plan
    const plan = await generateSessionPlan(response, nextSessionNumber, transcript)

    const { data: newSession, error: insertError } = await supabaseAdmin
      .from('sessions')
      .insert({
        response_id: responseId,
        session_number: nextSessionNumber,
        archetype: plan.archetype,
        plan: JSON.stringify(plan),
        whatsapp_message: plan.whatsapp_message,
        status: 'plan_ready',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Next session insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save next session' }, { status: 500 })
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
            `Session ${nextSessionNumber} plan ready`,
            `Session ${nextSessionNumber} plan for ${response.respondent_name} is ready`,
            '/admin'
          )
        )
      )
    }

    return NextResponse.json(newSession)
  } catch (err) {
    console.error('Transcript/generate error:', err)
    return NextResponse.json({ error: 'Failed to process transcript' }, { status: 500 })
  }
}
