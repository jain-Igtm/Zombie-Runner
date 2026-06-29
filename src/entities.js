import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, rand } from './utils.js';

const mats = {
  shirt: new THREE.MeshLambertMaterial({ color: 0x6a6744 }),
  skin: new THREE.MeshLambertMaterial({ color: 0x8c9a64 }),
  pants: new THREE.MeshLambertMaterial({ color: 0x303844 }),
  accent: new THREE.MeshLambertMaterial({ color: 0x5b1010 }),
  eye: new THREE.MeshBasicMaterial({ color: 0xf4f1c6 })
};

export class Enemy {
  constructor(scene, position, round) {
    this.scene = scene;
    this.round = round;
    this.health = CONFIG.enemy.baseHealth + round * CONFIG.enemy.healthPerRound;
    this.maxHealth = this.health;
    this.speed = CONFIG.enemy.baseSpeed + round * CONFIG.enemy.speedPerRound + rand(-0.15, 0.25);
    this.radius = 0.88;
    this.contactClock = rand(0, CONFIG.enemy.contactDelay);
    this.stagger = 0;
    this.removed = false;
    this.age = 0;
    this.group = this.createMesh();
    this.group.position.copy(position);
    this.group.position.y = 0;
    this.scene.add(this.group);
  }

  createMesh() {
    const group = new THREE.Group();
    group.userData.enemy = this;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.66, 1.18, 5, 10), mats.shirt);
    body.position.y = 1.55;
    body.userData.enemy = this;
    body.userData.zone = 'body';
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), mats.skin);
    head.position.y = 2.55;
    head.scale.set(0.92, 1.05, 0.9);
    head.userData.enemy = this;
    head.userData.zone = 'focus';
    group.add(head);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.24), mats.accent);
    mouth.position.set(0, 2.28, -0.36);
    mouth.userData.enemy = this;
    mouth.userData.zone = 'focus';
    group.add(mouth);

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.eye);
    leftEye.position.set(-0.16, 2.62, -0.39);
    group.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.16;
    group.add(rightEye);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.38, 0.5), mats.pants);
    hips.position.y = 0.86;
    hips.userData.enemy = this;
    hips.userData.zone = 'body';
    group.add(hips);

    const limbGeo = new THREE.CapsuleGeometry(0.16, 0.74, 4, 8);
    const leftArm = new THREE.Mesh(limbGeo, mats.skin);
    leftArm.position.set(-0.75, 1.62, -0.18);
    leftArm.rotation.x = 58 * Math.PI / 180;
    leftArm.rotation.z = 18 * Math.PI / 180;
    leftArm.userData.enemy = this;
    leftArm.userData.zone = 'body';
    group.add(leftArm);

    const rightArm = leftArm.clone();
    rightArm.position.x = 0.75;
    rightArm.rotation.z = -18 * Math.PI / 180;
    rightArm.userData.enemy = this;
    rightArm.userData.zone = 'body';
    group.add(rightArm);

    const legGeo = new THREE.CapsuleGeometry(0.18, 0.84, 4, 8);
    const leftLeg = new THREE.Mesh(legGeo, mats.pants);
    leftLeg.position.set(-0.28, 0.38, 0);
    leftLeg.userData.enemy = this;
    leftLeg.userData.zone = 'body';
    group.add(leftLeg);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.28;
    rightLeg.userData.enemy = this;
    rightLeg.userData.zone = 'body';
    group.add(rightLeg);

    const healthBack = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.11), new THREE.MeshBasicMaterial({ color: 0x181818, transparent: true, opacity: 0.8 }));
    healthBack.position.set(0, 3.15, 0);
    healthBack.userData.billboard = true;
    group.add(healthBack);

    this.healthFill = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.075), new THREE.MeshBasicMaterial({ color: 0xb6ff6b }));
    this.healthFill.position.set(0, 3.151, -0.002);
    this.healthFill.userData.billboard = true;
    group.add(this.healthFill);

    return group;
  }

  get position() {
    return this.group.position;
  }

  update(dt, playerPosition, world) {
    if (this.removed) return 0;
    this.age += dt;
    this.contactClock -= dt;
    this.stagger = Math.max(0, this.stagger - dt * 3.6);

    const dx = playerPosition.x - this.position.x;
    const dz = playerPosition.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const inv = distance > 0.0001 ? 1 / distance : 0;
    const dirX = dx * inv;
    const dirZ = dz * inv;
    this.group.rotation.y = Math.atan2(dirX, dirZ);
    this.group.position.y = Math.sin(this.age * 7.5) * 0.035;

    if (distance > CONFIG.enemy.contactRange) {
      const flank = Math.sin(this.age * 1.7) * 0.28;
      const moveSpeed = this.speed * (1 - this.stagger * 0.72) * dt;
      const oldX = this.position.x;
      const oldZ = this.position.z;
      this.position.x += (dirX + dirZ * flank) * moveSpeed;
      if (world.isBlocked(this.position.x, this.position.z, this.radius)) this.position.x = oldX;
      this.position.z += (dirZ - dirX * flank) * moveSpeed;
      if (world.isBlocked(this.position.x, this.position.z, this.radius)) this.position.z = oldZ;
      return 0;
    }

    if (this.contactClock <= 0) {
      this.contactClock = CONFIG.enemy.contactDelay;
      this.stagger = 0.35;
      return CONFIG.enemy.contactCost;
    }
    return 0;
  }

  faceBar(camera) {
    for (const child of this.group.children) {
      if (child.userData.billboard) child.quaternion.copy(camera.quaternion);
    }
  }

  applyImpact(amount) {
    if (this.removed) return false;
    this.health -= amount;
    this.stagger = clamp(this.stagger + 0.42, 0, 1);
    const pct = clamp(this.health / this.maxHealth, 0, 1);
    this.healthFill.scale.x = pct;
    this.healthFill.position.x = -(1 - pct) * 0.64;
    this.healthFill.material.color.set(pct > 0.5 ? 0xb6ff6b : pct > 0.25 ? 0xffd166 : 0xff5353);
    if (this.health <= 0) {
      this.removed = true;
      this.scene.remove(this.group);
      this.group.traverse((obj) => obj.geometry?.dispose?.());
      return true;
    }
    return false;
  }
}
