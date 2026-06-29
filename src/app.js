import * as THREE from 'three';
import { CONFIG } from './config.js';
import { StaticWorld } from './world.js';
import { Enemy } from './entities.js';
import { MobileInput } from './input.js';
import { clamp, formatEnergy, rand } from './utils.js';

class ZombieRunnerGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 240);
    this.player = {
      position: new THREE.Vector3(0, CONFIG.world.playerHeight, 14),
      yaw: Math.PI,
      pitch: 0,
      health: CONFIG.player.maxHealth,
      lastContactTime: -Infinity
    };

    this.world = new StaticWorld(this.scene);
    this.input = new MobileInput();
    this.raycaster = new THREE.Raycaster();
    this.enemies = [];
    this.clock = new THREE.Clock();
    this.running = false;
    this.over = false;
    this.round = 0;
    this.score = 0;
    this.spawnedThisRound = 0;
    this.toSpawnThisRound = 0;
    this.spawnTimer = 0;
    this.roundDelay = 0;
    this.actionCooldown = 0;
    this.reloadTimer = 0;
    this.energy = CONFIG.tool.magazineSize;
    this.reserve = CONFIG.tool.reserve;
    this.pulseFlashTime = 0;

    this.tool = this.createToolMesh();
    this.camera.add(this.tool);
    this.scene.add(this.camera);

    this.bindUI();
    this.updateCamera();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindUI() {
    this.hud = document.getElementById('hud');
    this.touchLayer = document.getElementById('touch-layer');
    this.startScreen = document.getElementById('start-screen');
    this.overScreen = document.getElementById('game-over-screen');
    this.startButton = document.getElementById('start-button');
    this.restartButton = document.getElementById('restart-button');
    this.roundValue = document.getElementById('round-value');
    this.scoreValue = document.getElementById('score-value');
    this.activeValue = document.getElementById('active-value');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.energyValue = document.getElementById('ammo-value');
    this.toolState = document.getElementById('tool-state');
    this.roundBanner = document.getElementById('round-banner');
    this.feedback = document.getElementById('feedback-vignette');
    this.finalRound = document.getElementById('final-round');
    this.finalScore = document.getElementById('final-score');
    this.startButton.addEventListener('click', () => this.start());
    this.restartButton.addEventListener('click', () => this.restart());
  }

  createToolMesh() {
    const group = new THREE.Group();
    group.position.set(0.58, -0.55, -1.0);
    group.rotation.set(-0.05, -0.08, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x25272a });
    const metal = new THREE.MeshLambertMaterial({ color: 0x4b5359 });
    const gripMat = new THREE.MeshLambertMaterial({ color: 0x151617 });
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.0), mat);
    body.position.set(0, 0, -0.28);
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.78, 12), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.96);
    group.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.18), gripMat);
    grip.position.set(0.02, -0.26, 0.02);
    grip.rotation.x = -0.2;
    group.add(grip);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.24), metal);
    mag.position.set(0.01, -0.29, -0.25);
    mag.rotation.x = -0.12;
    group.add(mag);

    this.pulseFlash = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), flashMat);
    this.pulseFlash.rotation.x = -Math.PI / 2;
    this.pulseFlash.position.set(0, 0.04, -1.38);
    group.add(this.pulseFlash);
    return group;
  }

  start() {
    this.startScreen.classList.remove('visible');
    this.overScreen.classList.remove('visible');
    this.hud.classList.remove('hidden');
    this.touchLayer.classList.remove('hidden');
    this.running = true;
    this.over = false;
    this.beginRound(1);
  }

  restart() {
    for (const enemy of this.enemies) this.scene.remove(enemy.group);
    this.enemies = [];
    this.player.position.set(0, CONFIG.world.playerHeight, 14);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;
    this.player.health = CONFIG.player.maxHealth;
    this.player.lastContactTime = -Infinity;
    this.round = 0;
    this.score = 0;
    this.energy = CONFIG.tool.magazineSize;
    this.reserve = CONFIG.tool.reserve;
    this.spawnedThisRound = 0;
    this.toSpawnThisRound = 0;
    this.reloadTimer = 0;
    this.actionCooldown = 0;
    this.overScreen.classList.remove('visible');
    this.hud.classList.remove('hidden');
    this.touchLayer.classList.remove('hidden');
    this.running = true;
    this.over = false;
    this.beginRound(1);
  }

  beginRound(roundNumber) {
    this.round = roundNumber;
    this.spawnedThisRound = 0;
    this.toSpawnThisRound = CONFIG.rounds.baseCount + (roundNumber - 1) * CONFIG.rounds.perRound;
    this.spawnTimer = CONFIG.enemy.spawnGrace;
    this.roundDelay = 0;
    this.showRoundBanner(`Round ${roundNumber}`);
    this.updateHUD();
  }

  completeRound() {
    this.roundDelay = CONFIG.rounds.betweenRounds;
    this.showRoundBanner(`Round ${this.round} clear`);
    this.reserve += Math.min(30, 8 + this.round * 3);
  }

  showRoundBanner(text) {
    this.roundBanner.textContent = text;
    this.roundBanner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.roundBanner.classList.remove('show'), 1600);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running && !this.over) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.pulseFlashTime = Math.max(0, this.pulseFlashTime - dt);
    if (this.pulseFlash) this.pulseFlash.material.opacity = this.pulseFlashTime > 0 ? this.pulseFlashTime * 12 : 0;
    this.updateLook();
    this.updateMovement(dt);
    this.updateTool(dt);
    this.updateRound(dt);
    this.updateEnemies(dt);
    this.updateRegen(dt);
    this.updateCamera();
    this.updateHUD();
  }

  updateLook() {
    const look = this.input.consumeLook();
    this.player.yaw -= look.x;
    this.player.pitch = clamp(this.player.pitch - look.y, -1.22, 1.15);
  }

  updateMovement(dt) {
    const move = this.input.move;
    const speed = this.input.sprinting ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
    const forward = -move.y;
    const strafe = move.x;
    if (Math.abs(forward) < 0.001 && Math.abs(strafe) < 0.001) return;
    const yaw = this.player.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dx = (sin * forward + cos * strafe) * speed * dt;
    const dz = (cos * forward - sin * strafe) * speed * dt;
    const flatPos = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    this.world.resolveMove(flatPos, dx, dz, CONFIG.world.playerRadius);
    this.player.position.x = flatPos.x;
    this.player.position.z = flatPos.z;
  }

  updateTool(dt) {
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      this.toolState.textContent = 'RELOADING';
      this.tool.rotation.x = -0.32 + Math.sin(this.reloadTimer * 20) * 0.04;
      if (this.reloadTimer <= 0) this.finishReload();
      return;
    }
    this.toolState.textContent = CONFIG.tool.name;
    this.tool.rotation.x += (-0.05 - this.tool.rotation.x) * Math.min(1, dt * 12);
    this.tool.position.y = -0.55 + Math.sin(performance.now() * 0.006) * 0.008;
    if (this.input.consumeReload()) this.startReload();
    if (this.input.active) this.tryAction();
  }

  tryAction() {
    if (this.actionCooldown > 0 || this.reloadTimer > 0) return;
    if (this.energy <= 0) {
      this.startReload();
      return;
    }
    this.actionCooldown = CONFIG.tool.actionDelay;
    this.energy -= 1;
    this.pulseFlashTime = 0.08;
    this.tool.rotation.x -= CONFIG.tool.kick;
    this.player.pitch = clamp(this.player.pitch + CONFIG.tool.kick * 0.18, -1.22, 1.15);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += rand(-CONFIG.tool.spread, CONFIG.tool.spread);
    dir.y += rand(-CONFIG.tool.spread, CONFIG.tool.spread);
    dir.z += rand(-CONFIG.tool.spread, CONFIG.tool.spread);
    dir.normalize();

    this.raycaster.set(this.camera.position, dir);
    this.raycaster.far = CONFIG.tool.range;
    const objects = [];
    for (const enemy of this.enemies) {
      if (!enemy.removed) enemy.group.traverse((obj) => { if (obj.isMesh) objects.push(obj); });
    }
    const hits = this.raycaster.intersectObjects(objects, false);
    if (!hits.length) return;
    const hit = hits[0].object;
    const enemy = hit.userData.enemy;
    const zone = hit.userData.zone;
    if (!enemy) return;
    const removed = enemy.applyImpact(zone === 'focus' ? CONFIG.tool.precisionPower : CONFIG.tool.power);
    if (removed) {
      this.score += 1;
      this.enemies = this.enemies.filter((item) => !item.removed);
    }
  }

  startReload() {
    if (this.reloadTimer > 0) return;
    if (this.energy >= CONFIG.tool.magazineSize) return;
    if (this.reserve <= 0) return;
    this.reloadTimer = CONFIG.tool.reloadTime;
  }

  finishReload() {
    const needed = CONFIG.tool.magazineSize - this.energy;
    const loaded = Math.min(needed, this.reserve);
    this.energy += loaded;
    this.reserve -= loaded;
    this.tool.rotation.x = -0.05;
  }

  updateRound(dt) {
    if (this.roundDelay > 0) {
      this.roundDelay -= dt;
      if (this.roundDelay <= 0) this.beginRound(this.round + 1);
      return;
    }
    const maxActive = CONFIG.rounds.maxActiveBase + Math.floor(this.round * CONFIG.rounds.maxActiveScale);
    if (this.spawnedThisRound < this.toSpawnThisRound && this.enemies.length < maxActive) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy();
        this.spawnedThisRound += 1;
        this.spawnTimer = Math.max(0.22, CONFIG.rounds.spawnInterval - this.round * 0.025);
      }
    }
    if (this.spawnedThisRound >= this.toSpawnThisRound && this.enemies.length === 0 && this.roundDelay <= 0) this.completeRound();
  }

  spawnEnemy() {
    const playerFlat = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    const spawn = this.world.getSpawnPointAwayFrom(playerFlat);
    this.enemies.push(new Enemy(this.scene, spawn, this.round));
  }

  updateEnemies(dt) {
    let contactTotal = 0;
    const playerFlat = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    for (const enemy of this.enemies) {
      contactTotal += enemy.update(dt, playerFlat, this.world);
      enemy.faceBar(this.camera);
    }
    if (contactTotal > 0) this.reducePlayerHealth(contactTotal);
  }

  reducePlayerHealth(amount) {
    this.player.health = clamp(this.player.health - amount, 0, CONFIG.player.maxHealth);
    this.player.lastContactTime = performance.now() / 1000;
    this.feedback.style.opacity = '1';
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => { this.feedback.style.opacity = '0'; }, 120);
    if (this.player.health <= 0) this.endGame();
  }

  updateRegen(dt) {
    const now = performance.now() / 1000;
    if (now - this.player.lastContactTime > CONFIG.player.regenDelay && this.player.health > 0) {
      this.player.health = clamp(this.player.health + CONFIG.player.regenRate * dt, 0, CONFIG.player.maxHealth);
    }
  }

  endGame() {
    this.over = true;
    this.running = false;
    this.hud.classList.add('hidden');
    this.touchLayer.classList.add('hidden');
    this.finalRound.textContent = `Round ${this.round}`;
    this.finalScore.textContent = `${this.score} clears`;
    this.overScreen.classList.add('visible');
  }

  updateCamera() {
    this.camera.position.copy(this.player.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;
  }

  updateHUD() {
    this.roundValue.textContent = this.round;
    this.scoreValue.textContent = this.score;
    this.activeValue.textContent = this.enemies.length;
    this.healthFill.style.width = `${this.player.health}%`;
    this.healthText.textContent = Math.ceil(this.player.health);
    this.energyValue.textContent = formatEnergy(this.energy, this.reserve);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 76 : 68;
    this.camera.updateProjectionMatrix();
  }
}

new ZombieRunnerGame();
