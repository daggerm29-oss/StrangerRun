# Stranger Run - Progress Log

Resume point for any AI/dev picking this up. Keep this file updated as work happens.

## Stack
- Next.js 16 App Router, Three.js game in `lib/game/*`, React UI in `components/game/*`
- Neon Postgres (Drizzle) for Telegram leaderboard: table `scores` (chat_id, user_id, first_name, username, best_score, best_distance, plays, updated_at)
- Telegram bot: `app/api/telegram/webhook` (/play, /leaderboard), `app/api/telegram/setup?secret=...` registers webhook, `app/api/scores` (verified initData)

## DONE
- [x] Telegram group bot, per-group leaderboard, #1 announcements (PR #1, merged to main)

## CURRENT TASK: "Escape Hawkins" map overhaul (branch `v0/hawkins-zones`)
Goal: map feels like escaping Hawkins while the Upside Down takes over. Zones by distance:
1. 0-500m Hawkins Town (asphalt, street lamps, houses, cars, police barricades, traffic cones)
2. 500-1000m Mirkwood Forest (dirt, trees, fallen trees = jump, low branches = slide, Demobats)
3. 1000-1500m Hawkins Lab (tile, lab walls, laser barriers low=jump / high=slide, security doors)
4. 1500-2000m Starcourt Mall (polished tile, neon shop fronts, shopping carts, arcade machines)
5. 2000-2500m The Upside Down (original boardwalk, vines, tendrils, gaps, Demodogs)
6. 2500m+ Vecna's Territory (everything, harder, camera distortion "Vecna's curse", red storm)

### Plan / checklist
- [ ] `lib/game/zones.ts` zone definitions (palette, fog, sky colors, obstacle table) + `zoneAt(dist)` + blend
- [ ] `environment.ts` sky/fog/light colors blend per zone (uniforms instead of hardcoded)
- [ ] `track.ts` per-zone floor material, side decor, obstacle patterns; segment stores zone
- [ ] `props.ts` new geometries/materials (lamp, tree, cone, barricade, laser, cart, arcade, bat)
- [ ] engine: zone change toast banner, Eleven telekinesis power-up, Vecna curse camera wobble, demobat obstacle
- [ ] HUD: show current zone name
- [ ] typecheck, browser check, commit, push, PR

## Notes
- Obstacle model: `{kind, s, depth, lanes|null, clearY (jump height, Infinity=no jump), slideClears}` - new obstacles reuse this, so collision code needs no change.
- Segments are generated ahead; zone chosen from `track.distCursor` at segment creation.
