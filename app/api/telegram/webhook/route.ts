import { NextResponse } from 'next/server'
import { getTop } from '@/lib/leaderboard'
import { GLOBAL_CHAT, escapeHtml, miniAppLink, tgApi } from '@/lib/telegram-server'

interface Update {
  message?: {
    text?: string
    chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' }
    from?: { id: number; first_name: string }
  }
}

const MEDALS = ['🥇', '🥈', '🥉']

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const update = (await req.json().catch(() => null)) as Update | null
  const msg = update?.message
  if (!msg?.text) return NextResponse.json({ ok: true })

  const command = msg.text.trim().split(/\s+/)[0].toLowerCase()
  const [name, target] = command.split('@')
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '').toLowerCase()
  if (target && botUsername && target !== botUsername) return NextResponse.json({ ok: true })

  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'

  if (name === '/play' || name === '/start') {
    await sendPlayButton(msg.chat.id, isGroup, msg.from?.first_name)
  } else if (name === '/leaderboard' || name === '/top') {
    await sendLeaderboard(msg.chat.id, isGroup)
  }

  return NextResponse.json({ ok: true })
}

async function sendPlayButton(chatId: number, isGroup: boolean, firstName?: string) {
  const who = firstName ? escapeHtml(firstName) : 'Survivor'
  const text = `<b>Stranger Run</b>\n${who}, the Demogorgon is hunting. How far can you run?`

  // Telegram only allows web_app buttons in private chats; in groups the Mini App opens through a direct link.
  const groupLink = isGroup ? miniAppLink(chatId) : null
  const appUrl = process.env.TELEGRAM_APP_URL
  let button: Record<string, unknown> | null = null
  if (isGroup && groupLink) button = { text: 'Play Stranger Run', url: groupLink }
  else if (!isGroup && appUrl) button = { text: 'Play Stranger Run', web_app: { url: appUrl } }

  if (!button) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: 'The game is not fully configured yet. The admin needs to set TELEGRAM_BOT_USERNAME and TELEGRAM_APP_SHORTNAME.',
    })
    return
  }

  await tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[button]] },
  })
}

async function sendLeaderboard(chatId: number, isGroup: boolean) {
  const board = await getTop(isGroup ? String(chatId) : GLOBAL_CHAT, 10)
  if (board.length === 0) {
    await tgApi('sendMessage', { chat_id: chatId, text: 'No scores yet. Send /play and set the first record!' })
    return
  }
  const lines = board.map((e, i) => {
    const km = (e.distance / 1000).toFixed(2)
    return `${MEDALS[i] ?? `${e.rank}.`} <b>${escapeHtml(e.name)}</b> - ${e.score.toLocaleString('en-US')} (${km} km)`
  })
  await tgApi('sendMessage', {
    chat_id: chatId,
    text: `<b>Stranger Run leaderboard</b>\n\n${lines.join('\n')}`,
    parse_mode: 'HTML',
  })
}
