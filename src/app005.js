(() => {
  'use strict';

  const VERSION = 'zombies-005';
  const CFG = {
    world: { half: 70, playerHeight: 2.1, playerRadius: 1.05 },
    player: { walk: 10.5, sprint: 15.0, maxHealth: 100, regenDelay: 5.0, regenRate: 3.5 },
    tool: { name: 'M14 WALLBUY', mag: 14, reserve: 70, damage: 45, headDamage: 110, range: 90, delay: 0.18, reload: 1.25, spread: 0.01, kick: 0.025 },
    wave: { base: 6, add: 4, gap: 3.5, spawnDelay: 0.85, maxActive: 10 },
    enemy: { hp: 68, hpRound: 14, speed: 2.7, speedRound: 0.13, hitRange: 1.6, hitDelay: 0.85, damage: 18 }
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const color = (hex) => BABYLON.Color3.FromHexString(hex);

  function mat(scene, name, diffuse, emissive = '#000000', alpha = 1) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = color(diffuse);
    m.emissiveColor = color(emissive);
    m.specularColor = BABYLON.Color3.Black();
    m.alpha = alpha;
    return m;
  }

  function place(mesh, x, y, z) {
    mesh.position.x = x;
    mesh.position.y = y;
    mesh.position.z = z;
    return mesh;
  }

  function circleRect(x, z, radius, rect) {
    const px = clamp(x, rect.x - rect.w / 2, rect.x + rect.w / 2);
    const pz = clamp(z, rect.z - rect.d / 2, rect.z + rect.d / 2);
    const dx = x - px;
    const dz = z - pz;
    return dx * dx + dz * dz < radius * radius;
  }

  class Input {
    constructor() {
      this.move = { x: 0, y: 0 };
      this.look = { x: 0, y: 0 };
      this.fire = false;
      this.reload = false;
      this.sprint = false;
      this.movePointer = null;
      this.lookPointer = null;
      this.baseX = 0;
      this.baseY = 0;
      this.lastLookX = 0;
      this.lastLookY = 0;
      this.sensitivity = 0.0046;

      this.moveZone = $('move-zone');
      this.lookZone = $('look-zone');
      this.stick = $('move-stick');
      this.nub = this.stick.querySelector('.nub');
      this.fireButton = $('action-button');
      this.reloadButton = $('reload-button');
      this.sprintButton = $('sprint-button');

      this.moveZone.style.pointerEvents = 'auto';
      this.lookZone.style.pointerEvents = 'auto';

      this.moveZone.addEventListener('pointerdown', (e) => this.startMove(e), { passive: false });
      this.moveZone.addEventListener('pointermove', (e) => this.updateMove(e), { passive: false });
      this.moveZone.addEventListener('pointerup', (e) => this.endMove(e));
      this.moveZone.addEventListener('pointercancel', (e) => this.endMove(e));

      this.lookZone.addEventListener('pointerdown', (e) => this.startLook(e), { passive: false });
      this.lookZone.addEventListener('pointermove', (e) => this.updateLook(e), { passive: false });
      this.lookZone.addEventListener('pointerup', (e) => this.endLook(e));
      this.lookZone.addEventListener('pointercancel', (e) => this.endLook(e));

      this.fireButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.fire = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => this.fireButton.addEventListener(type, () => { this.fire = false; }));
      this.reloadButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.reload = true; });
      this.sprintButton.addEventListener('pointerdown', (e) => { e.preventDefault(); this.sprint = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => this.sprintButton.addEventListener(type, () => { this.sprint = false; }));

      const keys = new Set();
      window.addEventListener('keydown', (e) => {
        keys.add(e.code);
        if (e.code === 'Space') this.fire = true;
        if (e.code === 'KeyR') this.reload = true;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
        this.syncKeys(keys);
      });
      window.addEventListener('keyup', (e) => {
        keys.delete(e.code);
        if (e.code === 'Space') this.fire = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
        this.syncKeys(keys);
      });
    }

    startMove(e) {
      e.preventDefault();
      if (this.movePointer !== null) return;
      this.movePointer = e.pointerId;
      this.moveZone.setPointerCapture?.(e.pointerId);
      const size = this.stick.offsetWidth || 140;
      this.baseX = clamp(e.clientX, size / 2 + 10, window.innerWidth * 0.52 - size / 2 - 10);
      this.baseY = clamp(e.clientY, size / 2 + 10, window.innerHeight - size / 2 - 10);
      this.stick.style.left = `${this.baseX - size / 2}px`;
      this.stick.style.top = `${this.baseY - size / 2}px`;
      this.stick.style.bottom = 'auto';
      this.stick.classList.add('active');
      this.applyMove(e.clientX, e.clientY);
    }

    updateMove(e) {
      if (e.pointerId !== this.movePointer) return;
      e.preventDefault();
      this.applyMove(e.clientX, e.clientY);
    }

    endMove(e) {
      if (e.pointerId !== this.movePointer) return;
      this.movePointer = null;
      this.move.x = 0;
      this.move.y = 0;
      this.nub.style.transform = 'translate(0px, 0px)';
      this.stick.classList.remove('active');
    }

    applyMove(x, y) {
      const max = (this.stick.offsetWidth || 140) * 0.36;
      let dx = x - this.baseX;
      let dy = y - this.baseY;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = dx / len * max;
        dy = dy / len * max;
      }
      const dead = 0.08;
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = Math.abs(dx / max) < dead ? 0 : clamp(dx / max, -1, 1);
      this.move.y = Math.abs(dy / max) < dead ? 0 : clamp(dy / max, -1, 1);
    }

    startLook(e) {
      e.preventDefault();
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lookZone.setPointerCapture?.(e.pointerId);
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    }

    updateLook(e) {
      if (e.pointerId !== this.lookPointer) return;
      e.preventDefault();
      this.look.x += (e.clientX - this.lastLookX) * this.sensitivity;
      this.look.y += (e.clientY - this.lastLookY) * this.sensitivity;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    }

    endLook(e) {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    }

    takeLook() {
      const value = { x: this.look.x, y: this.look.y };
      this.look.x = 0;
      this.look.y = 0;
      return value;
    }

    takeReload() {
      const value = this.reload;
      this.reload = false;
      return value;
    }

    syncKeys(keys) {
      if (this.movePointer !== null) return;
      const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const y = (keys.has('KeyW') ? -1 : 0) + (keys.has('KeyS') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      this.move.x = x / len;
      this.move.y = y / len;
      if (!x && !y) this.move.x = this.move.y = 0;
    }
  }

  class World {
    constructor(scene) {
      this.scene = scene;
      this.half = CFG.world.half;
      this.colliders = [];
      this.spawns = [];
      this.m = {
        floor: mat(scene, 'floor', '#232629'),
        wall: mat(scene, 'wall concrete', '#686b66'),
        lane: mat(scene, 'old yellow paint', '#c2a64d'),
        brick: mat(scene, 'old brick', '#714432'),
        metal: mat(scene, 'dark metal', '#2a3033'),
        glass: mat(scene, 'dirty glass', '#435660', '#000000', 0.7),
        board: mat(scene, 'boards', '#6b4129'),
        glow: mat(scene, 'amber glow', '#ffd166', '#5a3000'),
        machineBlue: mat(scene, 'machine blue', '#294d79', '#0b1b30'),
        machineRed: mat(scene, 'machine red', '#783434', '#2a0909')
      };
      this.build();
    }

    build() {
      this.scene.clearColor = new BABYLON.Color4(0.04, 0.055, 0.065, 1);
      this.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
      this.scene.fogStart = CFG.world.fogStart;
      this.scene.fogEnd = CFG.world.fogEnd;
      this.scene.fogColor = color('#101820');

      const hemi = new BABYLON.HemisphericLight('cold ambient', new BABYLON.Vector3(0, 1, 0), this.scene);
      hemi.intensity = 0.75;
      hemi.diffuse = color('#9bb4d0');
      hemi.groundColor = color('#222015');
      const dir = new BABYLON.DirectionalLight('yard moon', new BABYLON.Vector3(-0.4, -1, 0.4), this.scene);
      dir.position = new BABYLON.Vector3(40, 70, -40);
      dir.intensity = 0.9;

      const floor = BABYLON.MeshBuilder.CreateGround('yard floor', { width: this.half * 2, height: this.half * 2 }, this.scene);
      floor.material = this.m.floor;
      floor.isPickable = false;

      this.box('north wall', 0, -this.half - 1, this.half * 2 + 4, 3, 6, this.m.wall);
      this.box('south wall', 0, this.half + 1, this.half * 2 + 4, 3, 6, this.m.wall);
      this.box('west wall', -this.half - 1, 0, 3, this.half * 2 + 4, 6, this.m.wall);
      this.box('east wall', this.half + 1, 0, 3, this.half * 2 + 4, 6, this.m.wall);

      for (let z = -56; z <= 56; z += 16) this.box('lane dash', 0, z, 0.25, 7, 0.05, this.m.lane, 0.025, false);
      for (let x = -48; x <= 48; x += 18) this.box('cross dash', x, 0, 7, 0.25, 0.05, this.m.lane, 0.025, false);

      this.box('warehouse', -42, -28, 22, 24, 12, this.m.brick);
      this.box('loading dock', -41, -8, 24, 8, 6, this.m.metal);
      this.box('garage block', 43, -24, 24, 20, 11, this.m.wall);
      this.box('generator room', 46, 25, 18, 28, 10, this.m.metal);
      this.box('office', -22, 38, 26, 16, 8, this.m.wall);
      this.box('power shed', 12, 46, 16, 12, 7, this.m.brick);

      this.containerRow(-12, -46, 5, false);
      this.containerRow(18, 12, 4, true);
      this.containerRow(-54, 20, 3, true);

      this.car(-10, 18, 0.35, '#3f5360');
      this.car(25, -2, -0.2, '#703030');
      this.car(-35, 8, -0.55, '#4e5047');

      this.barrier(-42, 4, 0);
      this.barrier(-30, -40, 0.05);
      this.barrier(31, -34, 0);
      this.barrier(56, 15, Math.PI / 2);
      this.barrier(-55, 27, Math.PI / 2);

      this.sign('WALL BUY\nM14 500', -31, 3.6, -12.1, 0);
      this.sign('POWER\nOFFLINE', 17, 3.3, 39.8, Math.PI);
      this.sign('OPEN GATE\n1250', 0, 3.3, -66.8, 0);
      this.perk(33, 14, 'STAMINA\n2000', this.m.machineBlue);
      this.perk(-8, 31, 'MEDIC\n1500', this.m.machineRed);
      this.box('mystery supply box', 4, 14, 4.8, 2.5, 2.1, this.m.glow, 1.05, false);
      const supplyLight = new BABYLON.PointLight('supply amber', new BABYLON.Vector3(4, 3, 14), this.scene);
      supplyLight.diffuse = color('#ffd166');
      supplyLight.range = 18;
      supplyLight.intensity = 0.6;

      for (let i = 0; i < 22; i += 1) {
        const x = rand(-58, 58);
        const z = rand(-58, 58);
        if (!this.blocked(x, z, 2.5) && Math.hypot(x, z - 42) > 12) this.crate(x, z);
      }

      const b = this.half - 8;
      this.spawns = [[-54, -b], [0, -b], [54, -b], [-b, -36], [-b, 0], [-b, 36], [b, -36], [b, 0], [b, 36], [-48, b], [8, b], [50, b]].map(([x, z]) => new BABYLON.Vector3(x, 0, z));
    }

    box(name, x, z, w, d, h, material, y = h / 2, collide = true) {
      const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, depth: d, height: h }, this.scene);
      place(mesh, x, y, z);
      mesh.material = material;
      mesh.isPickable = false;
      if (collide && h > 0.5) this.colliders.push({ x, z, w, d, name });
      return mesh;
    }

    containerRow(x, z, count, vertical) {
      for (let i = 0; i < count; i += 1) this.box('cargo container', vertical ? x : x + i * 9.5, vertical ? z + i * 9.5 : z, vertical ? 6 : 8.5, vertical ? 8.5 : 6, 4.4, i % 2 ? this.m.metal : this.m.brick);
    }

    car(x, z, yaw, bodyColor) {
      const bodyMat = mat(this.scene, `car ${x}`, bodyColor);
      const body = this.box('abandoned car', x, z, 5.4, 8, 1.5, bodyMat, 0.75, false);
      body.rotation.y = yaw;
      const cabin = this.box('car cabin', x - Math.sin(yaw) * 0.3, z - Math.cos(yaw) * 0.3, 4.2, 3.2, 1.3, this.m.glass, 1.85, false);
      cabin.rotation.y = yaw;
      this.colliders.push({ x, z, w: Math.abs(Math.cos(yaw)) * 5.6 + Math.abs(Math.sin(yaw)) * 8.2, d: Math.abs(Math.sin(yaw)) * 5.6 + Math.abs(Math.cos(yaw)) * 8.2, name: 'car' });
    }

    crate(x, z) {
      const size = rand(1.4, 3);
      const crate = this.box('crate', x, z, size, size, size, this.m.brick, size / 2, false);
      crate.rotation.y = rand(0, Math.PI * 2);
      this.colliders.push({ x, z, w: size + 0.3, d: size + 0.3, name: 'crate' });
    }

    barrier(x, z, yaw) {
      for (let i = 0; i < 3; i += 1) {
        const board = this.box('wood barrier', x, z, 6, 0.25, 0.28, this.m.board, 2.3 + i * 0.72, false);
        board.rotation.y = yaw;
        board.rotation.z = i % 2 ? -0.12 : 0.1;
      }
    }

    perk(x, z, label, material) {
      this.box('perk machine', x, z, 2.5, 1.6, 4.6, material, 2.3, false);
      this.sign(label, x, 4.5, z - 0.86, 0, 2.4, 1.25);
    }

    sign(text, x, y, z, yaw, width = 5.4, height = 2.2) {
      const texture = new BABYLON.DynamicTexture(`sign ${text}`, { width: 512, height: 256 }, this.scene, true);
      const ctx = texture.getContext();
      ctx.fillStyle = 'rgba(4,8,10,.94)';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = 'rgba(255,210,120,.9)';
      ctx.lineWidth = 10;
      ctx.strokeRect(18, 18, 476, 220);
      ctx.fillStyle = 'rgba(255,232,190,.96)';
      ctx.font = 'bold 44px system-ui, sans-serif';
      text.split('\n').forEach((line, i) => ctx.fillText(line, 38, 90 + i * 58));
      texture.update();
      const sm = new BABYLON.StandardMaterial(`mat ${text}`, this.scene);
      sm.diffuseTexture = texture;
      sm.emissiveTexture = texture;
      sm.specularColor = BABYLON.Color3.Black();
      const plane = BABYLON.MeshBuilder.CreatePlane(`sign ${text}`, { width, height }, this.scene);
      place(plane, x, y, z);
      plane.rotation.y = yaw;
      plane.material = sm;
      plane.isPickable = false;
    }

    blocked(x, z, radius) {
      if (x < -this.half + radius || x > this.half - radius || z < -this.half + radius || z > this.half - radius) return true;
      return this.colliders.some((rect) => circleHitsRect(x, z, radius, rect));
    }

    move(position, dx, dz, radius) {
      const nx = position.x + dx;
      if (!this.blocked(nx, position.z, radius)) position.x = nx;
      const nz = position.z + dz;
      if (!this.blocked(position.x, nz, radius)) position.z = nz;
    }

    spawnAway(player) {
      let best = this.spawns[0];
      let bestScore = -Infinity;
      for (const spawn of this.spawns) {
        const dx = spawn.x - player.x;
        const dz = spawn.z - player.z;
        const score = dx * dx + dz * dz + rand(-20, 20);
        if (score > bestScore) {
          best = spawn;
          bestScore = score;
        }
      }
      return best.clone();
    }
  }

  class Enemy {
    constructor(scene, world, spawn, round, mats) {
      this.scene = scene;
      this.world = world;
      this.hp = CFG.enemy.hp + round * CFG.enemy.hpRound;
      this.maxHp = this.hp;
      this.speed = CFG.enemy.speed + round * CFG.enemy.speedPerRound + rand(-0.1, 0.25);
      this.hitClock = rand(0, CFG.enemy.hitDelay);
      this.age = 0;
      this.stagger = 0;
      this.dead = false;
      this.parts = [];
      this.root = new BABYLON.TransformNode('enemy root', scene);
      this.root.position.copyFrom(spawn);
      this.mats = mats;
      this.build();
    }

    target(mesh, zone, x, y, z, material) {
      place(mesh, x, y, z);
      mesh.parent = this.root;
      mesh.material = material;
      mesh.isPickable = true;
      mesh.metadata = { enemy: this, zone };
      this.parts.push(mesh);
      return mesh;
    }

    build() {
      this.target(BABYLON.MeshBuilder.CreateCylinder('enemy body', { height: 1.4, diameterTop: 0.82, diameterBottom: 0.7, tessellation: 10 }, this.scene), 'body', 0, 1.45, 0, this.mats.shirt);
      const head = this.target(BABYLON.MeshBuilder.CreateSphere('enemy head', { diameter: 0.86, segments: 12 }, this.scene), 'head', 0, 2.48, 0, this.mats.skin);
      head.scaling.y = 1.08;
      this.target(BABYLON.MeshBuilder.CreateBox('enemy mouth', { width: 0.52, height: 0.15, depth: 0.24 }, this.scene), 'head', 0, 2.27, -0.36, this.mats.mark);
      this.target(BABYLON.MeshBuilder.CreateBox('enemy hips', { width: 0.95, height: 0.36, depth: 0.55 }, this.scene), 'body', 0, 0.82, 0, this.mats.pants);
      this.limb(-0.72, 1.55, -0.18, 0.22, 1.05, 0.5, 0.2, this.mats.skin, 'arm');
      this.limb(0.72, 1.55, -0.18, 0.22, 1.05, 0.5, -0.2, this.mats.skin, 'arm');
      this.limb(-0.28, 0.35, 0, 0.25, 0.85, 0, 0.08, this.mats.pants, 'leg');
      this.limb(0.28, 0.35, 0, 0.25, 0.85, 0, -0.08, this.mats.pants, 'leg');
    }

    limb(x, y, z, diameter, height, rx, rz, material, name) {
      const mesh = this.target(BABYLON.MeshBuilder.CreateCylinder(`enemy ${name}`, { height, diameter, tessellation: 8 }, this.scene), 'body', x, y, z, material);
      mesh.rotation.x = rx;
      mesh.rotation.z = rz;
    }

    update(dt, player) {
      if (this.dead) return 0;
      this.age += dt;
      this.hitClock -= dt;
      this.stagger = Math.max(0, this.stagger - dt * 3.4);
      const dx = player.x - this.root.position.x;
      const dz = player.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      const inv = distance > 0.0001 ? 1 / distance : 0;
      const dirX = dx * inv;
      const dirZ = dz * inv;
      this.root.rotation.y = Math.atan2(dirX, dirZ);
      this.root.position.y = Math.sin(this.age * 7) * 0.035;
      for (let i = 0; i < this.parts.length; i += 1) {
        const part = this.parts[i];
        if (part.name.includes('arm')) part.rotation.x = 0.45 + Math.sin(this.age * 5.5 + i) * 0.18;
        if (part.name.includes('leg')) part.rotation.x = Math.sin(this.age * 7.5 + i) * 0.16;
      }
      if (distance > CFG.enemy.hitRange) {
        const speed = this.speed * (1 - this.stagger * 0.7) * dt;
        const oldX = this.root.position.x;
        const oldZ = this.root.position.z;
        this.root.position.x += dirX * speed;
        if (this.world.blocked(this.root.position.x, this.root.position.z, 0.9)) this.root.position.x = oldX;
        this.root.position.z += dirZ * speed;
        if (this.world.blocked(this.root.position.x, this.root.position.z, 0.9)) this.root.position.z = oldZ;
        return 0;
      }
      if (this.hitClock <= 0) {
        this.hitClock = CFG.enemy.hitDelay;
        this.stagger = 0.3;
        return CFG.enemy.damage;
      }
      return 0;
    }

    hurt(amount) {
      if (this.dead) return false;
      this.hp -= amount;
      this.stagger = clamp(this.stagger + 0.45, 0, 1);
      if (this.hp <= 0) {
        this.dead = true;
        this.dispose();
        return true;
      }
      return false;
    }

    dispose() {
      this.parts.forEach((mesh) => mesh.dispose(false, true));
      this.root.dispose();
    }
  }

  class Game {
    constructor() {
      this.canvas = $('game-canvas');
      this.startScreen = $('start-screen');
      this.overScreen = $('game-over-screen');
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
      this.started = false;
      $('start-button').addEventListener('click', () => this.start());
      $('restart-button').addEventListener('click', () => this.restart());
    }

    boot() {
      if (this.started) return;
      this.engine = new BABYLON.Engine(this.canvas, true);
      this.engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
      this.scene = new BABYLON.Scene(this.engine);
      this.camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, CFG.world.playerHeight, 42), this.scene);
      this.camera.minZ = 0.08;
      this.camera.maxZ = 180;
      this.camera.fov = window.innerWidth < window.innerHeight ? 1.28 : 1.12;
      this.scene.activeCamera = this.camera;
      this.input = new Input();
      this.world = new World(this.scene);
      this.enemyMats = {
        shirt: mat(this.scene, 'enemy shirt', '#697047'),
        skin: mat(this.scene, 'enemy skin', '#8a9862'),
        pants: mat(this.scene, 'enemy pants', '#303847'),
        mark: mat(this.scene, 'enemy mark', '#5b1010')
      };
      this.toolMats = {
        body: mat(this.scene, 'tool body', '#25272a'),
        metal: mat(this.scene, 'tool metal', '#4b5359'),
        flash: mat(this.scene, 'flash', '#ffe39a', '#ffb347', 0)
      };
      this.makeWeapon();
      this.resetState();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
      this.engine.runRenderLoop(() => this.frame());
      this.started = true;
    }

    makeWeapon() {
      this.weapon = new BABYLON.TransformNode('weapon', this.scene);
      this.weapon.parent = this.camera;
      place(this.weapon, 0.56, -0.53, 1.0);
      this.weapon.rotation.x = -0.05;
      this.weapon.rotation.y = -0.08;
      const add = (mesh, material, x, y, z, rx = 0) => {
        place(mesh, x, y, z);
        mesh.rotation.x = rx;
        mesh.material = material;
        mesh.parent = this.weapon;
        mesh.isPickable = false;
      };
      add(BABYLON.MeshBuilder.CreateBox('receiver', { width: 0.22, height: 0.22, depth: 0.95 }, this.scene), this.toolMats.body, 0, 0, 0.25);
      add(BABYLON.MeshBuilder.CreateCylinder('barrel', { height: 0.75, diameterTop: 0.035, diameterBottom: 0.05, tessellation: 10 }, this.scene), this.toolMats.metal, 0, 0.04, 0.9, Math.PI / 2);
      add(BABYLON.MeshBuilder.CreateBox('mag', { width: 0.18, height: 0.38, depth: 0.22 }, this.scene), this.toolMats.metal, 0, -0.28, 0.18, -0.12);
      this.flash = BABYLON.MeshBuilder.CreateCylinder('tool flash', { height: 0.32, diameterTop: 0, diameterBottom: 0.3, tessellation: 12 }, this.scene);
      place(this.flash, 0, 0.04, 1.27);
      this.flash.rotation.x = Math.PI / 2;
      this.flash.material = this.toolMats.flash;
      this.flash.parent = this.weapon;
      this.flash.isPickable = false;
    }

    resetState() {
      if (this.enemies) this.enemies.forEach((enemy) => enemy.dispose());
      this.enemies = [];
      this.player = { pos: new BABYLON.Vector3(0, CFG.world.playerHeight, 42), yaw: Math.PI, pitch: 0, health: CFG.player.maxHealth, lastHit: -Infinity };
      this.round = 0;
      this.points = 500;
      this.spawned = 0;
      this.toSpawn = 0;
      this.spawnTimer = 0;
      this.roundPause = 0;
      this.ammo = CFG.tool.mag;
      this.reserve = CFG.tool.reserve;
      this.reloadTimer = 0;
      this.cooldown = 0;
      this.flashTime = 0;
      this.running = true;
      this.gameOver = false;
      this.last = performance.now();
      this.beginRound(1);
      this.updateCamera();
      this.updateHUD();
    }

    start() {
      this.startScreen.classList.remove('visible');
      this.overScreen.classList.remove('visible');
      this.hud.classList.remove('hidden');
      this.touchLayer.classList.remove('hidden');
      this.boot();
      this.running = true;
    }

    restart() {
      this.overScreen.classList.remove('visible');
      this.hud.classList.remove('hidden');
      this.touchLayer.classList.remove('hidden');
      this.resetState();
    }

    beginRound(round) {
      this.round = round;
      this.spawned = 0;
      this.toSpawn = CFG.wave.base + (round - 1) * CFG.wave.addPerRound;
      this.spawnTimer = 0.75;
      this.roundPause = 0;
      this.banner(`Round ${round}`);
    }

    banner(text) {
      this.roundBanner.textContent = text;
      this.roundBanner.classList.add('show');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => this.roundBanner.classList.remove('show'), 1300);
    }

    frame() {
      const now = performance.now();
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      if (this.running && !this.gameOver) this.update(dt);
      this.scene.render();
    }

    update(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.flashTime = Math.max(0, this.flashTime - dt);
      this.flash.material.alpha = this.flashTime > 0 ? clamp(this.flashTime * 12, 0, 0.9) : 0;
      this.look();
      this.move(dt);
      this.updateCamera();
      this.weaponLogic(dt);
      this.waveLogic(dt);
      this.enemyLogic(dt);
      this.regen(dt);
      this.updateHUD();
    }

    look() {
      const look = this.input.takeLook();
      this.player.yaw -= look.x;
      this.player.pitch = clamp(this.player.pitch - look.y, -1.18, 1.12);
    }

    move(dt) {
      const x = this.input.move.x;
      const y = this.input.move.y;
      if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) return;
      const forward = -y;
      const strafe = x;
      const speed = this.input.sprint ? CFG.player.sprint : CFG.player.walk;
      const sin = Math.sin(this.player.yaw);
      const cos = Math.cos(this.player.yaw);
      const dx = (sin * forward + cos * strafe) * speed * dt;
      const dz = (cos * forward - sin * strafe) * speed * dt;
      this.world.move(this.player.pos, dx, dz, CFG.world.playerRadius);
    }

    weaponLogic(dt) {
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        this.toolState.textContent = 'RELOADING';
        this.weapon.rotation.x = -0.28 + Math.sin(this.reloadTimer * 22) * 0.04;
        if (this.reloadTimer <= 0) this.finishReload();
        return;
      }
      this.toolState.textContent = CFG.tool.name;
      this.weapon.rotation.x += (-0.05 - this.weapon.rotation.x) * Math.min(1, dt * 12);
      this.weapon.position.y = -0.53 + Math.sin(performance.now() * 0.006) * 0.008;
      if (this.input.takeReload()) this.startReload();
      if (this.input.fire) this.fire();
    }

    fire() {
      if (this.cooldown > 0 || this.reloadTimer > 0) return;
      if (this.ammo <= 0) return this.startReload();
      this.cooldown = CFG.tool.delay;
      this.ammo -= 1;
      this.flashTime = 0.08;
      this.weapon.rotation.x -= CFG.tool.kick;
      const ray = this.camera.getForwardRay(CFG.tool.range);
      ray.direction.x += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.y += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.z += rand(-CFG.tool.spread, CFG.tool.spread);
      ray.direction.normalize();
      const hit = this.scene.pickWithRay(ray, (mesh) => mesh.metadata && mesh.metadata.enemy && !mesh.metadata.enemy.dead);
      if (!hit || !hit.hit || !hit.pickedMesh) return;
      const enemy = hit.pickedMesh.metadata.enemy;
      const zone = hit.pickedMesh.metadata.zone;
      this.points += 10;
      if (enemy.hurt(zone === 'head' ? CFG.tool.headDamage : CFG.tool.damage)) {
        this.points += zone === 'head' ? 120 : 90;
        this.enemies = this.enemies.filter((item) => !item.dead);
      }
    }

    startReload() {
      if (this.reloadTimer > 0 || this.ammo >= CFG.tool.mag || this.reserve <= 0) return;
      this.reloadTimer = CFG.tool.reload;
    }

    finishReload() {
      const amount = Math.min(CFG.tool.mag - this.ammo, this.reserve);
      this.ammo += amount;
      this.reserve -= amount;
      this.weapon.rotation.x = -0.05;
    }

    waveLogic(dt) {
      if (this.roundPause > 0) {
        this.roundPause -= dt;
        if (this.roundPause <= 0) this.beginRound(this.round + 1);
        return;
      }
      if (this.spawned < this.toSpawn && this.enemies.length < CFG.wave.maxActive) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.enemies.push(new Enemy(this.scene, this.world, this.world.spawnAway(this.player.pos), this.round, this.enemyMats));
          this.spawned += 1;
          this.spawnTimer = Math.max(0.25, CFG.wave.spawnDelay - this.round * 0.025);
        }
      }
      if (this.spawned >= this.toSpawn && this.enemies.length === 0) {
        this.roundPause = CFG.wave.gap;
        this.reserve += Math.min(28, 8 + this.round * 3);
        this.banner(`Round ${this.round} clear`);
      }
    }

    enemyLogic(dt) {
      let damage = 0;
      for (const enemy of this.enemies) damage += enemy.update(dt, this.player.pos);
      if (damage > 0) this.damage(damage);
    }

    damage(amount) {
      this.player.health = clamp(this.player.health - amount, 0, CFG.player.maxHealth);
      this.player.lastHit = performance.now() / 1000;
      this.feedback.style.opacity = '1';
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = setTimeout(() => { this.feedback.style.opacity = '0'; }, 120);
      if (this.player.health <= 0) this.endGame();
    }

    regen(dt) {
      if (performance.now() / 1000 - this.player.lastHit > CFG.player.regenDelay) this.player.health = clamp(this.player.health + CFG.player.regenRate * dt, 0, CFG.player.maxHealth);
    }

    endGame() {
      this.gameOver = true;
      this.running = false;
      this.hud.classList.add('hidden');
      this.touchLayer.classList.add('hidden');
      this.finalRound.textContent = `Round ${this.round}`;
      this.finalScore.textContent = `${this.points} points · ${VERSION}`;
      this.overScreen.classList.add('visible');
    }

    updateCamera() {
      this.camera.position.copyFrom(this.player.pos);
      this.camera.rotation.x = this.player.pitch;
      this.camera.rotation.y = this.player.yaw;
      this.camera.rotation.z = 0;
    }

    updateHUD() {
      this.roundValue.textContent = this.round;
      this.scoreValue.textContent = this.points;
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