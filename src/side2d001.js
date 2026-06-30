(() => {
  'use strict';

  const VERSION = 'side2d-001';
  const CHUNK_W = 900;
  const GROUND_Y = 430;
  const GRAVITY = 1850;
  const MAX_DT = 1 / 30;
  const PLAYER = {
    w: 34,
    h: 58,
    speed: 245,
    accel: 2100,
    airAccel: 1100,
    friction: 1700,
    jump: 690,
    maxHealth: 100
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function hashInt(n) {
    let x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    let t = hashInt(seed + 0x6d2b79f5);
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function overPit(x, w, pits) {
    return pits.some((p) => x < p.x + p.w && x + w > p.x);
  }

  function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(target, value + amount);
    if (value > target) return Math.max(target, value - amount);
    return target;
  }

  function makeEnemy(def) {
    if (def.type === 'bat') return { id: def.id, type: 'bat', x: def.x, y: def.y, w: 38, h: 28, vx: 0, vy: 0, speed: 138, hp: 52, maxHp: 52, damage: 12, dir: -1, hitCd: 0, hurt: 0, t: Math.random() * 5 };
    if (def.type === 'crawler') return { id: def.id, type: 'crawler', x: def.x, y: def.y - 32, w: 42, h: 32, vx: 0, vy: 0, speed: 110, hp: 58, maxHp: 58, damage: 14, dir: -1, hitCd: 0, hurt: 0, onGround: false };
    return { id: def.id, type: 'walker', x: def.x, y: def.y - 54, w: 36, h: 54, vx: 0, vy: 0, speed: 82, hp: 82, maxHp: 82, damage: 18, dir: -1, hitCd: 0, hurt: 0, onGround: false };
  }

  class Input {
    constructor() {
      this.left = false;
      this.right = false;
      this.jump = false;
      this.fire = false;
      this.jumpPressed = false;
      this.bindButton('left-button', 'left');
      this.bindButton('right-button', 'right');
      this.bindButton('jump-button', 'jump');
      this.bindButton('fire-button', 'fire');
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
      window.addEventListener('blur', () => this.reset());
    }

    bindButton(id, prop) {
      const btn = $(id);
      if (!btn) return;
      const down = (e) => {
        e.preventDefault();
        if (prop === 'jump' && !this.jump) this.jumpPressed = true;
        this[prop] = true;
      };
      const up = (e) => {
        e.preventDefault();
        this[prop] = false;
      };
      btn.addEventListener('pointerdown', down, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => btn.addEventListener(type, up, { passive: false }));
    }

    key(e, down) {
      const code = e.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyJ', 'KeyK', 'ControlLeft', 'ControlRight'].includes(code)) e.preventDefault();
      if (code === 'ArrowLeft' || code === 'KeyA') this.left = down;
      if (code === 'ArrowRight' || code === 'KeyD') this.right = down;
      if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
        if (down && !this.jump) this.jumpPressed = true;
        this.jump = down;
      }
      if (code === 'KeyJ' || code === 'KeyK' || code === 'ControlLeft' || code === 'ControlRight') this.fire = down;
    }

    axis() {
      return (this.right ? 1 : 0) - (this.left ? 1 : 0);
    }

    consumeJump() {
      const v = this.jumpPressed;
      this.jumpPressed = false;
      return v;
    }

    reset() {
      this.left = false;
      this.right = false;
      this.jump = false;
      this.fire = false;
      this.jumpPressed = false;
    }
  }

  class ChunkWorld {
    constructor() {
      this.chunks = new Map();
      this.destroyed = new Set();
      this.killed = new Set();
    }

    reset() {
      this.chunks.clear();
      this.destroyed.clear();
      this.killed.clear();
    }

    ensureAround(x) {
      const idx = Math.floor(x / CHUNK_W);
      for (let i = idx - 4; i <= idx + 5; i += 1) {
        if (!this.chunks.has(i)) this.chunks.set(i, this.generate(i));
      }
      for (const key of Array.from(this.chunks.keys())) {
        if (Math.abs(key - idx) > 7) this.chunks.delete(key);
      }
    }

    generate(idx) {
      const random = rng(idx * 9973);
      const x0 = idx * CHUNK_W;
      const pits = [];
      const solids = [];
      const hazards = [];
      const decor = [];
      const breakables = [];
      const spawns = [];
      const safe = idx >= -1 && idx <= 1;

      if (!safe && random() > 0.35) {
        const pitW = 120 + random() * 110;
        const pitX = x0 + 250 + random() * (CHUNK_W - 470);
        pits.push({ x: pitX, w: pitW });
      }

      let cursor = x0 - 4;
      const sortedPits = pits.slice().sort((a, b) => a.x - b.x);
      for (const pit of sortedPits) {
        if (pit.x > cursor) solids.push({ x: cursor, y: GROUND_Y, w: pit.x - cursor, h: 760, kind: 'ground' });
        cursor = pit.x + pit.w;
      }
      if (cursor < x0 + CHUNK_W + 4) solids.push({ x: cursor, y: GROUND_Y, w: x0 + CHUNK_W + 4 - cursor, h: 760, kind: 'ground' });

      const catwalkCount = safe ? 1 : (random() > 0.42 ? 1 : 2);
      for (let i = 0; i < catwalkCount; i += 1) {
        const w = 160 + random() * 115;
        const x = x0 + 90 + random() * (CHUNK_W - 210);
        const y = GROUND_Y - (130 + random() * 105);
        if (!overPit(x + 20, w - 40, pits)) solids.push({ x, y, w, h: 18, kind: 'platform' });
      }

      const obstacleCount = safe ? (idx === 1 ? 1 : 0) : Math.floor(random() * 3);
      for (let i = 0; i < obstacleCount; i += 1) {
        const tall = random() > 0.56;
        const w = tall ? 34 : 54;
        const h = tall ? 76 : 48;
        const x = x0 + 120 + random() * (CHUNK_W - 240);
        if (overPit(x - 15, w + 30, pits)) continue;
        const id = `c${idx}-b${i}`;
        breakables.push({ id, x, y: GROUND_Y - h, w, h, hp: tall ? 90 : 55, maxHp: tall ? 90 : 55, kind: tall ? 'barricade' : 'crate' });
      }

      if (!safe && random() > 0.48) {
        const w = 74 + random() * 44;
        const x = x0 + 130 + random() * (CHUNK_W - 260);
        if (!overPit(x, w, pits)) hazards.push({ x, y: GROUND_Y - 22, w, h: 22, kind: 'spikes' });
      }

      const spawnCount = safe ? (idx === 1 ? 1 : 0) : 1 + Math.floor(random() * 3);
      for (let i = 0; i < spawnCount; i += 1) {
        const typeRoll = random();
        const type = typeRoll > 0.78 ? 'bat' : typeRoll > 0.45 ? 'crawler' : 'walker';
        const x = x0 + 180 + random() * (CHUNK_W - 260);
        if (type !== 'bat' && overPit(x - 20, 80, pits)) continue;
        spawns.push({ id: `c${idx}-e${i}`, x, y: type === 'bat' ? GROUND_Y - 210 - random() * 75 : GROUND_Y, type });
      }

      const decorCount = 4 + Math.floor(random() * 5);
      for (let i = 0; i < decorCount; i += 1) {
        const x = x0 + random() * CHUNK_W;
        const type = ['sign', 'lamp', 'fence', 'ruin', 'grass'][Math.floor(random() * 5)];
        decor.push({ x, y: GROUND_Y, type, flip: random() > 0.5, label: random() > 0.5 ? 'CHECKPOINT' : 'KEEP MOVING' });
      }

      return { idx, x0, pits, solids, hazards, decor, breakables, spawns };
    }

    chunksInRange(minX, maxX) {
      const a = Math.floor(minX / CHUNK_W) - 1;
      const b = Math.floor(maxX / CHUNK_W) + 1;
      const out = [];
      for (let i = a; i <= b; i += 1) {
        if (!this.chunks.has(i)) this.chunks.set(i, this.generate(i));
        out.push(this.chunks.get(i));
      }
      return out;
    }

    solidsNear(minX, maxX) {
      const solids = [];
      for (const chunk of this.chunksInRange(minX, maxX)) {
        solids.push(...chunk.solids);
        for (const b of chunk.breakables) {
          if (!this.destroyed.has(b.id) && b.hp > 0) solids.push(b);
        }
      }
      return solids;
    }

    hazardsNear(minX, maxX) {
      return this.chunksInRange(minX, maxX).flatMap((c) => c.hazards);
    }

    breakablesNear(minX, maxX) {
      return this.chunksInRange(minX, maxX).flatMap((c) => c.breakables).filter((b) => !this.destroyed.has(b.id) && b.hp > 0);
    }
  }

  class Game {
    constructor() {
      this.canvas = $('game-canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.input = new Input();
      this.world = new ChunkWorld();
      this.running = false;
      this.last = 0;
      this.camera = { x: 0, y: 0 };
      this.dpr = 1;
      this.width = 0;
      this.height = 0;
      this.bindUi();
      this.resize();
      this.reset(false);
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame((t) => this.loop(t));
    }

    bindUi() {
      $('start-button')?.addEventListener('click', () => this.start());
      $('restart-button')?.addEventListener('click', () => this.start());
    }

    resize() {
      this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    reset(makeRunning = true) {
      this.world.reset();
      this.player = {
        x: 120,
        y: GROUND_Y - PLAYER.h,
        w: PLAYER.w,
        h: PLAYER.h,
        vx: 0,
        vy: 0,
        face: 1,
        health: PLAYER.maxHealth,
        onGround: false,
        invuln: 0,
        fireCd: 0,
        hurtFlash: 0
      };
      this.bullets = [];
      this.enemies = [];
      this.particles = [];
      this.distance = 0;
      this.kills = 0;
      this.best = Number(localStorage.getItem('side2d-best') || 0);
      this.running = makeRunning;
      this.world.ensureAround(this.player.x);
      this.camera.x = this.player.x - this.width * 0.42;
      this.camera.y = this.player.y - this.height * 0.58;
      this.updateHud();
    }

    start() {
      $('start-screen')?.classList.remove('visible');
      $('game-over-screen')?.classList.remove('visible');
      $('hud')?.classList.remove('hidden');
      $('touch-layer')?.classList.remove('hidden');
      this.reset(true);
    }

    end() {
      this.running = false;
      this.best = Math.max(this.best, Math.floor(this.distance));
      localStorage.setItem('side2d-best', String(this.best));
      $('final-round').textContent = `${Math.floor(this.distance)}m explored`;
      $('final-score').textContent = `${this.kills} infected dropped • best ${this.best}m`;
      $('game-over-screen')?.classList.add('visible');
      $('touch-layer')?.classList.add('hidden');
      $('hud')?.classList.add('hidden');
      this.input.reset();
    }

    loop(t) {
      const dt = Math.min(MAX_DT, (t - this.last) / 1000 || 0);
      this.last = t;
      if (this.running) this.update(dt);
      this.draw();
      requestAnimationFrame((next) => this.loop(next));
    }

    update(dt) {
      const p = this.player;
      this.world.ensureAround(p.x);
      this.spawnEnemies();
      p.invuln = Math.max(0, p.invuln - dt);
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.hurtFlash = Math.max(0, p.hurtFlash - dt);

      const ax = this.input.axis();
      if (ax !== 0) p.face = ax > 0 ? 1 : -1;
      const target = ax * PLAYER.speed;
      const accel = p.onGround ? PLAYER.accel : PLAYER.airAccel;
      if (ax !== 0) p.vx = approach(p.vx, target, accel * dt);
      else if (p.onGround) p.vx = approach(p.vx, 0, PLAYER.friction * dt);
      if (this.input.consumeJump() && p.onGround) {
        p.vy = -PLAYER.jump;
        p.onGround = false;
        this.puff(p.x + p.w / 2, p.y + p.h, 8, '#d8d0b4');
      }
      if (this.input.fire) this.fire();

      p.vy += GRAVITY * dt;
      this.movePlayer(dt);
      this.updateBullets(dt);
      this.updateEnemies(dt);
      this.updateParticles(dt);
      this.handleHazards();

      if (p.y > GROUND_Y + 520) this.damagePlayer(34, true);
      if (p.health <= 0) this.end();
      this.distance = Math.max(this.distance, Math.max(0, (p.x - 120) / 10));
      this.camera.x = lerp(this.camera.x, p.x - this.width * 0.38, 0.11);
      this.camera.y = lerp(this.camera.y, p.y - this.height * 0.54, 0.08);
      this.updateHud();
    }

    movePlayer(dt) {
      const p = this.player;
      const solids = this.world.solidsNear(p.x - 160, p.x + 220);
      p.x += p.vx * dt;
      for (const s of solids) {
        if (!rectsOverlap(p, s)) continue;
        if (p.vx > 0) p.x = s.x - p.w;
        else if (p.vx < 0) p.x = s.x + s.w;
        p.vx = 0;
      }
      p.y += p.vy * dt;
      p.onGround = false;
      for (const s of solids) {
        if (!rectsOverlap(p, s)) continue;
        if (p.vy > 0) {
          p.y = s.y - p.h;
          p.vy = 0;
          p.onGround = true;
        } else if (p.vy < 0) {
          p.y = s.y + s.h;
          p.vy = 0;
        }
      }
    }

    fire() {
      const p = this.player;
      if (p.fireCd > 0) return;
      p.fireCd = 0.18;
      const bx = p.x + p.w / 2 + p.face * 24;
      const by = p.y + 22;
      this.bullets.push({ x: bx, y: by, w: 18, h: 4, vx: p.face * 840, life: 0.72, damage: 36 });
      this.particles.push({ x: bx + p.face * 10, y: by + 2, vx: p.face * 80, vy: -20, life: 0.08, max: 0.08, size: 12, color: '#ffdd76' });
    }

    updateBullets(dt) {
      const solids = this.world.breakablesNear(this.player.x - this.width, this.player.x + this.width * 1.5);
      for (const b of this.bullets) {
        b.x += b.vx * dt;
        b.life -= dt;
        for (const enemy of this.enemies) {
          if (enemy.dead || !rectsOverlap(b, enemy)) continue;
          enemy.hp -= b.damage;
          enemy.hurt = 0.12;
          b.life = 0;
          this.puff(b.x, b.y, 5, '#c9ff79');
          if (enemy.hp <= 0) this.killEnemy(enemy);
          break;
        }
        if (b.life <= 0) continue;
        for (const s of solids) {
          if (!rectsOverlap(b, s)) continue;
          s.hp -= b.damage;
          b.life = 0;
          this.puff(b.x, b.y, 7, '#d7b071');
          if (s.hp <= 0) {
            this.world.destroyed.add(s.id);
            this.puff(s.x + s.w / 2, s.y + s.h / 2, 18, '#c59a5a');
          }
          break;
        }
      }
      this.bullets = this.bullets.filter((b) => b.life > 0 && Math.abs(b.x - this.player.x) < 1400);
    }

    spawnEnemies() {
      const p = this.player;
      const min = p.x - 900;
      const max = p.x + 1200;
      const existing = new Set(this.enemies.map((e) => e.id));
      for (const chunk of this.world.chunksInRange(min, max)) {
        for (const def of chunk.spawns) {
          if (existing.has(def.id) || this.world.killed.has(def.id)) continue;
          if (Math.abs(def.x - p.x) > 1050) continue;
          this.enemies.push(makeEnemy(def));
        }
      }
    }

    updateEnemies(dt) {
      const p = this.player;
      const solids = this.world.solidsNear(p.x - 1200, p.x + 1500);
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.hurt = Math.max(0, e.hurt - dt);
        e.hitCd = Math.max(0, e.hitCd - dt);
        const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
        const dir = Math.sign(dx) || e.dir || 1;
        e.dir = dir;
        if (e.type === 'bat') {
          e.t += dt;
          e.vx = dir * e.speed;
          e.vy = Math.sin(e.t * 4.2) * 90 + ((p.y - 120) - e.y) * 0.18;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        } else {
          e.vx = dir * e.speed;
          e.vy += GRAVITY * dt;
          e.x += e.vx * dt;
          for (const s of solids) {
            if (!rectsOverlap(e, s)) continue;
            if (e.vx > 0) e.x = s.x - e.w;
            else if (e.vx < 0) e.x = s.x + s.w;
            e.vx = 0;
            e.dir *= -1;
          }
          e.y += e.vy * dt;
          e.onGround = false;
          for (const s of solids) {
            if (!rectsOverlap(e, s)) continue;
            if (e.vy > 0) {
              e.y = s.y - e.h;
              e.vy = 0;
              e.onGround = true;
            } else if (e.vy < 0) {
              e.y = s.y + s.h;
              e.vy = 0;
            }
          }
          if (e.y > GROUND_Y + 650) e.dead = true;
        }
        if (rectsOverlap(p, e) && e.hitCd <= 0) {
          e.hitCd = 0.7;
          this.damagePlayer(e.damage, false);
        }
      }
      this.enemies = this.enemies.filter((e) => !e.dead && Math.abs(e.x - p.x) < 1800);
    }

    updateParticles(dt) {
      for (const part of this.particles) {
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.vy += 500 * dt;
        part.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    handleHazards() {
      const p = this.player;
      for (const h of this.world.hazardsNear(p.x - 80, p.x + 80)) {
        if (rectsOverlap(p, h)) this.damagePlayer(20, false);
      }
    }

    damagePlayer(amount, fell) {
      const p = this.player;
      if (!fell && p.invuln > 0) return;
      p.health = Math.max(0, p.health - amount);
      p.invuln = fell ? 1.1 : 0.75;
      p.hurtFlash = 0.22;
      if (fell && p.health > 0) {
        p.x = Math.max(100, p.x - 160);
        p.y = GROUND_Y - PLAYER.h - 20;
        p.vx = 0;
        p.vy = 0;
      }
    }

    killEnemy(enemy) {
      enemy.dead = true;
      this.world.killed.add(enemy.id);
      this.kills += 1;
      this.puff(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 16, '#b6ff81');
    }

    puff(x, y, count, color) {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 180;
        const life = 0.24 + Math.random() * 0.35;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, life, max: life, size: 3 + Math.random() * 6, color });
      }
    }

    updateHud() {
      $('round-value').textContent = `${Math.floor(this.distance)}m`;
      $('score-value').textContent = String(this.kills);
      $('active-value').textContent = String(this.enemies.length);
      $('health-text').textContent = Math.ceil(this.player.health);
      $('health-fill').style.width = `${clamp(this.player.health, 0, 100)}%`;
      $('ammo-value').textContent = this.player.fireCd > 0.02 ? 'COOLING' : 'READY';
      $('tool-state').textContent = `SIDE2D ${VERSION}`;
    }

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      this.drawSky(ctx);
      this.drawParallax(ctx);
      this.drawWorld(ctx);
      this.drawEntities(ctx);
      this.drawForeground(ctx);
    }

    wx(x) { return Math.round(x - this.camera.x); }
    wy(y) { return Math.round(y - this.camera.y); }

    drawSky(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0, '#101926');
      g.addColorStop(0.48, '#243448');
      g.addColorStop(1, '#151917');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'rgba(255, 218, 137, 0.15)';
      ctx.beginPath();
      ctx.arc(this.width * 0.76, this.height * 0.16, 54, 0, Math.PI * 2);
      ctx.fill();
    }

    drawParallax(ctx) {
      const horizon = this.wy(GROUND_Y) - 210;
      ctx.save();
      ctx.translate(-((this.camera.x * 0.15) % 260), 0);
      for (let x = -260; x < this.width + 520; x += 260) {
        ctx.fillStyle = 'rgba(8, 12, 16, 0.34)';
        ctx.fillRect(x + 30, horizon + 50, 46, 170);
        ctx.fillRect(x + 94, horizon + 20, 82, 200);
        ctx.fillRect(x + 190, horizon + 78, 34, 142);
        ctx.fillStyle = 'rgba(255, 206, 107, 0.09)';
        ctx.fillRect(x + 106, horizon + 48, 10, 16);
        ctx.fillRect(x + 132, horizon + 78, 12, 16);
      }
      ctx.restore();

      ctx.save();
      ctx.translate(-((this.camera.x * 0.34) % 340), 0);
      ctx.strokeStyle = 'rgba(172, 184, 178, 0.16)';
      ctx.lineWidth = 4;
      for (let x = -340; x < this.width + 680; x += 340) {
        const y = horizon + 168;
        ctx.beginPath();
        ctx.moveTo(x, y + 20);
        ctx.bezierCurveTo(x + 85, y - 18, x + 155, y - 18, x + 240, y + 20);
        ctx.bezierCurveTo(x + 275, y + 36, x + 320, y + 36, x + 380, y + 18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(172, 184, 178, 0.14)';
        ctx.fillRect(x + 42, y + 12, 8, 118);
        ctx.fillRect(x + 230, y + 10, 8, 120);
      }
      ctx.restore();
    }

    drawWorld(ctx) {
      const min = this.camera.x - 80;
      const max = this.camera.x + this.width + 120;
      for (const chunk of this.world.chunksInRange(min, max)) {
        for (const d of chunk.decor) this.drawDecor(ctx, d);
        for (const s of chunk.solids) this.drawSolid(ctx, s);
        for (const b of chunk.breakables) if (!this.world.destroyed.has(b.id) && b.hp > 0) this.drawBreakable(ctx, b);
        for (const h of chunk.hazards) this.drawHazard(ctx, h);
      }
    }

    drawSolid(ctx, s) {
      const x = this.wx(s.x);
      const y = this.wy(s.y);
      if (s.kind === 'ground') {
        ctx.fillStyle = '#252a2c';
        ctx.fillRect(x, y, s.w, s.h);
        ctx.fillStyle = '#4c524c';
        ctx.fillRect(x, y, s.w, 10);
        ctx.fillStyle = 'rgba(255, 220, 130, 0.55)';
        for (let lx = Math.floor(s.x / 130) * 130; lx < s.x + s.w; lx += 130) {
          ctx.fillRect(this.wx(lx + 40), y + 22, 42, 4);
        }
        return;
      }
      ctx.fillStyle = '#5d6663';
      ctx.fillRect(x, y, s.w, s.h);
      ctx.fillStyle = '#a0a99e';
      ctx.fillRect(x, y, s.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let bx = 0; bx < s.w; bx += 28) ctx.fillRect(x + bx, y + 4, 3, s.h + 10);
    }

    drawBreakable(ctx, b) {
      const x = this.wx(b.x);
      const y = this.wy(b.y);
      if (b.kind === 'barricade') {
        ctx.fillStyle = '#4d3427';
        ctx.fillRect(x, y, b.w, b.h);
        ctx.fillStyle = '#8b6645';
        ctx.fillRect(x - 7, y + 10, b.w + 14, 10);
        ctx.fillRect(x - 7, y + 39, b.w + 14, 10);
      } else {
        drawRoundRect(ctx, x, y, b.w, b.h, 5, '#8b633b', '#c0975d');
        ctx.strokeStyle = 'rgba(35,22,12,0.55)';
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6);
        ctx.lineTo(x + b.w - 6, y + b.h - 6);
        ctx.moveTo(x + b.w - 6, y + 6);
        ctx.lineTo(x + 6, y + b.h - 6);
        ctx.stroke();
      }
      const pct = clamp(b.hp / b.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y - 8, b.w, 4);
      ctx.fillStyle = '#ffcf73';
      ctx.fillRect(x, y - 8, b.w * pct, 4);
    }

    drawHazard(ctx, h) {
      const x = this.wx(h.x);
      const y = this.wy(h.y);
      ctx.fillStyle = '#382626';
      ctx.fillRect(x, y + h.h - 4, h.w, 4);
      ctx.fillStyle = '#c8d0c5';
      for (let sx = 0; sx < h.w; sx += 18) {
        ctx.beginPath();
        ctx.moveTo(x + sx, y + h.h);
        ctx.lineTo(x + sx + 9, y);
        ctx.lineTo(x + sx + 18, y + h.h);
        ctx.closePath();
        ctx.fill();
      }
    }

    drawDecor(ctx, d) {
      const x = this.wx(d.x);
      const y = this.wy(d.y);
      if (x < -160 || x > this.width + 160) return;
      if (d.type === 'lamp') {
        ctx.fillStyle = 'rgba(16,16,14,0.7)';
        ctx.fillRect(x, y - 142, 7, 142);
        ctx.fillRect(x - 8, y - 142, 40, 6);
        ctx.fillStyle = 'rgba(255, 206, 104, 0.18)';
        ctx.beginPath();
        ctx.ellipse(x + 26, y - 126, 42, 72, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'sign') {
        ctx.fillStyle = '#2f3938';
        ctx.fillRect(x, y - 96, 8, 96);
        drawRoundRect(ctx, x - 42, y - 128, 92, 38, 4, '#162325', '#6f8179');
        ctx.fillStyle = '#d8c17b';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x + 4, y - 105);
      } else if (d.type === 'fence') {
        ctx.strokeStyle = 'rgba(190, 200, 190, 0.24)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i += 1) {
          ctx.beginPath();
          ctx.moveTo(x + i * 26, y - 70);
          ctx.lineTo(x + i * 26, y - 8);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 48);
        ctx.lineTo(x + 112, y - 60);
        ctx.moveTo(x - 8, y - 24);
        ctx.lineTo(x + 112, y - 34);
        ctx.stroke();
      } else if (d.type === 'ruin') {
        ctx.fillStyle = 'rgba(60, 65, 62, 0.65)';
        ctx.fillRect(x - 44, y - 28, 96, 28);
        ctx.fillStyle = 'rgba(30, 30, 28, 0.75)';
        ctx.fillRect(x - 16, y - 42, 42, 18);
      } else {
        ctx.fillStyle = 'rgba(142, 164, 101, 0.55)';
        for (let i = 0; i < 5; i += 1) ctx.fillRect(x + i * 5, y - 12 - i % 2 * 8, 3, 12 + i % 2 * 8);
      }
    }

    drawEntities(ctx) {
      for (const b of this.bullets) {
        ctx.fillStyle = '#ffe38a';
        ctx.fillRect(this.wx(b.x), this.wy(b.y), b.w * Math.sign(b.vx), b.h);
      }
      for (const e of this.enemies) this.drawEnemy(ctx, e);
      this.drawPlayer(ctx);
      for (const p of this.particles) {
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(this.wx(p.x), this.wy(p.y), p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }

    drawPlayer(ctx) {
      const p = this.player;
      const x = this.wx(p.x);
      const y = this.wy(p.y);
      ctx.save();
      if (p.invuln > 0 && Math.floor(performance.now() / 70) % 2 === 0) ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#1c2630';
      ctx.fillRect(x + 8, y + 18, 22, 32);
      ctx.fillStyle = '#cbb690';
      ctx.fillRect(x + 10, y + 2, 18, 18);
      ctx.fillStyle = '#101418';
      ctx.fillRect(x + (p.face > 0 ? 22 : -18), y + 25, 30, 7);
      ctx.fillStyle = '#2d3740';
      ctx.fillRect(x + 8, y + 48, 8, 10);
      ctx.fillRect(x + 23, y + 48, 8, 10);
      ctx.restore();
    }

    drawEnemy(ctx, e) {
      const x = this.wx(e.x);
      const y = this.wy(e.y);
      const fill = e.hurt > 0 ? '#ecffd7' : (e.type === 'bat' ? '#6b6178' : e.type === 'crawler' ? '#50633c' : '#5d7d4a');
      ctx.fillStyle = fill;
      if (e.type === 'bat') {
        ctx.beginPath();
        ctx.ellipse(x + e.w / 2, y + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 40, 72, 0.85)';
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 12);
        ctx.lineTo(x - 24, y + 4 + Math.sin(e.t * 7) * 8);
        ctx.lineTo(x + 4, y + 24);
        ctx.moveTo(x + e.w - 4, y + 12);
        ctx.lineTo(x + e.w + 24, y + 4 + Math.sin(e.t * 7) * 8);
        ctx.lineTo(x + e.w - 4, y + 24);
        ctx.fill();
      } else {
        drawRoundRect(ctx, x, y + 14, e.w, e.h - 14, 8, fill);
        ctx.fillStyle = fill;
        ctx.fillRect(x + 6, y, e.w - 12, 20);
        ctx.fillStyle = '#e8ffd0';
        ctx.fillRect(x + (e.dir > 0 ? e.w - 12 : 8), y + 7, 4, 4);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y - 9, e.w, 4);
      ctx.fillStyle = '#b8ff7e';
      ctx.fillRect(x, y - 9, e.w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }

    drawForeground(ctx) {
      const ground = this.wy(GROUND_Y);
      const fog = ctx.createLinearGradient(0, ground - 200, 0, this.height);
      fog.addColorStop(0, 'rgba(4, 6, 8, 0)');
      fog.addColorStop(1, 'rgba(4, 6, 8, 0.34)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, Math.max(0, ground - 200), this.width, this.height);
      if (!this.running) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(VERSION, 14, this.height - 16);
      }
      if (this.player.hurtFlash > 0) {
        ctx.fillStyle = `rgba(150, 0, 0, ${this.player.hurtFlash * 1.6})`;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => new Game());
})();
