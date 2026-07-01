import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(() => {
  'use strict';

  const VERSION = 'escape-world-001';
  const WORLD_SIZE = 7600;
  const HALF = WORLD_SIZE / 2;
  const SEGMENTS = 176;
  const SEA_LEVEL = -36;
  const EYE_HEIGHT = 13.5;
  const WALK_SPEED = 58;
  const FAST_SPEED = 112;
  const LOOK_SPEED = 0.0031;
  const tmp = new THREE.Vector3();

  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function hash2(ix, iz) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function noise2(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smooth(x - ix);
    const fz = smooth(z - iz);
    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }

  function fbm(x, z) {
    let v = 0;
    let amp = 0.52;
    let freq = 1;
    for (let i = 0; i < 6; i += 1) {
      v += noise2(x * freq, z * freq) * amp;
      freq *= 2.04;
      amp *= 0.49;
    }
    return v;
  }

  function ridge(x, z) {
    const n = fbm(x, z);
    return 1 - Math.abs(n * 2 - 1);
  }

  function heightAt(x, z) {
    const broad = (fbm(x * 0.00052 + 18, z * 0.00052 - 4) - 0.5) * 520;
    const folds = Math.pow(ridge(x * 0.00105 - 7, z * 0.00105 + 13), 2.35) * 360;
    const wrinkles = (fbm(x * 0.0022 + 42, z * 0.0022 + 11) - 0.5) * 82;
    const longValley = Math.sin((x + z * 0.38) * 0.00115) * 72;
    const edge = smooth(clamp((Math.max(Math.abs(x), Math.abs(z)) / HALF - 0.72) / 0.28, 0, 1));
    const coastCut = edge * (260 + 140 * noise2(x * 0.001, z * 0.001));
    const roadCut = Math.max(0, 1 - Math.abs(z + 860) / 82) * 38 * smooth(clamp((x + 3300) / 700, 0, 1)) * smooth(clamp((3300 - x) / 700, 0, 1));
    return broad + folds + wrinkles + longValley - coastCut - roadCut - 78;
  }

  function rand(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  class TouchControls {
    constructor() {
      this.move = new THREE.Vector2();
      this.look = new THREE.Vector2();
      this.keys = Object.create(null);
      this.activeMove = null;
      this.activeLook = null;
      this.pad = $('move-pad');
      this.knob = $('move-knob');
      this.lookPad = $('look-pad');
      this.bind();
    }

    bind() {
      window.addEventListener('keydown', (e) => {
        this.keys[e.code] = true;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      }, { passive: false });
      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      this.pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.activeMove = e.pointerId;
        this.pad.setPointerCapture(e.pointerId);
        this.updateMove(e);
      }, { passive: false });
      this.pad.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.activeMove) this.updateMove(e);
      }, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        this.pad.addEventListener(type, (e) => {
          if (e.pointerId !== this.activeMove) return;
          this.activeMove = null;
          this.move.set(0, 0);
          this.knob.style.transform = 'translate(0px, 0px)';
        }, { passive: false });
      });

      this.lookPad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.activeLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.lookPad.setPointerCapture(e.pointerId);
      }, { passive: false });
      this.lookPad.addEventListener('pointermove', (e) => {
        if (!this.activeLook || e.pointerId !== this.activeLook.id) return;
        e.preventDefault();
        this.look.x += e.clientX - this.activeLook.x;
        this.look.y += e.clientY - this.activeLook.y;
        this.activeLook.x = e.clientX;
        this.activeLook.y = e.clientY;
      }, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        this.lookPad.addEventListener(type, (e) => {
          if (this.activeLook && e.pointerId === this.activeLook.id) this.activeLook = null;
        }, { passive: false });
      });
    }

    updateMove(e) {
      const r = this.pad.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width * 0.35;
      const dx = clamp(e.clientX - cx, -max, max);
      const dy = clamp(e.clientY - cy, -max, max);
      this.move.set(dx / max, -dy / max);
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    keyboardVector() {
      const x = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
      const z = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      return new THREE.Vector2(x, z).clampLength(0, 1);
    }

    consumeLook() {
      const out = this.look.clone();
      this.look.set(0, 0);
      return out;
    }

    fast() {
      return !!(this.keys.ShiftLeft || this.keys.ShiftRight);
    }
  }

  class EscapeWorld {
    constructor() {
      this.canvas = $('world-canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, 1.65));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x07101d);
      this.scene.fog = new THREE.FogExp2(0x8da2b7, 0.00043);

      this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 9200);
      this.camera.rotation.order = 'YXZ';

      this.clock = new THREE.Clock();
      this.controls = new TouchControls();
      this.yaw = 0.42;
      this.pitch = -0.09;
      this.position = new THREE.Vector3(-420, 0, 250);
      this.velocity = new THREE.Vector3();
      this.started = false;
      this.elapsed = 0;
      this.ships = [];
      this.beacons = [];
      this.clouds = [];

      this.makeLights();
      this.makeTerrain();
      this.makeWater();
      this.makeForest();
      this.makeRocks();
      this.makeBridge();
      this.makeRuins();
      this.makeMonolithField();
      this.makeBeacons();
      this.makeSkyObjects();
      this.makeShips();

      this.bindUi();
      this.resize();
      this.loop();
    }

    bindUi() {
      $('start-button').addEventListener('click', () => this.start());
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    }

    start() {
      this.started = true;
      $('start-screen').classList.remove('visible');
      $('hud').classList.remove('hidden');
      $('controls').classList.remove('hidden');
      if (document.documentElement.requestFullscreen && window.innerHeight < 720) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }

    makeLights() {
      this.scene.add(new THREE.HemisphereLight(0x9fbef3, 0x263221, 1.55));
      const sun = new THREE.DirectionalLight(0xffdba0, 2.45);
      sun.position.set(-900, 1400, 680);
      this.scene.add(sun);

      const low = new THREE.DirectionalLight(0x7fb2ff, 0.72);
      low.position.set(1200, 360, -900);
      this.scene.add(low);
    }

    makeTerrain() {
      const verts = [];
      const colors = [];
      const indices = [];
      const color = new THREE.Color();
      const low = new THREE.Color(0x43523f);
      const grass = new THREE.Color(0x526947);
      const moss = new THREE.Color(0x6e7d58);
      const stone = new THREE.Color(0x79807a);
      const snow = new THREE.Color(0xc9d3ce);
      const sand = new THREE.Color(0xa88e62);

      for (let iz = 0; iz <= SEGMENTS; iz += 1) {
        for (let ix = 0; ix <= SEGMENTS; ix += 1) {
          const x = -HALF + (ix / SEGMENTS) * WORLD_SIZE;
          const z = -HALF + (iz / SEGMENTS) * WORLD_SIZE;
          const y = heightAt(x, z);
          verts.push(x, y, z);

          const h01 = clamp((y + 70) / 520, 0, 1);
          const moisture = fbm(x * 0.0016 + 100, z * 0.0016 - 20);
          const slope = Math.abs(heightAt(x + 22, z) - y) + Math.abs(heightAt(x, z + 22) - y);

          if (y < SEA_LEVEL + 16) color.copy(sand);
          else if (slope > 44) color.copy(stone).lerp(snow, clamp((y - 270) / 380, 0, 1) * 0.35);
          else if (h01 > 0.72) color.copy(stone).lerp(snow, clamp((h01 - 0.72) / 0.28, 0, 1));
          else color.copy(low).lerp(grass, h01).lerp(moss, moisture * 0.25);

          const shade = 0.86 + noise2(x * 0.006, z * 0.006) * 0.22;
          color.multiplyScalar(shade);
          colors.push(color.r, color.g, color.b);
        }
      }

      const row = SEGMENTS + 1;
      for (let z = 0; z < SEGMENTS; z += 1) {
        for (let x = 0; x < SEGMENTS; x += 1) {
          const a = z * row + x;
          indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
    }

    makeWater() {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD_SIZE * 1.7, WORLD_SIZE * 1.7, 1, 1),
        new THREE.MeshStandardMaterial({
          color: 0x314f63,
          roughness: 0.38,
          metalness: 0.12,
          transparent: true,
          opacity: 0.74
        })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = SEA_LEVEL;
      this.scene.add(water);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(HALF * 0.97, HALF * 1.18, 192),
        new THREE.MeshBasicMaterial({ color: 0x9fc6de, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = SEA_LEVEL + 0.8;
      this.scene.add(ring);
    }

    makeForest() {
      const random = rand(94120);
      const count = 1850;
      const trunkGeo = new THREE.CylinderGeometry(0.72, 1.1, 11, 6);
      const leafGeo = new THREE.ConeGeometry(6.8, 22, 7);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2d21, roughness: 1 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5c47, roughness: 0.95 });

      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
      let n = 0;

      for (let i = 0; i < count * 2 && n < count; i += 1) {
        const x = (random() - 0.5) * WORLD_SIZE * 0.92;
        const z = (random() - 0.5) * WORLD_SIZE * 0.92;
        const h = heightAt(x, z);
        const density = fbm(x * 0.0018 + 2, z * 0.0018 + 80);
        if (h < SEA_LEVEL + 24 || h > 380 || density < 0.42) continue;
        if (Math.abs(z + 860) < 90 && Math.abs(x) < 3300) continue;

        const scale = 0.72 + random() * 1.85;
        const yaw = random() * Math.PI;
        const trunkM = new THREE.Matrix4();
        const leafM = new THREE.Matrix4();
        trunkM.compose(
          new THREE.Vector3(x, h + 5.5 * scale, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
          new THREE.Vector3(scale, scale, scale)
        );
        leafM.compose(
          new THREE.Vector3(x, h + 20 * scale, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
          new THREE.Vector3(scale, scale * (0.92 + random() * 0.28), scale)
        );
        trunks.setMatrixAt(n, trunkM);
        leaves.setMatrixAt(n, leafM);
        n += 1;
      }
      trunks.count = n;
      leaves.count = n;
      trunks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      this.scene.add(trunks, leaves);
    }

    makeRocks() {
      const random = rand(7127);
      const count = 520;
      const geo = new THREE.DodecahedronGeometry(5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x6f746d, roughness: 0.98 });
      const rocks = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4();
      let n = 0;
      for (let i = 0; i < count * 2 && n < count; i += 1) {
        const x = (random() - 0.5) * WORLD_SIZE * 0.96;
        const z = (random() - 0.5) * WORLD_SIZE * 0.96;
        const h = heightAt(x, z);
        if (h < SEA_LEVEL + 6) continue;
        const s = new THREE.Vector3(0.8 + random() * 3.4, 0.45 + random() * 2.2, 0.8 + random() * 3.4);
        m.compose(
          new THREE.Vector3(x, h + s.y * 2.6, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 0.8, random() * Math.PI, random() * 0.4)),
          s
        );
        rocks.setMatrixAt(n, m);
        n += 1;
      }
      rocks.count = n;
      rocks.instanceMatrix.needsUpdate = true;
      this.scene.add(rocks);
    }

    makeBridge() {
      const group = new THREE.Group();
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x30383d, roughness: 0.85, metalness: 0.08 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0x67727a, roughness: 0.65, metalness: 0.22 });
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffcf8a });
      const roadGeo = new THREE.BoxGeometry(88, 7, 78);
      const railGeo = new THREE.BoxGeometry(88, 4, 5);
      const pierGeo = new THREE.BoxGeometry(18, 155, 18);

      for (let x = -3300; x <= 3300; x += 88) {
        const z = -860;
        const y = Math.max(heightAt(x, z) + 52, SEA_LEVEL + 80);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(x, y, z);
        group.add(road);

        const left = new THREE.Mesh(railGeo, railMat);
        left.position.set(x, y + 7, z - 42);
        const right = new THREE.Mesh(railGeo, railMat);
        right.position.set(x, y + 7, z + 42);
        group.add(left, right);

        if (Math.round((x + 3300) / 88) % 8 === 0) {
          const pier = new THREE.Mesh(pierGeo, railMat);
          pier.position.set(x, y - 76, z);
          group.add(pier);

          const lamp = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), lightMat);
          lamp.position.set(x, y + 24, z - 48);
          group.add(lamp);

          const glow = new THREE.PointLight(0xffb36f, 0.75, 260);
          glow.position.copy(lamp.position);
          this.beacons.push(glow);
          group.add(glow);
        }
      }

      for (let x = -3000; x <= 3000; x += 600) {
        const y = Math.max(heightAt(x, -860) + 170, SEA_LEVEL + 210);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(38, 210, 38), railMat);
        tower.position.set(x, y, -860);
        group.add(tower);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(84, 16, 84), roadMat);
        cap.position.set(x, y + 112, -860);
        group.add(cap);

        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x - 300, y + 96, -904),
          new THREE.Vector3(x, y + 140, -904),
          new THREE.Vector3(x + 300, y + 96, -904)
        ]);
        const cable = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),
          new THREE.LineBasicMaterial({ color: 0x98a7ad, transparent: true, opacity: 0.45 })
        );
        group.add(cable);
      }

      this.scene.add(group);
    }

    makeRuins() {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x4b5556, roughness: 0.94, metalness: 0.04 });
      const glass = new THREE.MeshBasicMaterial({ color: 0xb4d9ff, transparent: true, opacity: 0.13 });
      const random = rand(87291);

      for (let i = 0; i < 120; i += 1) {
        const x = 1200 + (random() - 0.5) * 1600;
        const z = 1450 + (random() - 0.5) * 1400;
        const h = heightAt(x, z);
        if (h < SEA_LEVEL + 20) continue;
        const w = 26 + random() * 70;
        const d = 26 + random() * 70;
        const yScale = 22 + Math.pow(random(), 1.8) * 260;
        const block = new THREE.Mesh(new THREE.BoxGeometry(w, yScale, d), mat);
        block.position.set(x, h + yScale / 2, z);
        block.rotation.y = (random() - 0.5) * 0.16;
        group.add(block);

        if (random() > 0.45) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, yScale * 0.66, 0.6), glass);
          win.position.set(x, h + yScale * 0.58, z - d / 2 - 0.5);
          win.rotation.y = block.rotation.y;
          group.add(win);
        }
      }

      for (let i = 0; i < 28; i += 1) {
        const x = 380 + (i % 7) * 72;
        const z = 760 + Math.floor(i / 7) * 88;
        const h = heightAt(x, z);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 74 + random() * 70, 10), mat);
        col.position.set(x, h + col.geometry.parameters.height / 2, z);
        col.rotation.z = (random() - 0.5) * 0.13;
        group.add(col);
      }

      this.scene.add(group);
    }

    makeMonolithField() {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.7, metalness: 0.15 });
      const glyph = new THREE.MeshBasicMaterial({ color: 0x7ed8ff, transparent: true, opacity: 0.32 });
      const random = rand(1205);

      for (let i = 0; i < 26; i += 1) {
        const a = i / 26 * Math.PI * 2;
        const r = 160 + random() * 520;
        const x = -1700 + Math.cos(a) * r + (random() - 0.5) * 140;
        const z = 1250 + Math.sin(a) * r + (random() - 0.5) * 140;
        const h = heightAt(x, z);
        const tall = 80 + random() * 260;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(18 + random() * 24, tall, 8 + random() * 18), mat);
        slab.position.set(x, h + tall / 2, z);
        slab.rotation.y = -a + Math.PI / 2 + (random() - 0.5) * 0.28;
        group.add(slab);

        if (i % 3 === 0) {
          const mark = new THREE.Mesh(new THREE.BoxGeometry(10, tall * 0.34, 1), glyph);
          mark.position.set(x, h + tall * 0.57, z);
          mark.rotation.copy(slab.rotation);
          group.add(mark);
        }
      }

      this.scene.add(group);
    }

    makeBeacons() {
      const mat = new THREE.MeshStandardMaterial({ color: 0x59646a, roughness: 0.75, metalness: 0.18 });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd28b });
      const spots = [
        [-2750, -1220], [-2120, 1880], [-650, -2010], [640, 660], [1650, -1820], [2820, 720], [3020, -2400]
      ];
      for (const [x, z] of spots) {
        const h = heightAt(x, z);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 16, 118, 10), mat);
        tower.position.set(x, h + 59, z);
        this.scene.add(tower);

        const orb = new THREE.Mesh(new THREE.SphereGeometry(11, 18, 12), glowMat);
        orb.position.set(x, h + 126, z);
        this.scene.add(orb);

        const light = new THREE.PointLight(0xffb56b, 1.15, 620);
        light.position.copy(orb.position);
        this.beacons.push(light);
        this.scene.add(light);
      }
    }

    makeSkyObjects() {
      const starGeo = new THREE.BufferGeometry();
      const starVerts = [];
      const random = rand(3333);
      for (let i = 0; i < 900; i += 1) {
        const x = (random() - 0.5) * WORLD_SIZE * 1.6;
        const y = 560 + random() * 1700;
        const z = (random() - 0.5) * WORLD_SIZE * 1.6;
        starVerts.push(x, y, z);
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
      this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd9eaff, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.5 })));

      const cloudMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 1, transparent: true, opacity: 0.28 });
      for (let i = 0; i < 18; i += 1) {
        const g = new THREE.Group();
        const x = (random() - 0.5) * WORLD_SIZE;
        const z = (random() - 0.5) * WORLD_SIZE;
        const y = 420 + random() * 260;
        for (let j = 0; j < 5; j += 1) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(42 + random() * 46, 12, 8), cloudMat);
          puff.scale.set(1.8 + random() * 2.4, 0.28 + random() * 0.22, 0.74 + random() * 0.5);
          puff.position.set((random() - 0.5) * 180, (random() - 0.5) * 20, (random() - 0.5) * 70);
          g.add(puff);
        }
        g.position.set(x, y, z);
        g.rotation.y = random() * Math.PI;
        this.clouds.push({ group: g, speed: 2 + random() * 5 });
        this.scene.add(g);
      }
    }

    makeShips() {
      const hullMat = new THREE.MeshStandardMaterial({ color: 0x252f38, roughness: 0.58, metalness: 0.28 });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff });
      for (let i = 0; i < 5; i += 1) {
        const ship = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(84, 22, 26), hullMat);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(142, 7, 16), hullMat);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 18), hullMat);
        body.position.y = 0;
        wing.position.y = -3;
        tail.position.set(42, 14, 0);
        ship.add(body, wing, tail);

        for (const sx of [-48, 48]) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), lampMat);
          lamp.position.set(sx, -8, 15);
          ship.add(lamp);
          const light = new THREE.PointLight(0x8fe8ff, 0.35, 180);
          light.position.copy(lamp.position);
          ship.add(light);
        }

        ship.position.set(-3800 - i * 420, 270 + i * 42, -2100 + i * 890);
        ship.rotation.y = Math.PI * 0.5;
        this.ships.push({ group: ship, lane: i, speed: 34 + i * 8 });
        this.scene.add(ship);
      }
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    update(dt) {
      const look = this.controls.consumeLook();
      this.yaw -= look.x * LOOK_SPEED;
      this.pitch = clamp(this.pitch - look.y * LOOK_SPEED, -1.28, 0.78);

      this.camera.rotation.set(this.pitch, this.yaw, 0);
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const keyMove = this.controls.keyboardVector();
      const mv = this.controls.move.lengthSq() > 0.001 ? this.controls.move : keyMove;
      const speed = this.controls.fast() ? FAST_SPEED : WALK_SPEED;
      tmp.set(0, 0, 0).addScaledVector(forward, mv.y).addScaledVector(right, mv.x);
      if (tmp.lengthSq() > 1) tmp.normalize();

      this.position.addScaledVector(tmp, speed * dt);
      this.position.x = clamp(this.position.x, -HALF + 120, HALF - 120);
      this.position.z = clamp(this.position.z, -HALF + 120, HALF - 120);
      const ground = heightAt(this.position.x, this.position.z);
      const desiredY = Math.max(ground + EYE_HEIGHT, SEA_LEVEL + EYE_HEIGHT + 4);
      this.position.y = lerp(this.position.y || desiredY, desiredY, 1 - Math.pow(0.00001, dt));
      this.camera.position.copy(this.position);

      this.elapsed += dt;
      for (const b of this.beacons) b.intensity = 0.85 + Math.sin(this.elapsed * 1.5 + b.position.x * 0.01) * 0.22;
      for (const c of this.clouds) {
        c.group.position.x += c.speed * dt;
        if (c.group.position.x > HALF + 900) c.group.position.x = -HALF - 900;
      }
      for (const s of this.ships) {
        s.group.position.x += s.speed * dt;
        s.group.position.y += Math.sin(this.elapsed * 0.8 + s.lane) * 0.015;
        if (s.group.position.x > HALF + 700) s.group.position.x = -HALF - 900;
      }

      this.updateHud();
    }

    updateHud() {
      const x = this.position.x;
      const z = this.position.z;
      let name = 'Harbor Approach';
      if (Math.abs(z + 860) < 170 && Math.abs(x) < 3400) name = 'The Signal Bridge';
      else if (x > 450 && x < 2100 && z > 650 && z < 2300) name = 'Quiet Ruin District';
      else if (x < -900 && z > 600 && z < 2100) name = 'Black Marker Field';
      else if (heightAt(x, z) > 330) name = 'High Weather Ridge';
      else if (heightAt(x, z) < SEA_LEVEL + 26) name = 'Low Coastline';
      else if (x > 2100 && z < -900) name = 'Eastern Wind Farms';
      $('place-name').textContent = name;
      $('place-detail').textContent = `${Math.round(Math.hypot(x, z))}m from origin`;
    }

    loop() {
      requestAnimationFrame(() => this.loop());
      const dt = Math.min(0.04, this.clock.getDelta());
      if (this.started) this.update(dt);
      else {
        this.camera.rotation.set(this.pitch, this.yaw, 0);
        const introH = heightAt(this.position.x, this.position.z);
        this.position.y = Math.max(introH + EYE_HEIGHT, SEA_LEVEL + EYE_HEIGHT + 4);
        this.camera.position.copy(this.position);
      }
      this.renderer.render(this.scene, this.camera);
    }
  }

  new EscapeWorld();
})();
