import { NextResponse } from 'next/server'
import { tgApi } from '@/lib/telegram-server'

/** Open once in a browser after deploying: /api/telegram/setup?secret=<TELEGRAM_WEBHOOK_SECRET> */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || url.searchParams.get('secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const host = req.headers.get('x-forwarded-host') ?? url.host
  const webhookUrl = `https://${host}/api/telegram/webhook`

  const webhook = await tgApi('setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  })
  const commands = await tgApi('setMyCommands', {
    commands: [
      { command: 'play', description: 'Play Stranger Run' },
      { command: 'leaderboard', description: 'Show the top 10 in this chat' },
    ],
  })

  return NextResponse.json({ ok: !!webhook && !!commands, webhookUrl, webhookSet: !!webhook, commandsSet: !!commands })
}
