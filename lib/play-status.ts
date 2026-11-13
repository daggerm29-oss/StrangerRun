import { createHmac, timingSafeEqual } from 'node:crypto'
import { GLOBAL_CHAT, escapeHtml, tgApi, type TgUser } from '@/lib/telegram-server'

/** Handle to the "xyz is playing…" message, signed so a client can only touch the message the server created for it. */
export interface StatusRef {
  messageId: number
  token: string
}

const START_COOLDOWN_MS = 15_000
const lastStart = new Map<string, number>()

function sign(chatId: string, userId: string, messageId: number) {
  const key = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!key) return null
  return createHmac('sha256', key).update(`status:${chatId}:${userId}:${messageId}`).digest('hex')
}

export function verifyStatus(chatId: string, userId: string, ref: unknown): StatusRef | null {
  if (!ref || typeof ref !== 'object') return null
  const { messageId, token } = ref as Partial<StatusRef>
  if (typeof messageId !== 'number' || !Number.isInteger(messageId) || typeof token !== 'string') return null
  const expected = sign(chatId, userId, messageId)
  if (!expected) return null
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { messageId, token }
}

const mention = (user: TgUser) => `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`

/** Posts a quiet, italic "Adam is playing…" line in the group and returns a signed handle to it. */
export async function postPlaying(chatId: string, user: TgUser): Promise<StatusRef | null> {
  if (chatId === GLOBAL_CHAT) return null
  const key = `${chatId}:${user.id}`
  const now = Date.now()
  if (now - (lastStart.get(key) ?? 0) < START_COOLDOWN_MS) return null
  lastStart.set(key, now)
  if (lastStart.size > 500) for (const [k, t] of lastStart) if (now - t > START_COOLDOWN_MS) lastStart.delete(k)

  const msg = await tgApi<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: `<i>${mention(user)} is playing…</i>`,
    parse_mode: 'HTML',
    disable_notification: true,
  })
  if (!msg) return null
  const token = sign(chatId, String(user.id), msg.message_id)
  return token ? { messageId: msg.message_id, token } : null
}

export async function clearStatus(chatId: string, ref: StatusRef) {
  await tgApi('deleteMessage', { chat_id: chatId, message_id: ref.messageId })
}

/** Turns the "is playing…" line into "Adam scored 3,500" for a record, or removes it for an ordinary run. */
export async function finishStatus(chatId: string, user: TgUser, score: number, newRecord: boolean, ref: StatusRef | null) {
  if (chatId === GLOBAL_CHAT) return
  if (!newRecord) {
    if (ref) await clearStatus(chatId, ref)
    return
  }
  const text = `<i>${mention(user)} scored ${score.toLocaleString('en-US')}</i>`
  if (ref) {
    const edited = await tgApi('editMessageText', { chat_id: chatId, message_id: ref.messageId, text, parse_mode: 'HTML' })
    if (edited) return
  }
  await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' })
}
