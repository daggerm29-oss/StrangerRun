import { NextResponse } from 'next/server'
import { getLeaderboard, isGroupMember, submitScore } from '@/lib/leaderboard'
import { clearStatus, postPlaying, verifyStatus } from '@/lib/play-status'
import { verifyInitData } from '@/lib/telegram-server'

const MAX_SCORE = 50_000_000
const MAX_DISTANCE = 5_000_000

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    initData?: string
    action?: 'start' | 'stop'
    status?: unknown
    score?: number
    distance?: number
  } | null

  const verified = verifyInitData(body?.initData)
  if (!verified) return NextResponse.json({ error: 'Invalid Telegram session' }, { status: 401 })

  const { user, chatId } = verified

  if (body?.action === 'start') {
    if (!(await isGroupMember(chatId, user.id))) return NextResponse.json({ status: null })
    return NextResponse.json({ status: await postPlaying(chatId, user) })
  }

  if (body?.action === 'stop') {
    const ref = verifyStatus(chatId, String(user.id), body.status)
    if (ref) await clearStatus(chatId, ref)
    return NextResponse.json({ ok: true })
  }

  if (body?.score === undefined) {
    return NextResponse.json(await getLeaderboard(chatId, user))
  }

  const score = Math.floor(Number(body.score))
  const distance = Math.floor(Number(body.distance ?? 0))
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE || !Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  }

  const result = await submitScore(chatId, user, score, distance, body.status)
  if (!result) return NextResponse.json({ error: 'You are not a member of this group' }, { status: 403 })
  return NextResponse.json(result)
}
