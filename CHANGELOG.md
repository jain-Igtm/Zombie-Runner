# Zombie Runner Update Log

## v0.1.0 — Mobile survival reset

This is the first real build for Zombie Runner.

The project has been reset around a finite static arena rather than another infinite generated world. The current map is an enclosed industrial yard with roads, concrete perimeter walls, buildings, cars, containers, crates, lamps, signs, and enough physical clutter to make movement matter without turning the phone into a lag machine.

Gameplay now has the basic survival structure in place: enemies arrive in rounds, the round count climbs, enemy health and speed increase, and the objective is to stay alive as long as possible.

The controls are mobile-first. The left thumbstick handles movement, the right side of the screen handles looking, and large touch buttons handle action, reload, and sprint. A keyboard fallback exists for testing on desktop, but the layout is built for Android portrait play.

The technical structure is split into separate files so the game can grow without becoming one massive, fragile HTML file. The main systems are separated into world building, entities, input, config, utility helpers, styling, and the game loop.
