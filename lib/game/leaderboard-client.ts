import type { LeaderboardResponse } from '@/lib/leaderboard'
import { initDataRaw, inTelegram } from './telegram'

export type { LeaderboardResponse }

async function post(body: Record<string, unknown>): Promise<LeaderboardResponse> {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: initDataRaw(), ...body }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Request failed')
  return res.json()
}

export const canUseLeaderboard = () => inTelegram()

export const fetchLeaderboard = () => post({})

export const submitScore = (score: number, distance: number) => post({ score, distance })
