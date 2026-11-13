import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { scores } from '@/lib/db/schema'
import { GLOBAL_CHAT, escapeHtml, tgApi, type TgUser } from '@/lib/telegram-server'

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  username: string | null
  score: number
  distance: number
}

export interface LeaderboardResponse {
  scope: 'group' | 'global'
  entries: LeaderboardEntry[]
  me: { rank: number; score: number } | null
  newRecord?: boolean
}

export async function getTop(chatId: string, limit = 10): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select()
    .from(scores)
    .where(and(eq(scores.chatId, chatId), gt(scores.bestScore, 0)))
    .orderBy(desc(scores.bestScore), scores.updatedAt)
    .limit(limit)
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: r.firstName,
    username: r.username,
    score: r.bestScore,
    distance: r.bestDistance,
  }))
}

async function getMe(chatId: string, userId: string) {
  const [row] = await db
    .select({ score: scores.bestScore })
    .from(scores)
    .where(and(eq(scores.chatId, chatId), eq(scores.userId, userId)))
  if (!row || row.score <= 0) return null
  const [{ ahead }] = await db
    .select({ ahead: sql<number>`count(*)::int` })
    .from(scores)
    .where(and(eq(scores.chatId, chatId), gt(scores.bestScore, row.score)))
  return { rank: ahead + 1, score: row.score }
}

export async function getLeaderboard(chatId: string, user: TgUser): Promise<LeaderboardResponse> {
  const [entries, me] = await Promise.all([getTop(chatId), getMe(chatId, String(user.id))])
  return { scope: chatId === GLOBAL_CHAT ? 'global' : 'group', entries, me }
}

/** Only players who are actually in the group may post to its board (the group id comes from a link anyone can edit). */
async function isGroupMember(chatId: string, userId: number) {
  if (chatId === GLOBAL_CHAT) return true
  const member = await tgApi<{ status: string }>('getChatMember', { chat_id: chatId, user_id: userId })
  return !!member && !['left', 'kicked'].includes(member.status)
}

export async function submitScore(chatId: string, user: TgUser, score: number, distance: number) {
  const userId = String(user.id)
  if (!(await isGroupMember(chatId, user.id))) return null

  const [previousTop] = await db
    .select()
    .from(scores)
    .where(and(eq(scores.chatId, chatId), gt(scores.bestScore, 0)))
    .orderBy(desc(scores.bestScore))
    .limit(1)

  await db
    .insert(scores)
    .values({
      chatId,
      userId,
      firstName: user.first_name,
      username: user.username ?? null,
      bestScore: score,
      bestDistance: distance,
      plays: 1,
    })
    .onConflictDoUpdate({
      target: [scores.chatId, scores.userId],
      set: {
        firstName: user.first_name,
        username: user.username ?? null,
        plays: sql`${scores.plays} + 1`,
        bestScore: sql`greatest(${scores.bestScore}, ${score})`,
        bestDistance: sql`case when ${score} > ${scores.bestScore} then ${distance} else ${scores.bestDistance} end`,
        updatedAt: sql`case when ${score} > ${scores.bestScore} then now() else ${scores.updatedAt} end`,
      },
    })

  const newRecord = score > 0 && (!previousTop || score > previousTop.bestScore)
  if (newRecord && chatId !== GLOBAL_CHAT) await announceRecord(chatId, user, score, previousTop)

  return { ...(await getLeaderboard(chatId, user)), newRecord }
}

async function announceRecord(
  chatId: string,
  user: TgUser,
  score: number,
  previous: { firstName: string; bestScore: number; userId: string } | undefined,
) {
  const name = `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`
  const fmt = (n: number) => n.toLocaleString('en-US')
  let text: string
  if (!previous) {
    text = `🏆 <b>${name}</b> set the first high score in Stranger Run: <b>${fmt(score)}</b>!\nThink you can beat it? Send /play`
  } else if (previous.userId === String(user.id)) {
    text = `🏆 <b>${name}</b> just broke their own record with <b>${fmt(score)}</b>!\nSend /play to take the crown.`
  } else {
    text = `🏆 <b>${name}</b> just took the #1 spot with <b>${fmt(score)}</b>, beating ${escapeHtml(previous.firstName)}'s ${fmt(previous.bestScore)}!\nSend /play to fight for it back.`
  }
  await tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_notification: false })
}
