(() => {
  'use strict';

  const VERSION = 'babylon-static-001';
  const CFG = {
    world: { half: 84, radius: 1.05, height: 2.15, fogStart: 26, fogEnd: 142 },
    player: { walk: 10.4, sprint: 15.7, health: 100, regenDelay: 5.75, regen: 4.2 },
    gun: { name: 'RUNNER CARBINE', mag: 30, reserve: 90, body: 38, head: 92, range: 104, delay: 0.115, reload: 1.2, kick: 0.026, spread: 0.015 },
    zed: { health: 76, hpRound: 13, speed: 3.0, speedRound: 0.13, touch: 1.7, damage: 14, hitDelay: 0.78 },
    rounds: { base: 6, add: 4, spawn: 0.7, grace: 1.25, gap: 4.0, activeBase: 7, activeScale: 2 }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const c3 = (hex) => new BABYLON.Color3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const ammoText = (a, r) => `${Math.max(0, a)} / ${Math.max(0, r)}`;
  const mat = (scene, name, hex, spec = 0x111111, alpha = 1) => {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = c3(hex);
    m.specularColor = c3(spec);
    m.alpha = alpha;
    return m;
  };
  const hitRect = (cx, cz, radius, r) => {
    const x = clamp(cx, r.x - r.w / 2, r.x + r.w / 2);
    const z = clamp(cz, r.z - r.d / 2, r.z + r.d / 2);
    const dx = cx - x, dz = cz - z;
    return dx * dx + dz * dz < radius * radius;
  };

  class Input {
    constructor() {
      this.move = { x: 0, y: 0 };
      this.look = { x: 0, y: 0 };
      this.fire = false;
      this.reload = false;
      this.sprint = false;
      this.moveId = null;
      this.lookId = null;
      this.sens = 0.0043;
      this.keys = new Set();
      this.stick = document.getElementById('move-stick');
      this.nub = this.stick.querySelector('.nub');
      this.lookZone = document.getElementById('look-zone');
      this.fireButton = document.getElementById('action-button');
      this.reloadButton = document.getElementById('reload-button');
      this.sprintButton = document.getElementById('sprint-button');
      this.bindTouch();
      this.bindKeyboard();
      window.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    bindTouch() {
      this.stick.addEventListener('pointerdown', (e) => this.startMove(e));
      this.lookZone.addEventListener('pointerdown', (e) => this.startLook(e));
      window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
      window.addEventListener('pointerup', (e) => this.end(e));
      window.addEventListener('pointercancel', (e) => this.end(e));
      this.fireButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.fire = true; this.fireButton.setPointerCapture?.(e.pointerId); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => this.fireButton.addEventListener(t, () => { this.fire = false; }));
      this.reloadButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.reload = true; });
      this.sprintButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.sprint = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => this.sprintButton.addEventListener(t, () => { this.sprint = false; }));
    }
    bindKeyboard() {
      window.addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'Space') this.fire = true; if (e.code === 'KeyR') this.reload = true; if (e.code.includes('Shift')) this.sprint = true; this.keysToMove(); });
      window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'Space') this.fire = false; if (e.code.includes('Shift')) this.sprint = false; this.keysToMove(); });
    }
    keysToMove() {
      if (this.moveId !== null) return;
      const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const y = (this.keys.has('KeyW') ? -1 : 0) + (this.keys.has('KeyS') ? 1 : 0);
      const l = Math.hypot(x, y) || 1;
      this.move.x = x / l;
      this.move.y = y / l;
      if (!x && !y) this.move.x = this.move.y = 0;
    }
    startMove(e) { e.preventDefault(); this.moveId = e.pointerId; this.stick.setPointerCapture?.(e.pointerId); this.updateStick(e.clientX, e.clientY); }
    startLook(e) { e.preventDefault(); this.lookId = e.pointerId; this.lookZone.setPointerCapture?.(e.pointerId); this.lastX = e.clientX; this.lastY = e.clientY; }
    onMove(e) {
      if (e.pointerId === this.moveId) { e.preventDefault(); this.updateStick(e.clientX, e.clientY); }
      if (e.pointerId === this.lookId) { e.preventDefault(); this.look.x += (e.clientX - this.lastX) * this.sens; this.look.y += (e.clientY - this.lastY) * this.sens; this.lastX = e.clientX; this.lastY = e.clientY; }
    }
    end(e) {
      if (e.pointerId === this.moveId) { this.moveId = null; this.move.x = this.move.y = 0; this.nub.style.transform = 'translate(0px, 0px)'; this.keysToMove(); }
      if (e.pointerId === this.lookId) this.lookId = null;
    }
    updateStick(clientX, clientY) {
      const r = this.stick.getBoundingClientRect();
      const max = r.width * 0.33;
      let dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > max) { dx = dx / l * max; dy = dy / l * max; }
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = clamp(dx / max, -1, 1);
      this.move.y = clamp(dy / max, -1, 1);
    }
    takeLook() { const v = { ...this.look }; this.look.x = this.look.y = 0; return v; }
    takeReload() { const v = this.reload; this.reload = false; return v; }
  }

  class World {
    constructor(scene) {
      this.scene = scene;
      this.half = CFG.world.half;
      this.colliders = [];
      this.spawns = [];
      this.m = this.materials();
      this.build();
    }
    materials() {
      return {
        asphalt: mat(this.scene, 'asphalt', 0x202427), grass: mat(this.scene, 'grass', 0x2f3c28), concrete: mat(this.scene, 'concrete', 0x6d7069),
        brick: mat(this.scene, 'brick', 0x7a493b), rust: mat(this.scene, 'rust', 0x8a5730), metal: mat(this.scene, 'metal', 0x596469), dark: mat(this.scene, 'dark metal', 0x202427),
        yellow: mat(this.scene, 'lane yellow', 0xd7c362), glass: mat(this.scene, 'dirty glass', 0x49606c, 0x1c2c34, 0.72), sign: mat(this.scene, 'sign', 0xd0d4ca)
      };
    }
    build() {
      this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.09, 1);
      this.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
      this.scene.fogStart = CFG.world.fogStart;
      this.scene.fogEnd = CFG.world.fogEnd;
      this.scene.fogColor = c3(0x101720);
      const hemi = new BABYLON.HemisphericLight('overcast', new BABYLON.Vector3(0, 1, 0), this.scene);
      hemi.intensity = 0.82; hemi.diffuse = c3(0xbfd2ff); hemi.groundColor = c3(0x252718);
      const moon = new BABYLON.DirectionalLight('moon', new BABYLON.Vector3(-0.55, -1, 0.38), this.scene);
      moon.position = new BABYLON.Vector3(48, 90, -60); moon.intensity = 1.18; moon.diffuse = c3(0xb8caff);
      const ground = BABYLON.MeshBuilder.CreateGround('finite asphalt yard', { width: this.half * 2, height: this.half * 2, subdivisions: 8 }, this.scene);
      ground.material = this.m.asphalt; ground.isPickable = false;
      this.strip(0, -this.half + 7, this.half * 2, 18, this.m.grass); this.strip(0, this.half - 7, this.half * 2, 18, this.m.grass);
      this.strip(-this.half + 8, 0, 12, this.half * 2, this.m.grass); this.strip(this.half - 8, 0, 12, this.half * 2, this.m.grass);
      this.perimeter(); this.lines(); this.buildings(); this.props(); this.spawnPoints();
    }
    strip(x, z, w, d, material) { const g = BABYLON.MeshBuilder.CreateGround('verge', { width: w, height: d }, this.scene); g.position.set(x, 0.012, z); g.material = material; g.isPickable = false; }
    box(name, x, z, w, d, h, material, y = h / 2, collide = true) { const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, depth: d, height: h }, this.scene); b.position.set(x, y, z); b.material = material; b.isPickable = false; if (collide && h > 0.55) this.colliders.push({ x, z, w, d, name }); return b; }
    low(name, x, z, w, d, material) { this.box(name, x, z, w, d, 0.05, material, 0.025, false); }
    perimeter() { const b = this.half; this.box('north wall', 0, -b - 1.2, b * 2 + 5, 3.2, 6, this.m.concrete); this.box('south wall', 0, b + 1.2, b * 2 + 5, 3.2, 6, this.m.concrete); this.box('west wall', -b - 1.2, 0, 3.2, b * 2 + 5, 6, this.m.concrete); this.box('east wall', b + 1.2, 0, 3.2, b * 2 + 5, 6, this.m.concrete); for (let i = -4; i <= 4; i++) { this.lamp(i * 20, -b + 5, Math.PI); this.lamp(i * 20, b - 5, 0); } }
    lines() { for (let z = -64; z <= 64; z += 16) this.low('center stripe', 0, z, 0.32, 7.8, this.m.yellow); for (let x = -56; x <= 56; x += 16) this.low('cross stripe', x, 0, 8.2, 0.32, this.m.yellow); this.low('helipad north', 34, -48, 18, 0.28, this.m.yellow); this.low('helipad south', 34, -32, 18, 0.28, this.m.yellow); this.low('helipad west', 25, -40, 0.28, 16, this.m.yellow); this.low('helipad east', 43, -40, 0.28, 16, this.m.yellow); }
    buildings() {
      this.box('generator block', -48, -34, 24, 20, 11, this.m.brick); this.box('loading dock', -48, -17, 18, 8, 7, this.m.dark); this.box('cold storage', 43, -31, 22, 24, 13, this.m.concrete); this.box('vehicle bay', 54, 18, 18, 31, 10, this.m.metal); this.box('rust warehouse', -44, 34, 28, 22, 12, this.m.rust); this.box('admin hut', -7, 43, 24, 15, 8, this.m.concrete);
      this.windows(-48, -44.2, 4, 4, 6.2); this.windows(43, -43.2, 4, 4.5, 7.1); this.windows(-44, 22.8, 5, 4.8, 6.5);
      this.tower(20, 45); this.tower(-59, 5); this.containers(18, -17, 4, false); this.containers(-15, -49, 5, true); this.containers(18, 22, 4, true);
    }
    windows(cx, z, count, width, y) { for (let i = 0; i < count; i++) { const w = this.box('dirty window', cx + (i - (count - 1) / 2) * (width + 1.5), z, width, 0.18, 2.4, this.m.glass, y, false); w.isPickable = false; } }
    containers(x, z, count, rot) { for (let i = 0; i < count; i++) this.box('cargo container', rot ? x : x + i * 9.5, rot ? z + i * 9.5 : z, rot ? 6 : 8.5, rot ? 8.5 : 6, 4.6, i % 2 ? this.m.metal : this.m.rust); }
    tower(x, z) { [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]].forEach(([a, b]) => this.box('watchtower leg', x + a, z + b, 0.45, 0.45, 10, this.m.dark, 5, false)); this.box('watchtower platform', x, z, 7.2, 7.2, 1, this.m.metal, 10.2, false); this.box('watchtower roof', x, z, 8.4, 8.4, 0.5, this.m.dark, 14.8, false); this.colliders.push({ x, z, w: 7.5, d: 7.5, name: 'watchtower' }); }
    lamp(x, z, rot) { const p = BABYLON.MeshBuilder.CreateCylinder('lamp pole', { height: 7, diameterTop: 0.18, diameterBottom: 0.24, tessellation: 8 }, this.scene); p.position.set(x, 3.5, z); p.material = this.m.dark; p.isPickable = false; const h = this.box('lamp head', x, z + Math.cos(rot), 2.4, 1, 0.55, this.m.yellow, 7.25, false); h.rotation.y = rot; const l = new BABYLON.PointLight(`lamp ${x} ${z}`, new BABYLON.Vector3(x, 6.2, z + Math.cos(rot) * 2.4), this.scene); l.diffuse = c3(0xffcf7a); l.intensity = 0.15; l.range = 24; }
    props() { this.car(-19, -7, 0.35, 0x2f4a57); this.car(29, 6, -0.28, 0x713333); this.car(8, -36, 1.45, 0x535d43); this.car(-32, 8, -0.66, 0x4c4c52); this.barricade(0, 58, 0); this.barricade(0, -58, Math.PI); this.barricade(-63, -12, Math.PI / 2); this.barricade(63, 2, -Math.PI / 2); for (let i = 0; i < 36; i++) { const x = rand(-66, 66), z = rand(-66, 66); if (Math.abs(x) > 10 || Math.abs(z) > 10) if (!this.blocked(x, z, 2.8)) this.crate(x, z, rand(0, Math.PI * 2)); } }
    car(x, z, r, hex) { const m = mat(this.scene, `car ${x}`, hex); const body = this.box('abandoned car body', x, z, 5.2, 8, 1.45, m, 0.78, false); body.rotation.y = r; const cab = this.box('abandoned car cabin', x - Math.sin(r) * 0.35, z - Math.cos(r) * 0.35, 4.4, 3.4, 1.4, this.m.glass, 1.95, false); cab.rotation.y = r; this.colliders.push({ x, z, w: Math.abs(Math.cos(r)) * 5.4 + Math.abs(Math.sin(r)) * 8.2, d: Math.abs(Math.sin(r)) * 5.4 + Math.abs(Math.cos(r)) * 8.2, name: 'car' }); }
    crate(x, z, r) { const s = rand(1.5, 3.2); const cr = this.box('loose crate', x, z, s, s, s, this.m.rust, s / 2, false); cr.rotation.y = r; this.colliders.push({ x, z, w: s + 0.35, d: s + 0.35, name: 'crate' }); }
    barricade(x, z, r) { this.box('barricade slab', x, z, Math.abs(Math.cos(r)) * 17 + Math.abs(Math.sin(r)) * 2, Math.abs(Math.sin(r)) * 17 + Math.abs(Math.cos(r)) * 2, 1.2, this.m.concrete, 0.8); }
    spawnPoints() { const b = this.half - 9; this.spawns = [[-55, -b], [0, -b], [55, -b], [-b, -42], [-b, 0], [-b, 42], [b, -42], [b, 0], [b, 42], [-48, b], [6, b], [51, b]].map(([x, z]) => new BABYLON.Vector3(x, 0, z)); }
    blocked(x, z, radius) { if (x < -this.half + radius || x > this.half - radius || z < -this.half + radius || z > this.half - radius) return true; return this.colliders.some((r) => hitRect(x, z, radius, r)); }
    move(pos, dx, dz, radius) { const nx = pos.x + dx; if (!this.blocked(nx, pos.z, radius)) pos.x = nx; const nz = pos.z + dz; if (!this.blocked(pos.x, nz, radius)) pos.z = nz; }
    spawnAway(p) { let best = this.spawns[0], dist = -Infinity; for (const s of this.spawns) { const dx = s.x - p.x, dz = s.z - p.z, d = dx * dx + dz * dz + rand(-12, 12); if (d > dist) { dist = d; best = s; } } return best.clone(); }
  }

  class Zombie {
    constructor(scene, world, pos, round, m) {
      this.scene = scene; this.world = world; this.hp = CFG.zed.health + round * CFG.zed.hpRound; this.maxHp = this.hp; this.speed = CFG.zed.speed + round * CFG.zed.speedRound + rand(-0.15, 0.28); this.radius = 0.88; this.clock = rand(0, CFG.zed.hitDelay); this.stagger = 0; this.age = 0; this.dead = false; this.meshes = []; this.m = m;
      this.root = new BABYLON.TransformNode('zombie', scene); this.root.position.copyFrom(pos); this.body();
    }
    body() {
      this.target(BABYLON.MeshBuilder.CreateCylinder('zed torso', { height: 1.4, diameterTop: 0.82, diameterBottom: 0.68, tessellation: 10 }, this.scene), 'body', 0, 1.45, 0, this.m.shirt);
      const head = this.target(BABYLON.MeshBuilder.CreateSphere('zed head', { diameter: 0.86, segments: 12 }, this.scene), 'head', 0, 2.45, 0, this.m.skin); head.scaling.set(0.92, 1.08, 0.9);
      this.target(BABYLON.MeshBuilder.CreateBox('zed mouth', { width: 0.5, height: 0.15, depth: 0.22 }, this.scene), 'head', 0, 2.25, -0.36, this.m.blood);
      this.target(BABYLON.MeshBuilder.CreateBox('zed hips', { width: 0.95, height: 0.36, depth: 0.55 }, this.scene), 'body', 0, 0.82, 0, this.m.pants);
      this.limb(-0.72, 1.52, -0.16, 0.23, 1.02, this.m.skin, 0.42, 0.22, 'arm'); this.limb(0.72, 1.52, -0.16, 0.23, 1.02, this.m.skin, 0.42, -0.22, 'arm'); this.limb(-0.28, 0.32, 0.02, 0.27, 0.88, this.m.pants, 0, 0.08, 'leg'); this.limb(0.28, 0.32, 0.02, 0.27, 0.88, this.m.pants, 0, -0.08, 'leg');
      [-0.16, 0.16].forEach((x) => { const eye = BABYLON.MeshBuilder.CreateSphere('zed eye', { diameter: 0.11, segments: 6 }, this.scene); eye.position.set(x, 2.55, -0.39); eye.material = this.m.eye; eye.parent = this.root; eye.isPickable = false; });
      this.hpBack = BABYLON.MeshBuilder.CreatePlane('zed hp back', { width: 1.35, height: 0.11 }, this.scene); this.hpBack.position.y = 3.18; this.hpBack.material = this.m.hpBack; this.hpBack.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; this.hpBack.parent = this.root; this.hpBack.isPickable = false;
      this.hpBar = BABYLON.MeshBuilder.CreatePlane('zed hp bar', { width: 1.28, height: 0.075 }, this.scene); this.hpBar.position.set(0, 3.181, -0.003); this.hpBar.material = this.m.hpHigh; this.hpBar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; this.hpBar.parent = this.root; this.hpBar.isPickable = false;
    }
    target(mesh, zone, x, y, z, material) { mesh.position.set(x, y, z); mesh.material = material; mesh.parent = this.root; mesh.metadata = { zombie: this, zone }; mesh.isPickable = true; this.meshes.push(mesh); return mesh; }
    limb(x, y, z, diameter, height, material, rx, rz, name) { const mesh = BABYLON.MeshBuilder.CreateCylinder(`zed ${name}`, { height, diameter, tessellation: 8 }, this.scene); mesh.rotation.x = rx; mesh.rotation.z = rz; return this.target(mesh, 'body', x, y, z, material); }
    update(dt, p) { if (this.dead) return 0; this.age += dt; this.clock -= dt; this.stagger = Math.max(0, this.stagger - dt * 3.7); const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z, d = Math.hypot(dx, dz), inv = d > 0.0001 ? 1 / d : 0, dirX = dx * inv, dirZ = dz * inv; this.root.rotation.y = Math.atan2(dirX, dirZ); this.root.position.y = Math.sin(this.age * 7.4) * 0.035; this.meshes.forEach((m, i) => { if (m.name.includes('arm')) m.rotation.x = 0.42 + Math.sin(this.age * 5.3 + i) * 0.18; if (m.name.includes('leg')) m.rotation.x = Math.sin(this.age * 7.2 + i) * 0.16; }); if (d > CFG.zed.touch) { const flank = Math.sin(this.age * 1.6) * 0.26, speed = this.speed * (1 - this.stagger * 0.72) * dt, ox = this.root.position.x, oz = this.root.position.z; this.root.position.x += (dirX + dirZ * flank) * speed; if (this.world.blocked(this.root.position.x, this.root.position.z, this.radius)) this.root.position.x = ox; this.root.position.z += (dirZ - dirX * flank) * speed; if (this.world.blocked(this.root.position.x, this.root.position.z, this.radius)) this.root.position.z = oz; return 0; } if (this.clock <= 0) { this.clock = CFG.zed.hitDelay; this.stagger = 0.36; return CFG.zed.damage; } return 0; }
    damage(amount) { if (this.dead) return false; this.hp -= amount; this.stagger = clamp(this.stagger + 0.42, 0, 1); const pct = clamp(this.hp / this.maxHp, 0, 1); this.hpBar.scaling.x = pct; this.hpBar.position.x = -(1 - pct) * 0.64; this.hpBar.material = pct <= 0.25 ? this.m.hpLow : pct <= 0.5 ? this.m.hpMid : this.m.hpHigh; if (this.hp <= 0) { this.dead = true; this.dispose(); return true; } return false; }
    dispose() { this.meshes.forEach((m) => m.dispose(false, true)); this.hpBack?.dispose(false, true); this.hpBar?.dispose(false, true); this.root.dispose(); }
  }

  class Game {
    constructor() {
      if (!window.BABYLON) { document.body.innerHTML = '<div style="padding:24px;color:white;background:#101820;font-family:sans-serif">Babylon.js did not load. Refresh once, or check the network/CDN.</div>'; return; }
      this.canvas = document.getElementById('game-canvas');
      this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' });
      this.engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.55));
      this.scene = new BABYLON.Scene(this.engine);
      this.camera = new BABYLON.FreeCamera('player camera', new BABYLON.Vector3(0, CFG.world.height, 50), this.scene); this.camera.minZ = 0.08; this.camera.maxZ = 220; this.scene.activeCamera = this.camera;
      this.input = new Input(); this.world = new World(this.scene); this.zmats = this.zombieMats(); this.zombies = [];
      this.player = { pos: new BABYLON.Vector3(0, CFG.world.height, 50), yaw: Math.PI, pitch: 0, health: CFG.player.health, lastHit: -Infinity };
      this.running = false; this.over = false; this.round = 0; this.score = 0; this.spawned = 0; this.toSpawn = 0; this.spawnTimer = 0; this.roundGap = 0; this.cooldown = 0; this.reloadTimer = 0; this.ammo = CFG.gun.mag; this.reserve = CFG.gun.reserve; this.flashTime = 0; this.last = performance.now();
      this.ui(); this.weapon(); this.updateCamera(); this.resize(); window.addEventListener('resize', () => this.resize()); window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250)); this.engine.runRenderLoop(() => this.frame());
    }
    ui() { ['hud', 'touch-layer', 'start-screen', 'game-over-screen', 'round-value', 'score-value', 'active-value', 'health-fill', 'health-text', 'ammo-value', 'tool-state', 'round-banner', 'feedback-vignette', 'final-round', 'final-score'].forEach((id) => { this[id.replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = document.getElementById(id); }); document.getElementById('start-button').addEventListener('click', () => this.start()); document.getElementById('restart-button').addEventListener('click', () => this.restart()); }
    zombieMats() { return { shirt: mat(this.scene, 'zshirt', 0x656743), skin: mat(this.scene, 'zskin', 0x879762), pants: mat(this.scene, 'zpants', 0x303846), blood: mat(this.scene, 'zblood', 0x5b1010), eye: mat(this.scene, 'zeyes', 0xf4f1c6, 0xffffff), hpBack: mat(this.scene, 'hpback', 0x151515, 0x000000, 0.82), hpHigh: mat(this.scene, 'hphigh', 0xb6ff6b, 0), hpMid: mat(this.scene, 'hpmid', 0xffd166, 0), hpLow: mat(this.scene, 'hplow', 0xff5353, 0) }; }
    weapon() { const gun = mat(this.scene, 'gunbody', 0x25272a), metal = mat(this.scene, 'gunmetal', 0x4b5359), grip = mat(this.scene, 'grip', 0x151617), flash = mat(this.scene, 'flash', 0xffe39a, 0xffffff, 0); flash.emissiveColor = c3(0xffd073); this.weaponRoot = new BABYLON.TransformNode('carbine', this.scene); this.weaponRoot.parent = this.camera; this.weaponRoot.position.set(0.58, -0.55, 1.0); this.weaponRoot.rotation.set(-0.05, -0.08, 0); const add = (mesh, material, x, y, z, rx = 0) => { mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.material = material; mesh.parent = this.weaponRoot; mesh.isPickable = false; return mesh; }; add(BABYLON.MeshBuilder.CreateBox('receiver', { width: 0.22, height: 0.22, depth: 1.0 }, this.scene), gun, 0, 0, 0.28); add(BABYLON.MeshBuilder.CreateCylinder('barrel', { height: 0.78, diameterTop: 0.035, diameterBottom: 0.05, tessellation: 12 }, this.scene), metal, 0, 0.04, 0.96, Math.PI / 2); add(BABYLON.MeshBuilder.CreateBox('grip', { width: 0.16, height: 0.36, depth: 0.18 }, this.scene), grip, 0.02, -0.26, -0.02, -0.2); add(BABYLON.MeshBuilder.CreateBox('magazine', { width: 0.18, height: 0.42, depth: 0.24 }, this.scene), metal, 0.01, -0.29, 0.25, -0.12); this.flash = add(BABYLON.MeshBuilder.CreateCylinder('muzzle flash', { height: 0.34, diameterTop: 0, diameterBottom: 0.3, tessellation: 12 }, this.scene), flash, 0, 0.04, 1.36, Math.PI / 2); }
    start() { this.startScreen.classList.remove('visible'); this.gameOverScreen.classList.remove('visible'); this.hud.classList.remove('hidden'); this.touchLayer.classList.remove('hidden'); this.running = true; this.over = false; this.beginRound(1); }
    restart() { this.zombies.forEach((z) => z.dispose()); this.zombies = []; this.player.pos.set(0, CFG.world.height, 50); this.player.yaw = Math.PI; this.player.pitch = 0; this.player.health = CFG.player.health; this.player.lastHit = -Infinity; this.round = this.score = this.spawned = this.toSpawn = 0; this.spawnTimer = this.roundGap = this.cooldown = this.reloadTimer = 0; this.ammo = CFG.gun.mag; this.reserve = CFG.gun.reserve; this.gameOverScreen.classList.remove('visible'); this.hud.classList.remove('hidden'); this.touchLayer.classList.remove('hidden'); this.running = true; this.over = false; this.beginRound(1); }
    beginRound(n) { this.round = n; this.spawned = 0; this.toSpawn = CFG.rounds.base + (n - 1) * CFG.rounds.add; this.spawnTimer = CFG.rounds.grace; this.roundGap = 0; this.banner(`Round ${n}`); this.updateHUD(); }
    banner(text) { this.roundBanner.textContent = text; this.roundBanner.classList.add('show'); clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => this.roundBanner.classList.remove('show'), 1600); }
    frame() { const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.05); this.last = now; if (this.running && !this.over) this.update(dt); this.scene.render(); }
    update(dt) { this.cooldown = Math.max(0, this.cooldown - dt); this.flashTime = Math.max(0, this.flashTime - dt); this.flash.material.alpha = this.flashTime > 0 ? clamp(this.flashTime * 12, 0, 0.88) : 0; this.look(); this.move(dt); this.updateCamera(); this.gun(dt); this.rounds(dt); this.zed(dt); this.regen(dt); this.updateHUD(); }
    look() { const l = this.input.takeLook(); this.player.yaw -= l.x; this.player.pitch = clamp(this.player.pitch - l.y, -1.22, 1.15); }
    move(dt) { const m = this.input.move, f = -m.y, s = m.x; if (Math.abs(f) < 0.001 && Math.abs(s) < 0.001) return; const speed = this.input.sprint ? CFG.player.sprint : CFG.player.walk, sin = Math.sin(this.player.yaw), cos = Math.cos(this.player.yaw); this.world.move(this.player.pos, (sin * f + cos * s) * speed * dt, (cos * f - sin * s) * speed * dt, CFG.world.radius); }
    gun(dt) { if (this.reloadTimer > 0) { this.reloadTimer -= dt; this.toolState.textContent = 'RELOADING'; this.weaponRoot.rotation.x = -0.32 + Math.sin(this.reloadTimer * 20) * 0.04; if (this.reloadTimer <= 0) this.finishReload(); return; } this.toolState.textContent = CFG.gun.name; this.weaponRoot.rotation.x += (-0.05 - this.weaponRoot.rotation.x) * Math.min(1, dt * 12); this.weaponRoot.position.y = -0.55 + Math.sin(performance.now() * 0.006) * 0.008; if (this.input.takeReload()) this.startReload(); if (this.input.fire) this.shoot(); }
    shoot() { if (this.cooldown > 0 || this.reloadTimer > 0) return; if (this.ammo <= 0) return this.startReload(); this.cooldown = CFG.gun.delay; this.ammo--; this.flashTime = 0.08; this.weaponRoot.rotation.x -= CFG.gun.kick; this.player.pitch = clamp(this.player.pitch + CFG.gun.kick * 0.18, -1.22, 1.15); const ray = this.camera.getForwardRay(CFG.gun.range); ray.direction.x += rand(-CFG.gun.spread, CFG.gun.spread); ray.direction.y += rand(-CFG.gun.spread, CFG.gun.spread); ray.direction.z += rand(-CFG.gun.spread, CFG.gun.spread); ray.direction.normalize(); const hit = this.scene.pickWithRay(ray, (mesh) => !!mesh.metadata?.zombie && !mesh.metadata.zombie.dead); if (!hit?.hit) return; const z = hit.pickedMesh.metadata.zombie, zone = hit.pickedMesh.metadata.zone; if (z.damage(zone === 'head' ? CFG.gun.head : CFG.gun.body)) { this.score++; this.zombies = this.zombies.filter((x) => !x.dead); } }
    startReload() { if (this.reloadTimer > 0 || this.ammo >= CFG.gun.mag || this.reserve <= 0) return; this.reloadTimer = CFG.gun.reload; }
    finishReload() { const load = Math.min(CFG.gun.mag - this.ammo, this.reserve); this.ammo += load; this.reserve -= load; this.weaponRoot.rotation.x = -0.05; }
    rounds(dt) { if (this.roundGap > 0) { this.roundGap -= dt; if (this.roundGap <= 0) this.beginRound(this.round + 1); return; } const max = CFG.rounds.activeBase + Math.floor(this.round * CFG.rounds.activeScale); if (this.spawned < this.toSpawn && this.zombies.length < max) { this.spawnTimer -= dt; if (this.spawnTimer <= 0) { this.zombies.push(new Zombie(this.scene, this.world, this.world.spawnAway(this.player.pos), this.round, this.zmats)); this.spawned++; this.spawnTimer = Math.max(0.22, CFG.rounds.spawn - this.round * 0.025); } } if (this.spawned >= this.toSpawn && this.zombies.length === 0 && this.roundGap <= 0) { this.roundGap = CFG.rounds.gap; this.reserve += Math.min(30, 8 + this.round * 3); this.banner(`Round ${this.round} clear`); } }
    zed(dt) { let damage = 0; for (const z of this.zombies) damage += z.update(dt, this.player.pos); if (damage > 0) this.hurt(damage); }
    hurt(amount) { this.player.health = clamp(this.player.health - amount, 0, CFG.player.health); this.player.lastHit = performance.now() / 1000; this.feedbackVignette.style.opacity = '1'; clearTimeout(this.feedbackTimer); this.feedbackTimer = setTimeout(() => { this.feedbackVignette.style.opacity = '0'; }, 120); if (this.player.health <= 0) this.end(); }
    regen(dt) { if (performance.now() / 1000 - this.player.lastHit > CFG.player.regenDelay && this.player.health > 0) this.player.health = clamp(this.player.health + CFG.player.regen * dt, 0, CFG.player.health); }
    end() { this.over = true; this.running = false; this.hud.classList.add('hidden'); this.touchLayer.classList.add('hidden'); this.finalRound.textContent = `Round ${this.round}`; this.finalScore.textContent = `${this.score} clears · ${VERSION}`; this.gameOverScreen.classList.add('visible'); }
    updateCamera() { this.camera.position.copyFrom(this.player.pos); this.camera.rotation.x = this.player.pitch; this.camera.rotation.y = this.player.yaw; this.camera.rotation.z = 0; }
    updateHUD() { this.roundValue.textContent = this.round; this.scoreValue.textContent = this.score; this.activeValue.textContent = this.zombies.length; this.healthFill.style.width = `${this.player.health}%`; this.healthText.textContent = Math.ceil(this.player.health); this.ammoValue.textContent = ammoText(this.ammo, this.reserve); }
    resize() { this.engine.resize(); this.camera.fov = window.innerWidth < window.innerHeight ? 1.28 : 1.12; }
  }

  window.addEventListener('DOMContentLoaded', () => new Game());
})();
