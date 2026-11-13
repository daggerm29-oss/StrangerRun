import type { LeaderboardResponse } from '@/lib/leaderboard'
import { initDataRaw, inTelegram } from './telegram'

export type { LeaderboardResponse }

interface StatusRef {
  messageId: number
  token: string
}

/** the "is playing…" message the server posted for the current run */
let status: StatusRef | null = null

async function post<T = LeaderboardResponse>(body: Record<string, unknown>, keepalive = false): Promise<T> {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: initDataRaw(), ...body }),
    keepalive,
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Request failed')
  return res.json()
}

export const canUseLeaderboard = () => inTelegram()

export const fetchLeaderboard = () => post({})

/** Announces "xyz is playing…" in the group; a leftover message from an abandoned run is removed first. */
export async function startPlaying() {
  if (!inTelegram()) return
  stopPlaying()
  try {
    const res = await post<{ status: StatusRef | null }>({ action: 'start' })
    status = res.status
  } catch (e) {
    console.log('[v0] play status failed', e)
  }
}

/** Removes the "is playing…" message when the player leaves without finishing the run. */
export function stopPlaying() {
  const current = status
  if (!current) return
  status = null
  post({ action: 'stop', status: current }, true).catch(() => {})
}

export function submitScore(score: number, distance: number) {
  const current = status
  status = null
  return post({ score, distance, status: current })
}
