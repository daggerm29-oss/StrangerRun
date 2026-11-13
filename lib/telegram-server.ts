import { createHmac, timingSafeEqual } from 'node:crypto'

export const GLOBAL_CHAT = '0'
const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24

export interface TgUser {
  id: number
  first_name: string
  username?: string
}

export interface VerifiedInitData {
  user: TgUser
  /** group chat id (or GLOBAL_CHAT) decoded from the signed start_param */
  chatId: string
}

/** Group chat ids are negative; Telegram start params only allow [A-Za-z0-9_-], so "-100123" becomes "n100123". */
export function encodeChatParam(chatId: number | string) {
  const s = String(chatId)
  return s.startsWith('-') ? `n${s.slice(1)}` : `p${s}`
}

export function decodeChatParam(param: string | null | undefined) {
  if (!param) return GLOBAL_CHAT
  const m = /^([np])(\d{1,20})$/.exec(param)
  if (!m) return GLOBAL_CHAT
  return m[1] === 'n' ? `-${m[2]}` : m[2]
}

/** Validates Telegram Mini App initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
export function verifyInitData(initData: unknown): VerifiedInitData | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || typeof initData !== 'string' || initData.length > 4096) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest()

  const given = Buffer.from(hash, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return null

  try {
    const user = JSON.parse(params.get('user') ?? '') as TgUser
    if (typeof user?.id !== 'number' || typeof user.first_name !== 'string') return null
    return { user, chatId: decodeChatParam(params.get('start_param')) }
  } catch {
    return null
  }
}

export async function tgApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
    if (!json.ok) {
      console.log('[v0] telegram api error', method, json.description)
      return null
    }
    return json.result ?? null
  } catch (e) {
    console.log('[v0] telegram api failed', method, e)
    return null
  }
}

/** Deep link that opens the Mini App from a group, carrying the group id. Requires the Mini App short name from BotFather /newapp. */
export function miniAppLink(chatId: number | string) {
  const bot = process.env.TELEGRAM_BOT_USERNAME
  const app = process.env.TELEGRAM_APP_SHORTNAME
  if (!bot || !app) return null
  return `https://t.me/${bot.replace(/^@/, '')}/${app}?startapp=${encodeChatParam(chatId)}`
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
