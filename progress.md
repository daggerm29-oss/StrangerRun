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
- [x] `lib/game/zones.ts` zone definitions (palette, fog, sky colors, obstacle table) + `zoneAt(dist)` + blend
- [x] `environment.ts` sky/fog/light colors blend per zone (uniforms instead of hardcoded)
- [x] `track.ts` per-zone floor material, side decor, obstacle patterns; segment stores zone
- [x] `props.ts` new geometries/materials (lamp, tree, cone, barricade, laser, cart, arcade, bat)
- [x] engine: zone change toast banner, Eleven telekinesis power-up, Vecna curse camera wobble, demobat obstacle
- [x] HUD: show current zone name
- [x] typecheck passes
- [x] PR opened from `v0/hawkins-zones`
- [ ] Visual play-test on a real device (sandbox browser has no WebGL). Tune obstacle heights/colours if needed.

## DONE: Rich environment detail pass (branch `v0/rich-environments`)
- New `lib/game/scenery.ts` `SceneryKit.decorate(seg)` called from `Track.build`; animated in `engine.ambient()` via `track.kit.update(t)`
- All static detail is baked into ~14 vertex-coloured merged meshes/points per segment (lit, gloss, glow, flicker, blink, pulse, additive, flesh, silhouette + glow points/mist). Additive + points fade to black in fog (`fogToBlack`).
- Town: sidewalks, lamps w/ light cones + pools, utility poles + wires, detailed houses (porch, windows, fences, driveways, cars, xmas lights, autumn trees), MISSING posters, hydrants/mailboxes/bikes, puddles, steaming manholes, crosswalks, pine treeline, HAWKINS water tower, WELCOME TO HAWKINS sign (seg 0, menu shot)
- Forest: dense pines, grass/ferns/rocks/stumps/logs, glowing mushrooms, ground mist, moon shafts, Castle Byers, Mirkwood signpost, Will's bike + flashlight
- Lab: hazard chevrons, pipe runs, CRTs, LED panels, signs, observation windows, security doors, alarm beacons, fluorescent light volumes, cable trays, the Gate crack, drums, end wall
- Mall (fully rebuilt in kit): lit shop interiors (mannequins/arcade/Scoops Ahoy/TV wall), neon trims, balcony + upper shops, palms, benches, skylight trusses, banners, balloons, junction storefront
- Upside Down: giant tendrils, dripping vines, pulsing deck veins, floating debris, decayed cars/lamps, Joyce's alphabet wall, Mind Flayer silhouette
- Vecna: flesh vine arches, floating islands (Creel house, grandfather clocks, dead trees), sky rifts
- Headless test: ~30-70k verts, 25-77 objects, 3-18ms build per segment

## NEXT IDEAS (not started)
- Branching paths (safe vs shortcut), bike escape set piece, portal jump between zones
- Junkyard zone (buses to run on top of), quarry cliff path with falling rocks
- Walkie-talkie power-up revealing upcoming obstacles, Eggo waffles as currency skin

### Implemented mechanics
- Zones blend over last 120m (`ZONE_BLEND`) before each 500m boundary; toast banner on entry
- Role builders in track.ts: jumpWall / slideWall / block / low pick zone-specific obstacles
- Demobats (`bats`): full-width, slide under, swoop toward player
- Eleven pickup (`eleven`): 6s telekinesis smashes obstacles 16m ahead
- Vecna zone: curse every 11-18s for 4.5s: camera roll + fov warp + thicker fog + reversed lane controls

## Notes
- Obstacle model: `{kind, s, depth, lanes|null, clearY (jump height, Infinity=no jump), slideClears}` - new obstacles reuse this, so collision code needs no change.
- Segments are generated ahead; zone chosen from `track.distCursor` at segment creation.
