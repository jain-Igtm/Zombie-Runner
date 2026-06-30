(() => {
  'use strict';

  const VERSION = 'babylon-static-002';
  const CFG = {
    world: { half: 82, radius: 1.05, height: 2.15, fogStart: 26, fogEnd: 138 },
    player: { walk: 10.4, sprint: 15.7, health: 100, regenDelay: 5.75, regen: 4.2 },
    tool: { name: 'RUNNER CARBINE', mag: 30, reserve: 90, power: 38, focusPower: 92, range: 104, delay: 0.115, reload: 1.2, kick: 0.026, spread: 0.015 },
    mob: { health: 76, hpRound: 13, speed: 3.0, speedRound: 0.13, touch: 1.7, contact: 14, contactDelay: 0.78 },
    rounds: { base: 6, add: 4, spawn: 0.7, grace: 1.25, gap: 4.0, activeBase: 7, activeScale: 2 }
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const c3 = (hex) => new BABYLON.Color3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const place = (node, x, y, z) => { node.position.x = x; node.position.y = y; node.position.z = z; return node; };
  const material = (scene, name, hex, alpha = 1) => {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = c3(hex);
    m.specularColor = c3(0x111111);
    m.alpha = alpha;
    return m;
  };
  const circleRect = (cx, cz, r, box) => {
    const x = clamp(cx, box.x - box.w / 2, box.x + box.w / 2);
    const z = clamp(cz, box.z - box.d / 2, box.z + box.d / 2);
    const dx = cx - x;
    const dz = cz - z;
    return dx * dx + dz * dz < r * r;
  };

  class Input {
    constructor() {
      this.move = { x: 0, y: 0 };
      this.look = { x: 0, y: 0 };
      this.active = false;
      this.reload = false;
      this.sprint = false;
      this.moveId = null;
      this.lookId = null;
      this.lastX = 0;
      this.lastY = 0;
      this.sens = 0.0043;
      this.keys = new Set();

      this.stick = $('move-stick');
      this.nub = this.stick.querySelector('.nub');
      this.lookZone = $('look-zone');
      this.actionButton = $('action-button');
      this.reloadButton = $('reload-button');
      this.sprintButton = $('sprint-button');

      this.stick.addEventListener('pointerdown', (e) => this.startMove(e));
      this.lookZone.addEventListener('pointerdown', (e) => this.startLook(e));
      window.addEventListener('pointermove', (e) => this.pointerMove(e), { passive: false });
      window.addEventListener('pointerup', (e) => this.pointerEnd(e));
      window.addEventListener('pointercancel', (e) => this.pointerEnd(e));

      this.actionButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.active = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => this.actionButton.addEventListener(name, () => { this.active = false; }));
      this.reloadButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.reload = true; });
      this.sprintButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.sprint = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => this.sprintButton.addEventListener(name, () => { this.sprint = false; }));

      window.addEventListener('keydown', (e) => {
        this.keys.add(e.code);
        if (e.code === 'Space') this.active = true;
        if (e.code === 'KeyR') this.reload = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
        this.syncKeys();
      });
      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
        if (e.code === 'Space') this.active = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
        this.syncKeys();
      });
    }

    startMove(e) {
      e.preventDefault();
      this.moveId = e.pointerId;
      this.updateStick(e.clientX, e.clientY);
    }

    startLook(e) {
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }

    pointerMove(e) {
      if (e.pointerId === this.moveId) {
        e.preventDefault();
        this.updateStick(e.clientX, e.clientY);
      }
      if (e.pointerId === this.lookId) {
        e.preventDefault();
        this.look.x += (e.clientX - this.lastX) * this.sens;
        this.look.y += (e.clientY - this.lastY) * this.sens;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    }

    pointerEnd(e) {
      if (e.pointerId === this.moveId) {
        this.moveId = null;
        this.move.x = 0;
        this.move.y = 0;
        this.nub.style.transform = 'translate(0px, 0px)';
        this.syncKeys();
      }
      if (e.pointerId === this.lookId) this.lookId = null;
    }

    updateStick(x, y) {
      const rect = this.stick.getBoundingClientRect();
      const max = rect.width * 0.33;
      let dx = x - (rect.left + rect.width / 2);
      let dy = y - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = dx / len * max;
        dy = dy / len * max;
      }
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = clamp(dx / max, -1, 1);
      this.move.y = clamp(dy / max, -1, 1);
    }

    syncKeys() {
      if (this.moveId !== null) return;
      const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const y = (this.keys.has('KeyW') ? -1 : 0) + (this.keys.has('KeyS') ? 1 : 0);
      if (!x && !y) {
        this.move.x = 0;
        this.move.y = 0;
        return;
      }
      const len = Math.hypot(x, y) || 1;
      this.move.x = x / len;
      this.move.y = y / len;
    }

    takeLook() {
      const out = { x: this.look.x, y: this.look.y };
      this.look.x = 0;
      this.look.y = 0;
      return out;
    }

    takeReload() {
      const out = this.reload;
      this.reload = false;
      return out;
    }
  }

  class World {
    constructor(scene) {
      this.scene = scene;
      this.half = CFG.world.half;
      this.colliders = [];
      this.spawns = [];
      this.m = {
        asphalt: material(scene, 'asphalt', 0x202427),
        grass: material(scene, 'grass', 0x2f3c28),
        concrete: material(scene, 'concrete', 0x6d7069),
        brick: material(scene, 'brick', 0x7a493b),
        rust: material(scene, 'rust', 0x8a5730),
        metal: material(scene, 'metal', 0x596469),
        dark: material(scene, 'dark metal', 0x202427),
        yellow: material(scene, 'yellow paint', 0xd7c362),
        glass: material(scene, 'dirty glass', 0x49606c, 0.72)
      };
      this.build();
    }

    build() {
      this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.09, 1);
      this.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
      this.scene.fogStart = CFG.world.fogStart;
      this.scene.fogEnd = CFG.world.fogEnd;
      this.scene.fogColor = c3(0x101720);

      const hemi = new BABYLON.HemisphericLight('overcast', new BABYLON.Vector3(0, 1, 0), this.scene);
      hemi.intensity = 0.86;
      hemi.diffuse = c3(0xbfd2ff);
      hemi.groundColor = c3(0x252718);

      const moon = new BABYLON.DirectionalLight('moon', new BABYLON.Vector3(-0.55, -1, 0.38), this.scene);
      moon.position = new BABYLON.Vector3(48, 90, -60);
      moon.intensity = 1.1;
      moon.diffuse = c3(0xb8caff);

      const ground = BABYLON.MeshBuilder.CreateGround('finite asphalt yard', { width: this.half * 2, height: this.half * 2, subdivisions: 4 }, this.scene);
      ground.material = this.m.asphalt;
      ground.isPickable = false;

      this.groundStrip(0, -this.half + 7, this.half * 2, 18);
      this.groundStrip(0, this.half - 7, this.half * 2, 18);
      this.groundStrip(-this.half + 8, 0, 12, this.half * 2);
      this.groundStrip(this.half - 8, 0, 12, this.half * 2);

      this.walls();
      this.lines();
      this.buildings();
      this.props();
      this.spawnPoints();
    }

    groundStrip(x, z, w, d) {
      const mesh = BABYLON.MeshBuilder.CreateGround('grass verge', { width: w, height: d }, this.scene);
      place(mesh, x, 0.012, z);
      mesh.material = this.m.grass;
      mesh.isPickable = false;
    }

    box(name, x, z, w, d, h, mat, y = h / 2, collide = true) {
      const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, depth: d, height: h }, this.scene);
      place(mesh, x, y, z);
      mesh.material = mat;
      mesh.isPickable = false;
      if (collide && h > 0.55) this.colliders.push({ x, z, w, d, name });
      return mesh;
    }

    walls() {
      const b = this.half;
      this.box('north wall', 0, -b - 1.2, b * 2 + 5, 3.2, 6, this.m.concrete);
      this.box('south wall', 0, b + 1.2, b * 2 + 5, 3.2, 6, this.m.concrete);
      this.box('west wall', -b - 1.2, 0, 3.2, b * 2 + 5, 6, this.m.concrete);
      this.box('east wall', b + 1.2, 0, 3.2, b * 2 + 5, 6, this.m.concrete);
      for (let i = -4; i <= 4; i += 1) {
        this.lamp(i * 20, -b + 5);
        this.lamp(i * 20, b - 5);
      }
    }

    lines() {
      for (let z = -64; z <= 64; z += 16) this.box('center stripe', 0, z, 0.32, 7.8, 0.055, this.m.yellow, 0.028, false);
      for (let x = -56; x <= 56; x += 16) this.box('cross stripe', x, 0, 8.2, 0.32, 0.055, this.m.yellow, 0.028, false);
      this.box('helipad north', 34, -48, 18, 0.28, 0.055, this.m.yellow, 0.028, false);
      this.box('helipad south', 34, -32, 18, 0.28, 0.055, this.m.yellow, 0.028, false);
      this.box('helipad west', 25, -40, 0.28, 16, 0.055, this.m.yellow, 0.028, false);
      this.box('helipad east', 43, -40, 0.28, 16, 0.055, this.m.yellow, 0.028, false);
    }

    buildings() {
      this.box('generator block', -48, -34, 24, 20, 11, this.m.brick);
      this.box('loading dock', -48, -17, 18, 8, 7, this.m.dark);
      this.box('cold storage', 43, -31, 22, 24, 13, this.m.concrete);
      this.box('vehicle bay', 54, 18, 18, 31, 10, this.m.metal);
      this.box('rust warehouse', -44, 34, 28, 22, 12, this.m.rust);
      this.box('admin hut', -7, 43, 24, 15, 8, this.m.concrete);
      this.windowRow(-48, -44.2, 4, 4, 6.2);
      this.windowRow(43, -43.2, 4, 4.5, 7.1);
      this.windowRow(-44, 22.8, 5, 4.8, 6.5);
      this.tower(20, 45);
      this.tower(-59, 5);
      this.containerRow(18, -17, 4, false);
      this.containerRow(-15, -49, 5, true);
      this.containerRow(18, 22, 4, true);
    }

    windowRow(cx, z, count, width, y) {
      for (let i = 0; i < count; i += 1) {
        this.box('dirty window', cx + (i - (count - 1) / 2) * (width + 1.5), z, width, 0.18, 2.4, this.m.glass, y, false);
      }
    }

    containerRow(x, z, count, vertical) {
      for (let i = 0; i < count; i += 1) this.box('cargo container', vertical ? x : x + i * 9.5, vertical ? z + i * 9.5 : z, vertical ? 6 : 8.5, vertical ? 8.5 : 6, 4.6, i % 2 ? this.m.metal : this.m.rust);
    }

    tower(x, z) {
      [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]].forEach(([lx, lz]) => this.box('watchtower leg', x + lx, z + lz, 0.45, 0.45, 10, this.m.dark, 5, false));
      this.box('watchtower platform', x, z, 7.2, 7.2, 1, this.m.metal, 10.2, false);
      this.box('watchtower roof', x, z, 8.4, 8.4, 0.5, this.m.dark, 14.8, false);
      this.colliders.push({ x, z, w: 7.5, d: 7.5, name: 'watchtower' });
    }

    lamp(x, z) {
      const pole = BABYLON.MeshBuilder.CreateCylinder('lamp pole', { height: 7, diameterTop: 0.18, diameterBottom: 0.24, tessellation: 8 }, this.scene);
      place(pole, x, 3.5, z);
      pole.material = this.m.dark;
      pole.isPickable = false;
      this.box('lamp head', x, z, 2.4, 1, 0.55, this.m.yellow, 7.25, false);
      const light = new BABYLON.PointLight(`lamp ${x} ${z}`, new BABYLON.Vector3(x, 6.2, z), this.scene);
      light.diffuse = c3(0xffcf7a);
      light.range = 24;
      light.intensity = 0.15;
    }

    props() {
      this.car(-19, -7, 0.35, 0x2f4a57);
      this.car(29, 6, -0.28, 0x713333);
      this.car(8, -36, 1.45, 0x535d43);
      this.car(-32, 8, -0.66, 0x4c4c52);
      this.box('concrete barricade', 0, 58, 17, 2, 1.2, this.m.concrete, 0.8);
      this.box('concrete barricade', 0, -58, 17, 2, 1.2, this.m.concrete, 0.8);
      this.box('concrete barricade', -63, -12, 2, 17, 1.2, this.m.concrete, 0.8);
      this.box('concrete barricade', 63, 2, 2, 17, 1.2, this.m.concrete, 0.8);
      for (let i = 0; i < 26; i += 1) {
        const x = rand(-66, 66);
        const z = rand(-66, 66);
        if ((Math.abs(x) > 10 || Math.abs(z) > 10) && !this.blocked(x, z, 2.8)) this.crate(x, z);
      }
    }

    car(x, z, yaw, hex) {
      const m = material(this.scene, `car mat ${x}`, hex);
      const body = this.box('abandoned car body', x, z, 5.2, 8, 1.45, m, 0.78, false);
      body.rotation.y = yaw;
      const cabin = this.box('abandoned car cabin', x - Math.sin(yaw) * 0.35, z - Math.cos(yaw) * 0.35, 4.4, 3.4, 1.4, this.m.glass, 1.95, false);
      cabin.rotation.y = yaw;
      this.colliders.push({ x, z, w: Math.abs(Math.cos(yaw)) * 5.4 + Math.abs(Math.sin(yaw)) * 8.2, d: Math.abs(Math.sin(yaw)) * 5.4 + Math.abs(Math.cos(yaw)) * 8.2, name: 'abandoned car' });
    }

    crate(x, z) {
      const size = rand(1.5, 3.2);
      const crate = this.box('loose crate', x, z, size, size, size, this.m.rust, size / 2, false);
      crate.rotation.y = rand(0, Math.PI * 2);
      this.colliders.push({ x, z, w: size + 0.35, d: size + 0.35, name: 'crate' });
    }

    spawnPoints() {
      const b = this.half - 9;
      this.spawns = [[-55, -b], [0, -b], [55, -b], [-b, -42], [-b, 0], [-b, 42], [b, -42], [b, 0], [b, 42], [-48, b], [6, b], [51, b]].map(([x, z]) => new BABYLON.Vector3(x, 0, z));
    }

    blocked(x, z, radius) {
      if (x < -this.half + radius || x > this.half - radius || z < -this.half + radius || z > this.half - radius) return true;
      return this.colliders.some((box) => circleRect(x, z, radius, box));
    }

    move(p, dx, dz, radius) {
      const nx = p.x + dx;
      if (!this.blocked(nx, p.z, radius)) p.x = nx;
      const nz = p.z + dz;
      if (!this.blocked(p.x, nz, radius)) p.z = nz;
    }

    spawnAway(player) {
      let best = this.spawns[0];
      let bestDistance = -Infinity;
      for (const p of this.spawns) {
        const dx = p.x - player.x;
        const dz = p.z - player.z;
        const distance = dx * dx + dz * dz + rand(-12, 12);
        if (distance > bestDistance) {
          best = p;
          bestDistance = distance;
        }
      }
      return best.clone();
    }
  }

  class Enemy {
    constructor(scene, world, spawn, round, mats) {
      this.scene = scene;
      this.world = world;
      this.mats = mats;
      this.hp = CFG.mob.health + round * CFG.mob.hpRound;
      this.maxHp = this.hp;
      this.speed = CFG.mob.speed + round * CFG.mob.speedRound + rand(-0.15, 0.28);
      this.radius = 0.88;
      this.clock = rand(0, CFG.mob.contactDelay);
      this.stagger = 0;
      this.age = 0;
      this.removed = false;
      this.parts = [];
      this.root = new BABYLON.TransformNode('runner foe', scene);
      this.root.position.copyFrom(spawn);
      this.body();
    }

    target(mesh, zone, x, y, z, mat) {
      place(mesh, x, y, z);
      mesh.parent = this.root;
      mesh.material = mat;
      mesh.isPickable = true;
      mesh.metadata = { enemy: this, zone };
      this.parts.push(mesh);
      return mesh;
    }

    body() {
      this.target(BABYLON.MeshBuilder.CreateCylinder('foe torso', { height: 1.4, diameterTop: 0.82, diameterBottom: 0.68, tessellation: 10 }, this.scene), 'body', 0, 1.45, 0, this.mats.shirt);
      const focus = this.target(BABYLON.MeshBuilder.CreateSphere('foe focus', { diameter: 0.86, segments: 12 }, this.scene), 'focus', 0, 2.45, 0, this.mats.skin);
      focus.scaling.x = 0.92;
      focus.scaling.y = 1.08;
      focus.scaling.z = 0.9;
      this.target(BABYLON.MeshBuilder.CreateBox('foe mark', { width: 0.5, height: 0.15, depth: 0.22 }, this.scene), 'focus', 0, 2.25, -0.36, this.mats.mark);
      this.target(BABYLON.MeshBuilder.CreateBox('foe hips', { width: 0.95, height: 0.36, depth: 0.55 }, this.scene), 'body', 0, 0.82, 0, this.mats.pants);
      this.limb(-0.72, 1.52, -0.16, 0.23, 1.02, 0.42, 0.22, this.mats.skin, 'arm');
      this.limb(0.72, 1.52, -0.16, 0.23, 1.02, 0.42, -0.22, this.mats.skin, 'arm');
      this.limb(-0.28, 0.32, 0.02, 0.27, 0.88, 0, 0.08, this.mats.pants, 'leg');
      this.limb(0.28, 0.32, 0.02, 0.27, 0.88, 0, -0.08, this.mats.pants, 'leg');

      this.barBack = BABYLON.MeshBuilder.CreatePlane('foe bar back', { width: 1.35, height: 0.11 }, this.scene);
      place(this.barBack, 0, 3.18, 0);
      this.barBack.material = this.mats.barBack;
      this.barBack.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      this.barBack.parent = this.root;
      this.barBack.isPickable = false;

      this.bar = BABYLON.MeshBuilder.CreatePlane('foe bar', { width: 1.28, height: 0.075 }, this.scene);
      place(this.bar, 0, 3.181, -0.003);
      this.bar.material = this.mats.barHigh;
      this.bar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      this.bar.parent = this.root;
      this.bar.isPickable = false;
    }

    limb(x, y, z, diameter, height, rx, rz, mat, name) {
      const mesh = this.target(BABYLON.MeshBuilder.CreateCylinder(`foe ${name}`, { height, diameter, tessellation: 8 }, this.scene), 'body', x, y, z, mat);
      mesh.rotation.x = rx;
      mesh.rotation.z = rz;
      return mesh;
    }

    update(dt, player) {
      if (this.removed) return 0;
      this.age += dt;
      this.clock -= dt;
      this.stagger = Math.max(0, this.stagger - dt * 3.7);
      const dx = player.x - this.root.position.x;
      const dz = player.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      const inv = distance > 0.0001 ? 1 / distance : 0;
      const dirX = dx * inv;
      const dirZ = dz * inv;

      this.root.rotation.y = Math.atan2(dirX, dirZ);
      this.root.position.y = Math.sin(this.age * 7.4) * 0.035;
      this.parts.forEach((part, i) => {
        if (part.name.indexOf('arm') >= 0) part.rotation.x = 0.42 + Math.sin(this.age * 5.3 + i) * 0.18;
        if (part.name.indexOf('leg') >= 0) part.rotation.x = Math.sin(this.age * 7.2 + i) * 0.16;
      });

      if (distance > CFG.mob.touch) {
        const flank = Math.sin(this.age * 1.6) * 0.26;
        const speed = this.speed * (1 - this.stagger * 0.72) * dt;
        const oldX = this.root.position.x;
        const oldZ = this.root.position.z;
        this.root.position.x += (dirX + dirZ * flank) * speed;
        if (this.world.blocked(this.root.position.x, this.root.position.z, this.radius)) this.root.position.x = oldX;
        this.root.position.z += (dirZ - dirX * flank) * speed;
        if (this.world.blocked(this.root.position.x, this.root.position.z, this.radius)) this.root.position.z = oldZ;
        return 0;
      }

      if (this.clock <= 0) {
        this.clock = CFG.mob.contactDelay;
        this.stagger = 0.36;
        return CFG.mob.contact;
      }
      return 0;
    }

    impact(amount) {
      if (this.removed) return false;
      this.hp -= amount;
      this.stagger = clamp(this.stagger + 0.42, 0, 1);
      const pct = clamp(this.hp / this.maxHp, 0, 1);
      this.bar.scaling.x = pct;
      this.bar.position.x = -(1 - pct) * 0.64;
      this.bar.material = pct <= 0.25 ? this.mats.barLow : pct <= 0.5 ? this.mats.barMid : this.mats.barHigh;
      if (this.hp <= 0) {
        this.removed = true;
        this.dispose();
        return true;
      }
      return false;
    }

    dispose() {
      this.parts.forEach((part) => part.dispose(false, true));
      if (this.barBack) this.barBack.dispose(false, true);
      if (this.bar) this.bar.dispose(false, true);
      this.root.dispose();
    }
  }

  class Game {
    constructor() {
      this.canvas = $('game-canvas');
      this.startScreen = $('start-screen');
      this.gameOverScreen = $('game-over-screen');
      this.hud = $('hud');
      this.touchLayer = $('touch-layer');
      this.roundValue = $('round-value');
      this.scoreValue = $('score-value');
      this.activeValue = $('active-value');
      this.healthFill = $('health-fill');
      this.healthText = $('health-text');
      this.ammoValue = $('ammo-value');
      this.toolState = $('tool-state');
      this.roundBanner = $('round-banner');
      this.feedback = $('feedback-vignette');
      this.finalRound = $('final-round');
      this.finalScore = $('final-score');

      this.booted = false;
      this.running = false;
      this.over = false;
      this.starting = false;

      $('start-button').addEventListener('click', () => this.start());
      $('restart-button').addEventListener('click', () => this.restart());

      window.addEventListener('error', (event) => {
        console.error(event.error || event.message);
        if (!this.booted) this.showBootError(event.message || 'Startup error');
      });
    }

    showBootError(message) {
      this.startScreen.classList.add('visible');
      const hint = this.startScreen.querySelector('.hint');
      if (hint) hint.textContent = `Startup failed: ${message}. Refresh with ?v=${VERSION}.`;
    }

    boot() {
      if (this.booted) return true;
      if (!window.BABYLON) {
        this.showBootError('Babylon.js did not load');
        return false;
      }

      this.engine = new BABYLON.Engine(this.canvas, true);
      this.engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.55));
      this.scene = new BABYLON.Scene(this.engine);
      this.camera = new BABYLON.FreeCamera('player camera', new BABYLON.Vector3(0, CFG.world.height, 50), this.scene);
      this.camera.minZ = 0.08;
      this.camera.maxZ = 220;
      this.scene.activeCamera = this.camera;

      this.input = new Input();
      this.world = new World(this.scene);
      this.enemyMats = this.makeEnemyMats();
      this.enemies = [];

      this.player = { pos: new BABYLON.Vector3(0, CFG.world.height, 50), yaw: Math.PI, pitch: 0, health: CFG.player.health, lastHit: -Infinity };
      this.round = 0;
      this.score = 0;
      this.spawned = 0;
      this.toSpawn = 0;
      this.spawnTimer = 0;
      this.roundGap = 0;
      this.cooldown = 0;
      this.reloadTimer = 0;
      this.ammo = CFG.tool.mag;
      this.reserve = CFG.tool.reserve;
      this.flashTime = 0;
      this.last = performance.now();

      this.makeTool();
      this.updateCamera();
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
      this.engine.runRenderLoop(() => this.frame());
      this.booted = true;
      return true;
    }

    makeEnemyMats() {
      return {
        shirt: material(this.scene, 'foe shirt', 0x656743),
        skin: material(this.scene, 'foe skin', 0x879762),
        pants: material(this.scene, 'foe pants', 0x303846),
        mark: material(this.scene, 'foe mark', 0x5b1010),
        barBack: material(this.scene, 'bar back', 0x151515, 0.82),
        barHigh: material(this.scene, 'bar high', 0xb6ff6b),
        barMid: material(this.scene, 'bar mid', 0xffd166),
        barLow: material(this.scene, 'bar low', 0xff5353)
      };
    }

    makeTool() {
      const body = material(this.scene, 'tool body', 0x25272a);
      const metal = material(this.scene, 'tool metal', 0x4b5359);
      const grip = material(this.scene, 'tool grip', 0x151617);
      const flash = material(this.scene, 'tool flash', 0xffe39a, 0);
      flash.emissiveColor = c3(0xffd073);

      this.toolRoot = new BABYLON.TransformNode('held tool', this.scene);
      this.toolRoot.parent = this.camera;
      place(this.toolRoot, 0.58, -0.55, 1.0);
      this.toolRoot.rotation.x = -0.05;
      this.toolRoot.rotation.y = -0.08;

      const add = (mesh, mat, x, y, z, rx = 0) => {
        place(mesh, x, y, z);
        mesh.rotation.x = rx;
        mesh.material = mat;
        mesh.parent = this.toolRoot;
        mesh.isPickable = false;
        return mesh;
      };

      add(BABYLON.MeshBuilder.CreateBox('receiver', { width: 0.22, height: 0.22, depth: 1.0 }, this.scene), body, 0, 0, 0.28);
      add(BABYLON.MeshBuilder.CreateCylinder('barrel', { height: 0.78, diameterTop: 0.035, diameterBottom: 0.05, tessellation: 12 }, this.scene), metal, 0, 0.04, 0.96, Math.PI / 2);
      add(BABYLON.MeshBuilder.CreateBox('grip', { width: 0.16, height: 0.36, depth: 0.18 }, this.scene), grip, 0.02, -0.26, -0.02, -0.2);
      add(BABYLON.MeshBuilder.CreateBox('magazine', { width: 0.18, height: 0.42, depth: 0.24 }, this.scene), metal, 0.01, -0.29, 0.25, -0.12);
      this.flash = add(BABYLON.MeshBuilder.CreateCylinder('muzzle flash', { height: 0.34, diameterTop: 0, diameterBottom: 0.3, tessellation: 12 }, this.scene), flash, 0, 0.04, 1.36, Math.PI / 2);
    }

    start() {
      if (this.starting) return;
      this.starting = true;
      this.startScreen.classList.remove('visible');
      this.gameOverScreen.classList.remove('visible');
      this.hud.classList.remove('hidden');
      this.touchLayer.classList.remove('hidden');

      try {
        if (!this.boot()) {
          this.hud.classList.add('hidden');
          this.touchLayer.classList.add('hidden');
          this.starting = false;
          return;
        }
        this.running = true;
        this.over = false;
        this.beginRound(1);
      } catch (error) {
        console.error(error);
        this.hud.classList.add('hidden');
        this.touchLayer.classList.add('hidden');
        this.showBootError(error && error.message ? error.message : 'Boot failed');
      }
      this.starting = false;
    }

    restart() {
      if (!this.booted) return this.start();
      this.enemies.forEach((enemy) => enemy.dispose());
      this.enemies = [];
      this.player.pos.x = 0;
      this.player.pos.y = CFG.world.height;
      this.player.pos.z = 50;
      this.player.yaw = Math.PI;
      this.player.pitch = 0;
      this.player.health = CFG.player.health;
      this.player.lastHit = -Infinity;
      this.round = 0;
      this.score = 0;
      this.spawned = 0;
      this.toSpawn = 0;
      this.spawnTimer = 0;
      this.roundGap = 0;
      this.cooldown = 0;
      this.reloadTimer = 0;
      this.ammo = CFG.tool.mag;
      this.reserve = CFG.tool.reserve;
      this.gameOverScreen.classList.remove('visible');
      this.hud.classList.remove('hidden');
      this.touchLayer.classList.remove('hidden');
      this.running = true;
      this.over = false;
      this.beginRound(1);
    }

    beginRound(round) {
      this.round = round;
      this.spawned = 0;
      this.toSpawn = CFG.rounds.base + (round - 1) * CFG.rounds.add;
      this.spawnTimer = CFG.rounds.grace;
      this.roundGap = 0;
      this.banner(`Round ${round}`);
      this.updateHUD();
    }

    banner(text) {
      this.roundBanner.textContent = text;
      this.roundBanner.classList.add('show');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => this.roundBanner.classList.remove('show'), 1600);
    }

    frame() {
      const now = performance.now();
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      if (this.running && !this.over) this.update(dt);
      this.scene.render();
    }

    update(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.flashTime = Math.max(0, this.flashTime - dt);
      this.flash.material.alpha = this.flashTime > 0 ? clamp(this.flashTime * 12, 0, 0.88) : 0;
      this.look();
      this.move(dt);
      this.updateCamera();
      this.updateTool(dt);
      this.updateRounds(dt);
      this.updateEnemies(dt);
      this.regen(dt);
      this.updateHUD();
    }

    look() {
      const look = this.input.takeLook();
      this.player.yaw -= look.x;
      this.player.pitch = clamp(this.player.pitch - look.y, -1.22, 1.15);
    }

    move(dt) {
      const move = this.input.move;
      const forward = -move.y;
      const strafe = move.x;
      if (Math.abs(forward) < 0.001 && Math.abs(strafe) < 0.001) return;
      const speed = this.input.sprint ? CFG.player.sprint : CFG.player.walk;
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      this.world.move(this.player.pos, (sin * forward + cos * strafe) * speed * dt, (cos * forward - sin * strafe) * speed * dt, CFG.world.radius);
    }

    updateTool(dt) {
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        this.toolState.textContent = 'RELOADING';
        this.toolRoot.rotation.x = -0.32 + Math.sin(this.reloadTimer * 20) * 0.04;
        if (this.reloadTimer <= 0) this.finishReload();
        return;
      }
      this.toolState.textContent = CFG.tool.name;
      this.toolRoot.rotation.x += (-0.05 - this.toolRoot.rotation.x) * Math.min(1, dt * 12);
      this.toolRoot.position.y = -0.55 + Math.sin(performance.now() * 0.006) * 0.008;
      if (this.input.takeReload()) this.startReload();
      if (this.input.active) this.useTool();
    }

    useTool() {
      if (this.cooldown > 0 || this.reloadTimer > 0) return;
      if (this.ammo <= 0) {
        this.startReload();
        return;
      }
      this.cooldown = CFG.tool.delay;
      this.ammo -= 1;
      this.flashTime = 0.08;
      this.toolRoot.rotation.x -= CFG.tool.kick;
      this.player.pitch = clamp(this.player.pitch + CFG.tool.kick * 0.18, -1.22, 1.15);

      const ray = this.camera.getForwardRay(CFG.tool.range);
      ray.direction.x += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.y += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.z += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.normalize();

      const hit = this.scene.pickWithRay(ray, (mesh) => mesh.metadata && mesh.metadata.enemy && !mesh.metadata.enemy.removed);
      if (!hit || !hit.hit || !hit.pickedMesh || !hit.pickedMesh.metadata) return;
      const enemy = hit.pickedMesh.metadata.enemy;
      const zone = hit.pickedMesh.metadata.zone;
      if (enemy.impact(zone === 'focus' ? CFG.tool.focusPower : CFG.tool.power)) {
        this.score += 1;
        this.enemies = this.enemies.filter((item) => !item.removed);
      }
    }

    startReload() {
      if (this.reloadTimer > 0 || this.ammo >= CFG.tool.mag || this.reserve <= 0) return;
      this.reloadTimer = CFG.tool.reload;
    }

    finishReload() {
      const load = Math.min(CFG.tool.mag - this.ammo, this.reserve);
      this.ammo += load;
      this.reserve -= load;
      this.toolRoot.rotation.x = -0.05;
    }

    updateRounds(dt) {
      if (this.roundGap > 0) {
        this.roundGap -= dt;
        if (this.roundGap <= 0) this.beginRound(this.round + 1);
        return;
      }
      const maxActive = CFG.rounds.activeBase + Math.floor(this.round * CFG.rounds.activeScale);
      if (this.spawned < this.toSpawn && this.enemies.length < maxActive) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.enemies.push(new Enemy(this.scene, this.world, this.world.spawnAway(this.player.pos), this.round, this.enemyMats));
          this.spawned += 1;
          this.spawnTimer = Math.max(0.22, CFG.rounds.spawn - this.round * 0.025);
        }
      }
      if (this.spawned >= this.toSpawn && this.enemies.length === 0 && this.roundGap <= 0) {
        this.roundGap = CFG.rounds.gap;
        this.reserve += Math.min(30, 8 + this.round * 3);
        this.banner(`Round ${this.round} clear`);
      }
    }

    updateEnemies(dt) {
      let contact = 0;
      for (const enemy of this.enemies) contact += enemy.update(dt, this.player.pos);
      if (contact > 0) this.hurt(contact);
    }

    hurt(amount) {
      this.player.health = clamp(this.player.health - amount, 0, CFG.player.health);
      this.player.lastHit = performance.now() / 1000;
      this.feedback.style.opacity = '1';
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = setTimeout(() => { this.feedback.style.opacity = '0'; }, 120);
      if (this.player.health <= 0) this.end();
    }

    regen(dt) {
      if (performance.now() / 1000 - this.player.lastHit > CFG.player.regenDelay && this.player.health > 0) {
        this.player.health = clamp(this.player.health + CFG.player.regen * dt, 0, CFG.player.health);
      }
    }

    end() {
      this.over = true;
      this.running = false;
      this.hud.classList.add('hidden');
      this.touchLayer.classList.add('hidden');
      this.finalRound.textContent = `Round ${this.round}`;
      this.finalScore.textContent = `${this.score} clears · ${VERSION}`;
      this.gameOverScreen.classList.add('visible');
    }

    updateCamera() {
      this.camera.position.copyFrom(this.player.pos);
      this.camera.rotation.x = this.player.pitch;
      this.camera.rotation.y = this.player.yaw;
      this.camera.rotation.z = 0;
    }

    updateHUD() {
      this.roundValue.textContent = this.round;
      this.scoreValue.textContent = this.score;
      this.activeValue.textContent = this.enemies.length;
      this.healthFill.style.width = `${this.player.health}%`;
      this.healthText.textContent = Math.ceil(this.player.health);
      this.ammoValue.textContent = `${this.ammo} / ${this.reserve}`;
    }

    resize() {
      if (!this.engine || !this.camera) return;
      this.engine.resize();
      this.camera.fov = window.innerWidth < window.innerHeight ? 1.28 : 1.12;
    }
  }

  window.addEventListener('DOMContentLoaded', () => new Game());
})();