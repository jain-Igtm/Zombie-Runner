import * as THREE from 'three';
import { CONFIG } from './config.js';
import { circleIntersectsRect, rand } from './utils.js';

const DEG = Math.PI / 180;

export class StaticWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.spawnPoints = [];
    this.bounds = CONFIG.world.halfSize;
    this.materials = this.createMaterials();
    this.build();
  }

  createMaterials() {
    return {
      asphalt: new THREE.MeshLambertMaterial({ color: 0x25282b }),
      concrete: new THREE.MeshLambertMaterial({ color: 0x6d7069 }),
      brick: new THREE.MeshLambertMaterial({ color: 0x7c4c3b }),
      rust: new THREE.MeshLambertMaterial({ color: 0x8c5732 }),
      metal: new THREE.MeshLambertMaterial({ color: 0x5f6a6d }),
      darkMetal: new THREE.MeshLambertMaterial({ color: 0x24282b }),
      yellow: new THREE.MeshLambertMaterial({ color: 0xc99b3a }),
      glass: new THREE.MeshLambertMaterial({ color: 0x455765, transparent: true, opacity: 0.72 }),
      line: new THREE.MeshBasicMaterial({ color: 0xd6bf63 }),
      grass: new THREE.MeshLambertMaterial({ color: 0x33422c }),
      sign: new THREE.MeshLambertMaterial({ color: 0xd2d4ca })
    };
  }

  build() {
    this.scene.background = new THREE.Color(0x121820);
    this.scene.fog = new THREE.Fog(0x121820, CONFIG.world.fogNear, CONFIG.world.fogFar);
    this.scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x333321, 1.4));
    const sun = new THREE.DirectionalLight(0xffe0a5, 1.55);
    sun.position.set(-42, 76, 28);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x91b4ff, 0.55);
    fill.position.set(60, 32, -48);
    this.scene.add(fill);
    this.addGround();
    this.addPerimeter();
    this.addRoadLines();
    this.addBuildings();
    this.addProps();
    this.addSpawnPoints();
  }

  addGround() {
    const size = this.bounds * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 16, 16), this.materials.asphalt);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const vergeGeo = new THREE.PlaneGeometry(size, 18);
    const north = new THREE.Mesh(vergeGeo, this.materials.grass);
    north.position.set(0, 0.012, -this.bounds + 7);
    north.rotation.x = -Math.PI / 2;
    this.scene.add(north);
    const south = north.clone();
    south.position.z = this.bounds - 7;
    this.scene.add(south);
  }

  addPerimeter() {
    const b = this.bounds;
    this.addBox(0, -b - 1.25, b * 2 + 5, 3.2, 6, this.materials.concrete, 'north wall');
    this.addBox(0, b + 1.25, b * 2 + 5, 3.2, 6, this.materials.concrete, 'south wall');
    this.addBox(-b - 1.25, 0, 3.2, b * 2 + 5, 6, this.materials.concrete, 'west wall');
    this.addBox(b + 1.25, 0, 3.2, b * 2 + 5, 6, this.materials.concrete, 'east wall');
    for (let i = -6; i <= 6; i += 1) {
      this.addLamp(i * 20, -b + 4, Math.PI);
      this.addLamp(i * 20, b - 4, 0);
    }
  }

  addRoadLines() {
    const lineGeo = new THREE.BoxGeometry(0.26, 0.035, 7.8);
    for (let z = -60; z <= 60; z += 16) {
      const stripe = new THREE.Mesh(lineGeo, this.materials.line);
      stripe.position.set(0, 0.045, z);
      this.scene.add(stripe);
    }
    const crossGeo = new THREE.BoxGeometry(8, 0.035, 0.26);
    for (let x = -56; x <= 56; x += 16) {
      const stripe = new THREE.Mesh(crossGeo, this.materials.line);
      stripe.position.set(x, 0.05, 0);
      this.scene.add(stripe);
    }
  }

  addBuildings() {
    this.addBox(-46, -34, 24, 20, 11, this.materials.brick, 'generator block');
    this.addBox(-48, -17, 18, 8, 7, this.materials.darkMetal, 'loading dock');
    this.addBox(42, -32, 22, 24, 13, this.materials.concrete, 'cold storage');
    this.addBox(54, 18, 18, 31, 10, this.materials.metal, 'vehicle bay');
    this.addBox(-44, 34, 28, 22, 12, this.materials.rust, 'rust warehouse');
    this.addBox(-7, 43, 24, 15, 8, this.materials.concrete, 'admin hut');
    this.addWindows(-46, -44, 4, 4, 6);
    this.addWindows(42, -45, 4, 5, 7);
    this.addWindows(-44, 22.7, 5, 5, 6);
    this.addTower(20, 45);
    this.addTower(-58, 5);
    this.addContainerRow(18, -17, 4, false);
    this.addContainerRow(-15, -48, 5, true);
    this.addContainerRow(18, 22, 4, true);
  }

  addProps() {
    this.addCar(-19, -7, 20 * DEG, 0x2f4a57);
    this.addCar(29, 6, -16 * DEG, 0x723434);
    this.addCar(8, -36, 83 * DEG, 0x555e44);
    this.addCar(-32, 8, -38 * DEG, 0x4b4b50);
    for (let i = 0; i < 34; i += 1) {
      const x = rand(-66, 66);
      const z = rand(-66, 66);
      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
      if (!this.isBlocked(x, z, 2.5)) this.addCrate(x, z, rand(0, Math.PI));
    }
    this.addSign(0, -64, 'RUN');
    this.addSign(63, -5, 'HOLD');
    this.addSign(-63, 18, 'NO EXIT');
  }

  addSpawnPoints() {
    const b = this.bounds - 8;
    this.spawnPoints = [
      new THREE.Vector3(-55, 0, -b), new THREE.Vector3(0, 0, -b), new THREE.Vector3(55, 0, -b),
      new THREE.Vector3(-b, 0, -42), new THREE.Vector3(-b, 0, 0), new THREE.Vector3(-b, 0, 42),
      new THREE.Vector3(b, 0, -42), new THREE.Vector3(b, 0, 0), new THREE.Vector3(b, 0, 42),
      new THREE.Vector3(-48, 0, b), new THREE.Vector3(6, 0, b), new THREE.Vector3(51, 0, b)
    ];
  }

  addBox(x, z, w, d, h, material, name = 'block', y = h / 2) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    this.scene.add(mesh);
    if (h > 0.6) this.colliders.push({ x, z, w, d, name });
    return mesh;
  }

  addWindows(centerX, wallZ, count, width, y) {
    for (let i = 0; i < count; i += 1) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, 0.18), this.materials.glass);
      win.position.set(centerX + (i - (count - 1) / 2) * (width + 1.5), y, wallZ);
      this.scene.add(win);
    }
  }

  addContainerRow(x, z, count, rotate) {
    for (let i = 0; i < count; i += 1) {
      const px = rotate ? x : x + i * 9.5;
      const pz = rotate ? z + i * 9.5 : z;
      const w = rotate ? 6 : 8.5;
      const d = rotate ? 8.5 : 6;
      this.addBox(px, pz, w, d, 4.6, i % 2 ? this.materials.metal : this.materials.rust, 'cargo container');
    }
  }

  addTower(x, z) {
    const legs = [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]];
    for (const [lx, lz] of legs) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 10, 0.45), this.materials.darkMetal);
      leg.position.set(x + lx, 5, z + lz);
      this.scene.add(leg);
    }
    this.addBox(x, z, 7.2, 7.2, 1, this.materials.metal, 'watchtower base', 10.2);
    this.addBox(x, z, 8.4, 8.4, 0.5, this.materials.darkMetal, 'watchtower roof', 14.8);
    this.colliders.push({ x, z, w: 7.5, d: 7.5, name: 'watchtower legs' });
  }

  addLamp(x, z, rot) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 8), this.materials.darkMetal);
    pole.position.set(x, 3.5, z);
    this.scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 1), this.materials.yellow);
    head.position.set(x, 7.25, z + Math.cos(rot) * 1.0);
    head.rotation.y = rot;
    this.scene.add(head);
  }

  addCar(x, z, rot, color) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.45, 8), mat);
    body.position.set(x, 0.78, z);
    body.rotation.y = rot;
    this.scene.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 3.4), this.materials.glass);
    cabin.position.set(x, 1.95, z - Math.cos(rot) * 0.35);
    cabin.rotation.y = rot;
    this.scene.add(cabin);
    this.colliders.push({ x, z, w: Math.abs(Math.cos(rot)) * 5.4 + Math.abs(Math.sin(rot)) * 8.2, d: Math.abs(Math.sin(rot)) * 5.4 + Math.abs(Math.cos(rot)) * 8.2, name: 'abandoned car' });
  }

  addCrate(x, z, rot) {
    const size = rand(1.5, 3.2);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.materials.rust);
    crate.position.set(x, size / 2, z);
    crate.rotation.y = rot;
    this.scene.add(crate);
    this.colliders.push({ x, z, w: size + 0.3, d: size + 0.3, name: 'crate' });
  }

  addSign(x, z, text) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.35), this.materials.sign);
    board.position.y = 4.6;
    group.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4.7, 8), this.materials.darkMetal);
    post.position.y = 2.25;
    group.add(post);
    group.rotation.y = x > 50 ? -Math.PI / 2 : x < -50 ? Math.PI / 2 : 0;
    this.scene.add(group);
  }

  isBlocked(x, z, radius) {
    if (x < -this.bounds + radius || x > this.bounds - radius || z < -this.bounds + radius || z > this.bounds - radius) return true;
    return this.colliders.some((rect) => circleIntersectsRect(x, z, radius, rect));
  }

  resolveMove(position, deltaX, deltaZ, radius) {
    const next = position.clone();
    next.x += deltaX;
    if (!this.isBlocked(next.x, next.z, radius)) position.x = next.x;
    next.copy(position);
    next.z += deltaZ;
    if (!this.isBlocked(next.x, next.z, radius)) position.z = next.z;
  }

  getSpawnPointAwayFrom(playerPosition) {
    let best = this.spawnPoints[0].clone();
    let bestDistance = -Infinity;
    for (const point of this.spawnPoints) {
      const distance = point.distanceToSquared(playerPosition);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = point.clone();
      }
    }
    best.x += rand(-3.5, 3.5);
    best.z += rand(-3.5, 3.5);
    return best;
  }
}
