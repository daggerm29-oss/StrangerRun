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
  // Telegram shows the most specific scope, so register the list for groups and private chats explicitly
  // (a list set earlier through BotFather in a narrower scope would otherwise hide /leaderboard).
  const commands = [
    { command: 'play', description: 'Play Stranger Run' },
    { command: 'leaderboard', description: 'Show the top 10 in this chat' },
  ]
  const scopes = [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }]
  const results = await Promise.all(scopes.map((scope) => tgApi('setMyCommands', { commands, scope })))
  const commandsSet = results.every(Boolean)

  return NextResponse.json({ ok: !!webhook && commandsSet, webhookUrl, webhookSet: !!webhook, commandsSet })
}
