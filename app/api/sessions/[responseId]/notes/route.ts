import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { responseId: string } }
) {
  const { responseId } = params

  let body: { notes: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { notes } = body

  // Notes are stored on the session_1 row (tied to person, not specific session)
  const { error } = await supabaseAdmin
    .from('sessions')
    .update({ srishti_notes: notes })
    .eq('response_id', responseId)
    .eq('session_number', 1)

  if (error) {
    console.error('Notes update error:', error)
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
