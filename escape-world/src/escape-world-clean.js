import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(() => {
  'use strict';

  const VERSION = 'escape-world-002';
  const SIZE = 7600, HALF = SIZE / 2, SEA = -36, EYE = 13.5;
  const BRIDGE_Z = -860, BRIDGE_W = 43, BRIDGE_A = -3380, BRIDGE_B = 3380;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const temp = new THREE.Vector3();

  function hash(ix, iz) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function n2(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = smooth(x - ix), fz = smooth(z - iz);
    return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), fx), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx), fz);
  }

  function fbm(x, z) {
    let v = 0, a = 0.52, f = 1;
    for (let i = 0; i < 6; i += 1) {
      v += n2(x * f, z * f) * a;
      f *= 2.04;
      a *= 0.49;
    }
    return v;
  }

  function ridge(x, z) {
    return 1 - Math.abs(fbm(x, z) * 2 - 1);
  }

  function bridgeT(x) {
    return clamp((x - BRIDGE_A) / (BRIDGE_B - BRIDGE_A), 0, 1);
  }

  function bridgeY(x) {
    return SEA + 104 + Math.sin(Math.PI * bridgeT(x)) * 104 + Math.sin(x * 0.00125) * 7;
  }

  function onBridge(x, z, pad = 0) {
    return x >= BRIDGE_A - pad && x <= BRIDGE_B + pad && Math.abs(z - BRIDGE_Z) <= BRIDGE_W + pad;
  }

  function terrainY(x, z) {
    const broad = (fbm(x * 0.00052 + 18, z * 0.00052 - 4) - 0.5) * 520;
    const folds = Math.pow(ridge(x * 0.00105 - 7, z * 0.00105 + 13), 2.35) * 360;
    const wrinkles = (fbm(x * 0.0022 + 42, z * 0.0022 + 11) - 0.5) * 62;
    const valley = Math.sin((x + z * 0.38) * 0.00115) * 72;
    const edge = smooth(clamp((Math.max(Math.abs(x), Math.abs(z)) / HALF - 0.72) / 0.28, 0, 1));
    const coast = edge * (260 + 140 * n2(x * 0.001, z * 0.001));
    const bridgeCut = Math.max(0, 1 - Math.abs(z - BRIDGE_Z) / 170) * 118 * smooth(clamp((x - BRIDGE_A + 500) / 1000, 0, 1)) * smooth(clamp((BRIDGE_B + 500 - x) / 1000, 0, 1));
    return broad + folds + wrinkles + valley - coast - bridgeCut - 78;
  }

  function groundY(x, z) {
    const land = Math.max(terrainY(x, z), SEA - 7);
    return onBridge(x, z, 2) ? Math.max(land, bridgeY(x) + 4.2) : land;
  }

  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Controls {
    constructor() {
      this.move = new THREE.Vector2();
      this.look = new THREE.Vector2();
      this.keys = Object.create(null);
      this.pad = $('move-pad');
      this.knob = $('move-knob');
      this.lookPad = $('look-pad');
      this.moveId = null;
      this.lookId = null;
      this.bind();
    }

    bind() {
      window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      this.pad.addEventListener('pointerdown', (e) => { e.preventDefault(); this.moveId = e.pointerId; this.pad.setPointerCapture(e.pointerId); this.setMove(e); }, { passive: false });
      this.pad.addEventListener('pointermove', (e) => { if (e.pointerId === this.moveId) this.setMove(e); }, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => this.pad.addEventListener(type, (e) => {
        if (e.pointerId !== this.moveId) return;
        this.moveId = null; this.move.set(0, 0); this.knob.style.transform = 'translate(0,0)';
      }, { passive: false }));
      this.lookPad.addEventListener('pointerdown', (e) => { e.preventDefault(); this.lookId = { id: e.pointerId, x: e.clientX, y: e.clientY }; this.lookPad.setPointerCapture(e.pointerId); }, { passive: false });
      this.lookPad.addEventListener('pointermove', (e) => {
        if (!this.lookId || e.pointerId !== this.lookId.id) return;
        e.preventDefault(); this.look.x += e.clientX - this.lookId.x; this.look.y += e.clientY - this.lookId.y; this.lookId.x = e.clientX; this.lookId.y = e.clientY;
      }, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => this.lookPad.addEventListener(type, (e) => { if (this.lookId && e.pointerId === this.lookId.id) this.lookId = null; }, { passive: false }));
    }

    setMove(e) {
      const r = this.pad.getBoundingClientRect();
      const max = r.width * 0.35;
      const dx = clamp(e.clientX - (r.left + r.width / 2), -max, max);
      const dy = clamp(e.clientY - (r.top + r.height / 2), -max, max);
      this.move.set(dx / max, -dy / max);
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    }

    keyMove() {
      return new THREE.Vector2(
        (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0),
        (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0)
      ).clampLength(0, 1);
    }

    takeLook() {
      const v = this.look.clone();
      this.look.set(0, 0);
      return v;
    }
  }

  class World {
    constructor() {
      this.canvas = $('world-canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x07101d);
      this.scene.fog = new THREE.FogExp2(0x8da2b7, 0.00038);
      this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.25, 9400);
      this.camera.rotation.order = 'YXZ';
      this.controls = new Controls();
      this.clock = new THREE.Clock();
      this.pos = new THREE.Vector3(-420, 0, 250);
      this.yaw = 0.42; this.pitch = -0.09; this.time = 0; this.started = false;
      this.beams = []; this.clouds = []; this.ships = [];
      this.build(); this.resize(); this.stick(true); this.bind(); this.loop();
    }

    bind() {
      $('start-button').addEventListener('click', () => {
        this.started = true; this.stick(true);
        $('start-screen').classList.remove('visible'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden');
        if (document.documentElement.requestFullscreen && innerHeight < 720) document.documentElement.requestFullscreen().catch(() => {});
      });
      addEventListener('resize', () => this.resize());
      addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    }

    build() {
      this.scene.add(new THREE.HemisphereLight(0x9fbef3, 0x263221, 1.55));
      const sun = new THREE.DirectionalLight(0xffdba0, 2.45); sun.position.set(-900, 1400, 680); this.scene.add(sun);
      const low = new THREE.DirectionalLight(0x7fb2ff, 0.72); low.position.set(1200, 360, -900); this.scene.add(low);
      this.terrain(); this.water(); this.forest(); this.rocks(); this.bridge(); this.ruins(); this.spikes(); this.towers(); this.sky(); this.airships();
    }

    terrain() {
      const seg = 224, row = seg + 1, verts = [], colors = [], idx = [], c = new THREE.Color();
      const low = new THREE.Color(0x43523f), grass = new THREE.Color(0x526947), moss = new THREE.Color(0x6e7d58), stone = new THREE.Color(0x79807a), snow = new THREE.Color(0xc9d3ce), sand = new THREE.Color(0xa88e62);
      for (let iz = 0; iz <= seg; iz++) for (let ix = 0; ix <= seg; ix++) {
        const x = -HALF + ix / seg * SIZE, z = -HALF + iz / seg * SIZE, y = terrainY(x, z); verts.push(x, y, z);
        const h = clamp((y + 70) / 520, 0, 1), wet = fbm(x * 0.0016 + 100, z * 0.0016 - 20), slope = Math.abs(terrainY(x + 22, z) - y) + Math.abs(terrainY(x, z + 22) - y);
        if (y < SEA + 16) c.copy(sand); else if (slope > 44) c.copy(stone).lerp(snow, clamp((y - 270) / 380, 0, 1) * 0.35); else if (h > 0.72) c.copy(stone).lerp(snow, clamp((h - 0.72) / 0.28, 0, 1)); else c.copy(low).lerp(grass, h).lerp(moss, wet * 0.25);
        c.multiplyScalar(0.86 + n2(x * 0.006, z * 0.006) * 0.22); colors.push(c.r, c.g, c.b);
      }
      for (let z = 0; z < seg; z++) for (let x = 0; x < seg; x++) { const a = z * row + x; idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 })));
    }

    water() {
      const m = new THREE.MeshStandardMaterial({ color: 0x314f63, roughness: 0.38, metalness: 0.12, transparent: true, opacity: 0.74 });
      const w = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.7, SIZE * 1.7), m); w.rotation.x = -Math.PI / 2; w.position.y = SEA; this.scene.add(w);
    }

    forest() {
      const r = rng(94120), count = 2050, trunk = new THREE.CylinderGeometry(0.72, 1.1, 11, 6), leaf = new THREE.ConeGeometry(6.8, 22, 7);
      const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x3d2d21, roughness: 1 }), count);
      const leaves = new THREE.InstancedMesh(leaf, new THREE.MeshStandardMaterial({ color: 0x2f5c47, roughness: 0.95 }), count);
      const tm = new THREE.Matrix4(), lm = new THREE.Matrix4(); let n = 0;
      for (let i = 0; i < count * 2 && n < count; i++) {
        const x = (r() - 0.5) * SIZE * 0.92, z = (r() - 0.5) * SIZE * 0.92, h = terrainY(x, z), d = fbm(x * 0.0018 + 2, z * 0.0018 + 80);
        if (h < SEA + 24 || h > 380 || d < 0.42 || onBridge(x, z, 150)) continue;
        const s = 0.72 + r() * 1.85, yaw = r() * Math.PI;
        tm.compose(new THREE.Vector3(x, h + 5.5 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
        lm.compose(new THREE.Vector3(x, h + 20 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s * (0.92 + r() * 0.28), s));
        trunks.setMatrixAt(n, tm); leaves.setMatrixAt(n, lm); n++;
      }
      trunks.count = leaves.count = n; trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true; this.scene.add(trunks, leaves);
    }

    rocks() {
      const r = rng(7127), count = 580, rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(5), new THREE.MeshStandardMaterial({ color: 0x6f746d, roughness: 0.98 }), count), m = new THREE.Matrix4(); let n = 0;
      for (let i = 0; i < count * 2 && n < count; i++) {
        const x = (r() - 0.5) * SIZE * 0.96, z = (r() - 0.5) * SIZE * 0.96, h = terrainY(x, z); if (h < SEA + 6 || onBridge(x, z, 120)) continue;
        m.compose(new THREE.Vector3(x, h + 5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.8, r() * Math.PI, r() * 0.4)), new THREE.Vector3(0.8 + r() * 3.4, 0.45 + r() * 2.2, 0.8 + r() * 3.4)); rocks.setMatrixAt(n++, m);
      }
      rocks.count = n; rocks.instanceMatrix.needsUpdate = true; this.scene.add(rocks);
    }

    bridge() {
      const g = new THREE.Group(), roadMat = new THREE.MeshStandardMaterial({ color: 0x30383d, roughness: 0.85, metalness: 0.08 }), railMat = new THREE.MeshStandardMaterial({ color: 0x67727a, roughness: 0.65, metalness: 0.22 });
      const road = new THREE.BoxGeometry(92, 8, 80), rail = new THREE.BoxGeometry(92, 5, 5), side = new THREE.BoxGeometry(88, 18, 4), pier = new THREE.BoxGeometry(20, 190, 20);
      for (let x = BRIDGE_A; x <= BRIDGE_B; x += 88) {
        const y = bridgeY(x); const deck = new THREE.Mesh(road, roadMat); deck.position.set(x, y, BRIDGE_Z); g.add(deck);
        for (const z of [BRIDGE_Z - 43, BRIDGE_Z + 43]) { const rr = new THREE.Mesh(rail, railMat); rr.position.set(x, y + 12, z); const ss = new THREE.Mesh(side, railMat); ss.position.set(x, y - 10, z); g.add(rr, ss); }
        if (Math.round((x - BRIDGE_A) / 88) % 8 === 0) { const ph = Math.max(90, y - SEA + 47), p = new THREE.Mesh(pier, railMat); p.scale.y = ph / 190; p.position.set(x, SEA - 24 + ph / 2, BRIDGE_Z); g.add(p); const lamp = new THREE.PointLight(0xffb36f, 0.75, 260); lamp.position.set(x, y + 29, BRIDGE_Z - 50); this.beams.push(lamp); g.add(lamp); }
      }
      const cableMat = new THREE.LineBasicMaterial({ color: 0x98a7ad, transparent: true, opacity: 0.55 });
      for (const x of [-3000,-2400,-1800,-1200,-600,0,600,1200,1800,2400,3000]) {
        const y = bridgeY(x) + 104, tw = new THREE.Mesh(new THREE.BoxGeometry(38, 220, 38), railMat); tw.position.set(x, y, BRIDGE_Z); g.add(tw);
        for (const off of [-39, 39]) { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x - 310, bridgeY(x - 310) + 96, BRIDGE_Z + off), new THREE.Vector3(x, y + 132, BRIDGE_Z + off), new THREE.Vector3(x + 310, bridgeY(x + 310) + 96, BRIDGE_Z + off)]); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), cableMat)); }
      }
      this.scene.add(g);
    }

    ruins() {
      const r = rng(87291), group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x4b5556, roughness: 0.94, metalness: 0.04 }), glass = new THREE.MeshBasicMaterial({ color: 0xb4d9ff, transparent: true, opacity: 0.13 });
      for (let i = 0; i < 120; i++) { const x = 1200 + (r() - 0.5) * 1600, z = 1450 + (r() - 0.5) * 1400, h = terrainY(x, z); if (h < SEA + 20) continue; const w = 26 + r() * 70, d = 26 + r() * 70, y = 22 + Math.pow(r(), 1.8) * 260; const b = new THREE.Mesh(new THREE.BoxGeometry(w, y, d), mat); b.position.set(x, h + y / 2, z); b.rotation.y = (r() - 0.5) * 0.16; group.add(b); if (r() > 0.45) { const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, y * 0.66, 0.6), glass); win.position.set(x, h + y * 0.58, z - d / 2 - 0.5); win.rotation.y = b.rotation.y; group.add(win); } }
      this.scene.add(group);
    }

    spikes() {
      const r = rng(1205), group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.7, metalness: 0.15 });
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, rad = 160 + r() * 520, x = -1700 + Math.cos(a) * rad + (r() - 0.5) * 140, z = 1250 + Math.sin(a) * rad + (r() - 0.5) * 140, h = terrainY(x, z), tall = 80 + r() * 260; const slab = new THREE.Mesh(new THREE.BoxGeometry(18 + r() * 24, tall, 8 + r() * 18), mat); slab.position.set(x, h + tall / 2, z); slab.rotation.y = -a + Math.PI / 2 + (r() - 0.5) * 0.28; group.add(slab); }
      this.scene.add(group);
    }

    towers() {
      const mat = new THREE.MeshStandardMaterial({ color: 0x59646a, roughness: 0.75, metalness: 0.18 });
      for (const [x, z] of [[-2750,-1220],[-2120,1880],[-650,-2010],[640,660],[1650,-1820],[2820,720],[3020,-2400]]) { const h = terrainY(x, z), tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 16, 118, 10), mat); tower.position.set(x, h + 59, z); this.scene.add(tower); const light = new THREE.PointLight(0xffb56b, 1.15, 620); light.position.set(x, h + 126, z); this.beams.push(light); this.scene.add(light); }
    }

    sky() {
      const r = rng(3333), pts = [];
      for (let i = 0; i < 900; i++) pts.push((r() - 0.5) * SIZE * 1.6, 560 + r() * 1700, (r() - 0.5) * SIZE * 1.6);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd9eaff, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.5 })));
      const cm = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 1, transparent: true, opacity: 0.28 });
      for (let i = 0; i < 18; i++) { const gr = new THREE.Group(); for (let j = 0; j < 5; j++) { const p = new THREE.Mesh(new THREE.SphereGeometry(42 + r() * 46, 12, 8), cm); p.scale.set(1.8 + r() * 2.4, 0.28 + r() * 0.22, 0.74 + r() * 0.5); p.position.set((r() - 0.5) * 180, (r() - 0.5) * 20, (r() - 0.5) * 70); gr.add(p); } gr.position.set((r() - 0.5) * SIZE, 420 + r() * 260, (r() - 0.5) * SIZE); this.clouds.push({ group: gr, speed: 2 + r() * 5 }); this.scene.add(gr); }
    }

    airships() {
      const hull = new THREE.MeshStandardMaterial({ color: 0x252f38, roughness: 0.58, metalness: 0.28 });
      for (let i = 0; i < 5; i++) { const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(84, 22, 26), hull)); const w = new THREE.Mesh(new THREE.BoxGeometry(142, 7, 16), hull); w.position.y = -3; s.add(w); const tail = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 18), hull); tail.position.set(42, 14, 0); s.add(tail); s.position.set(-3800 - i * 420, 270 + i * 42, -2100 + i * 890); s.rotation.y = Math.PI * 0.5; this.ships.push({ group: s, lane: i, speed: 34 + i * 8 }); this.scene.add(s); }
    }

    resize() {
      this.renderer.setPixelRatio(clamp(devicePixelRatio || 1, 1.35, 2.15));
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    }

    stick(force = false) {
      const y = groundY(this.pos.x, this.pos.z) + EYE;
      if (force || this.pos.y < y) this.pos.y = y; else this.pos.y = lerp(this.pos.y, y, 0.18);
      this.camera.position.copy(this.pos);
    }

    update(dt) {
      const look = this.controls.takeLook(); this.yaw -= look.x * 0.0031; this.pitch = clamp(this.pitch - look.y * 0.0031, -1.28, 0.78); this.camera.rotation.set(this.pitch, this.yaw, 0);
      const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; f.normalize(); const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const mv = this.controls.move.lengthSq() > 0.001 ? this.controls.move : this.controls.keyMove(), sp = (this.controls.keys.ShiftLeft || this.controls.keys.ShiftRight) ? 116 : 58;
      temp.set(0,0,0).addScaledVector(f, mv.y).addScaledVector(right, mv.x); if (temp.lengthSq() > 1) temp.normalize();
      const ox = this.pos.x, oz = this.pos.z, oy = groundY(ox, oz); this.pos.addScaledVector(temp, sp * dt); this.pos.x = clamp(this.pos.x, -HALF + 120, HALF - 120); this.pos.z = clamp(this.pos.z, -HALF + 120, HALF - 120);
      if (groundY(this.pos.x, this.pos.z) - oy > 42 && !onBridge(this.pos.x, this.pos.z, 4)) { this.pos.x = ox; this.pos.z = oz; }
      this.stick(false); this.time += dt;
      for (const b of this.beams) b.intensity = 0.85 + Math.sin(this.time * 1.5 + b.position.x * 0.01) * 0.22;
      for (const c of this.clouds) { c.group.position.x += c.speed * dt; if (c.group.position.x > HALF + 900) c.group.position.x = -HALF - 900; }
      for (const s of this.ships) { s.group.position.x += s.speed * dt; if (s.group.position.x > HALF + 700) s.group.position.x = -HALF - 900; }
      this.hud();
    }

    hud() {
      const x = this.pos.x, z = this.pos.z, h = groundY(x, z); let name = 'Harbor Approach';
      if (onBridge(x, z, 85)) name = 'The Signal Bridge'; else if (x > 450 && x < 2100 && z > 650 && z < 2300) name = 'Quiet Ruin District'; else if (x < -900 && z > 600 && z < 2100) name = 'Stone Marker Field'; else if (h > 330) name = 'High Weather Ridge'; else if (h < SEA + 26) name = 'Low Coastline'; else if (x > 2100 && z < -900) name = 'Eastern Wind Farms';
      $('place-name').textContent = name; $('place-detail').textContent = `${Math.round(Math.hypot(x, z))}m from origin`;
    }

    loop() {
      requestAnimationFrame(() => this.loop());
      const dt = Math.min(0.04, this.clock.getDelta());
      if (this.started) this.update(dt); else { this.camera.rotation.set(this.pitch, this.yaw, 0); this.stick(true); }
      this.renderer.render(this.scene, this.camera);
    }
  }

  new World();
})();
