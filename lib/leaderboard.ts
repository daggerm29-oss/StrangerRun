import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { scores } from '@/lib/db/schema'
import { GLOBAL_CHAT, tgApi, type TgUser } from '@/lib/telegram-server'
import { finishStatus, verifyStatus } from '@/lib/play-status'

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
export async function isGroupMember(chatId: string, userId: number) {
  if (chatId === GLOBAL_CHAT) return true
  const member = await tgApi<{ status: string }>('getChatMember', { chat_id: chatId, user_id: userId })
  return !!member && !['left', 'kicked'].includes(member.status)
}

export async function submitScore(chatId: string, user: TgUser, score: number, distance: number, status?: unknown) {
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
  await finishStatus(chatId, user, score, newRecord, verifyStatus(chatId, userId, status))

  return { ...(await getLeaderboard(chatId, user)), newRecord }
}
