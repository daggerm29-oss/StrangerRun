'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Engine, GameResult, GameState, HudData } from '@/lib/game/engine'
import { initTelegram, loadBest, saveBest } from '@/lib/game/telegram'
import { canUseLeaderboard, submitScore } from '@/lib/game/leaderboard-client'
import { LeaderboardScreen } from './leaderboard-screen'
import { mutate } from 'swr'
import { Hud } from './hud'
import { StartScreen } from './start-screen'
import { GameOverScreen } from './game-over-screen'
import { PauseScreen } from './pause-screen'
import { LoadingScreen } from './loading-screen'
import { Toasts, type ToastItem } from './toasts'

const EMPTY_HUD: HudData = { score: 0, coins: 0, lives: 3, distance: 0, multiplier: 1, shield: 0, magnet: 0, danger: 0, tk: 0, zone: 'HAWKINS', cursed: false }

export function GameShell() {
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [state, setState] = useState<GameState>('loading')
  const [progress, setProgress] = useState(0)
  const [hud, setHud] = useState<HudData>(EMPTY_HUD)
  const [result, setResult] = useState<GameResult | null>(null)
  const [best, setBest] = useState(0)
  const [newBest, setNewBest] = useState(false)
  const [muted, setMuted] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [flash, setFlash] = useState<{ kind: 'hit' | 'lightning'; id: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bestRef = useRef(0)
  const [showBoard, setShowBoard] = useState(false)
  const [rank, setRank] = useState<number | null>(null)
  const [boardEnabled, setBoardEnabled] = useState(false)

  useEffect(() => {
    setBoardEnabled(canUseLeaderboard())
  }, [])

  useEffect(() => {
    initTelegram()
    loadBest().then((b) => {
      bestRef.current = b
      setBest(b)
    })
    const mount = mountRef.current
    if (!mount) return
    let engine: Engine | null = null
    let cancelled = false
    import('@/lib/game/engine')
      .then(({ Engine }) => {
        if (cancelled) return
        engine = new Engine(mount, {
          onState: setState,
          onHud: setHud,
          onProgress: setProgress,
          onToast: (text, tone) => {
            const id = Date.now() + Math.random()
            setToasts((t) => [...t.slice(-2), { id, text, tone }])
            window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1700)
          },
          onFlash: (kind) => setFlash({ kind, id: Date.now() }),
          onResult: (r) => {
            setResult(r)
            setRank(null)
            if (canUseLeaderboard()) {
              submitScore(r.score, Math.floor(r.distance))
                .then((res) => {
                  setRank(res.me?.rank ?? null)
                  mutate('leaderboard', res, { revalidate: false })
                })
                .catch((e: unknown) => console.log('[v0] score submit failed', e))
            }
            if (r.score > bestRef.current) {
              bestRef.current = r.score
              setBest(r.score)
              setNewBest(true)
              saveBest(r.score)
            } else setNewBest(false)
          },
        })
        engineRef.current = engine
        return engine.init()
      })
      .catch((e: unknown) => {
        console.log('[v0] engine init failed', e)
        setError('Your device could not start the 3D engine. Try reopening the game.')
      })
    return () => {
      cancelled = true
      engine?.dispose()
      engineRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    setResult(null)
    setHud(EMPTY_HUD)
    engineRef.current?.startRun()
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engineRef.current?.setMuted(!m)
      return !m
    })
  }, [])

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0 touch-none" aria-label="Game canvas. Swipe to move, jump, slide and turn." role="application" />

      {flash && (
        <div
          key={flash.id}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 animate-out fade-out duration-500 fill-mode-forwards ${
            flash.kind === 'hit' ? 'bg-blood/45' : 'bg-[#ff9a9a]/10'
          }`}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: state === 'playing' ? hud.danger * 0.9 : 0,
          background: 'radial-gradient(ellipse at center, transparent 45%, rgba(229,9,20,0.55) 100%)',
        }}
      />

      {(state === 'playing' || state === 'paused' || state === 'dying') && (
        <Hud hud={hud} onPause={() => engineRef.current?.pause()} muted={muted} onToggleMute={toggleMute} />
      )}
      {state === 'playing' && <Toasts items={toasts} />}

      {state === 'loading' && <LoadingScreen progress={progress} error={error} />}
      {state === 'menu' && (
        <StartScreen
          best={best}
          onStart={start}
          muted={muted}
          onToggleMute={toggleMute}
          onLeaderboard={boardEnabled ? () => setShowBoard(true) : undefined}
        />
      )}
      {state === 'paused' && (
        <PauseScreen onResume={() => engineRef.current?.resume()} onQuit={() => engineRef.current?.toMenu()} />
      )}
      {state === 'over' && result && (
        <GameOverScreen
          result={result}
          best={best}
          isNewBest={newBest}
          rank={rank}
          onLeaderboard={boardEnabled ? () => setShowBoard(true) : undefined}
          onRetry={start}
          onMenu={() => engineRef.current?.toMenu()}
        />
      )}
      {showBoard && <LeaderboardScreen onClose={() => setShowBoard(false)} />}
    </main>
  )
}
