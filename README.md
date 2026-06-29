# Zombie Runner

Mobile-first browser survival game built with Three.js and hosted on GitHub Pages.

This project uses one finite static arena instead of infinite procedural terrain. Enemies arrive in escalating rounds, and the goal is to stay alive as long as possible.

## Current build

- Static industrial yard with roads, walls, buildings, cars, containers, signs, crates, and perimeter lighting.
- Touch controls designed for phone play: left movement stick, right drag-look area, action buttons, and sprint.
- Round-based survival loop with enemy scaling.
- HUD for round, score, active enemies, health, energy, and end screen stats.

## Files

- `index.html` — page shell and UI.
- `styles.css` — mobile HUD, controls, start screen, and end screen.
- `src/app.js` — main game loop, player, tool, rounds, HUD.
- `src/world.js` — finite static map and collision geometry.
- `src/entities.js` — enemy mesh, health, movement, and contact behavior.
- `src/input.js` — mobile controls and keyboard fallback.
- `src/config.js` — tuning values.
- `src/utils.js` — shared helpers.
