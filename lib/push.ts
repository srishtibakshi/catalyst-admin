import webpush from 'web-push'

let vapidInitialised = false

function ensureVapid() {
  if (vapidInitialised) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  vapidInitialised = true
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
}

export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  ensureVapid()
  const payload = JSON.stringify({ title, body, url: url || '/admin' })
  try {
    await webpush.sendNotification(subscription, payload)
  } catch (err: unknown) {
    // 410 Gone = subscription expired, log and move on
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
      console.warn('Push subscription expired (410):', subscription.endpoint)
    } else {
      console.error('Push notification error:', err)
      throw err
    }
  }
}
