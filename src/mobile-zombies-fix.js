(() => {
  'use strict';

  const VERSION = 'zombies-004';
  const keyMap = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd'
  };
  const held = new Set();

  const $ = (id) => document.getElementById(id);

  function sendKey(code, down) {
    const already = held.has(code);
    if (down && already) return;
    if (!down && !already) return;
    if (down) held.add(code);
    else held.delete(code);
    const event = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key: keyMap[code],
      code,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
  }

  function releaseMovement() {
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach((code) => sendKey(code, false));
  }

  function installMovementFallback() {
    const zone = $('move-zone');
    const stick = $('move-stick');
    const nub = stick ? stick.querySelector('.nub') : null;
    if (!zone || !stick || !nub) return;

    let pointerId = null;
    let baseX = 0;
    let baseY = 0;

    function positionStick(x, y) {
      const size = stick.offsetWidth || 140;
      const minX = size / 2 + 10;
      const maxX = Math.max(minX, window.innerWidth * 0.50 - size / 2 - 10);
      const minY = size / 2 + 10;
      const maxY = Math.max(minY, window.innerHeight - size / 2 - 10);
      baseX = Math.max(minX, Math.min(maxX, x));
      baseY = Math.max(minY, Math.min(maxY, y));
      stick.style.left = `${baseX - size / 2}px`;
      stick.style.top = `${baseY - size / 2}px`;
      stick.style.bottom = 'auto';
      stick.classList.add('active');
    }

    function update(x, y) {
      const max = (stick.offsetWidth || 140) * 0.35;
      let dx = x - baseX;
      let dy = y - baseY;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = dx / len * max;
        dy = dy / len * max;
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = max * 0.18;
      sendKey('KeyW', dy < -dead);
      sendKey('KeyS', dy > dead);
      sendKey('KeyA', dx < -dead);
      sendKey('KeyD', dx > dead);
    }

    zone.addEventListener('pointerdown', (event) => {
      if (pointerId !== null) return;
      event.preventDefault();
      pointerId = event.pointerId;
      zone.setPointerCapture?.(event.pointerId);
      positionStick(event.clientX, event.clientY);
      update(event.clientX, event.clientY);
    }, { passive: false });

    zone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      update(event.clientX, event.clientY);
    }, { passive: false });

    const end = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      nub.style.transform = 'translate(0px, 0px)';
      stick.classList.remove('active');
      releaseMovement();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    window.addEventListener('blur', releaseMovement);
  }

  function makeMat(scene, name, color, emissive = color, alpha = 1) {
    const mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(color);
    mat.emissiveColor = BABYLON.Color3.FromHexString(emissive).scale(0.35);
    mat.specularColor = BABYLON.Color3.Black();
    mat.alpha = alpha;
    return mat;
  }

  function makeTextPlane(scene, name, text, x, y, z, yaw, width = 5.5, height = 2.2) {
    const texture = new BABYLON.DynamicTexture(`${name} texture`, { width: 512, height: 256 }, scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = 'rgba(4, 8, 10, 0.92)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = 'rgba(255, 206, 120, 0.9)';
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, 480, 224);
    ctx.fillStyle = 'rgba(255, 230, 185, 0.94)';
    ctx.font = 'bold 44px system-ui, sans-serif';
    const lines = text.split('\n');
    lines.forEach((line, index) => ctx.fillText(line, 38, 86 + index * 58));
    texture.update();

    const mat = new BABYLON.StandardMaterial(`${name} material`, scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.specularColor = BABYLON.Color3.Black();
    const plane = BABYLON.MeshBuilder.CreatePlane(name, { width, height }, scene);
    plane.position.set(x, y, z);
    plane.rotation.y = yaw;
    plane.material = mat;
    plane.isPickable = false;
    return plane;
  }

  function addZombiesModeDressing(scene) {
    if (!window.BABYLON || !scene || scene.metadata?.zombies004) return;
    scene.metadata = scene.metadata || {};
    scene.metadata.zombies004 = true;

    scene.meshes.forEach((mesh) => {
      if (/drone|cargo drone/i.test(mesh.name)) mesh.setEnabled(false);
    });
    scene.transformNodes.forEach((node) => {
      if (/cargo drone/i.test(node.name)) node.setEnabled(false);
    });

    const wood = makeMat(scene, 'barricade wood', '#6b4129', '#1b0c04');
    const chalk = makeMat(scene, 'chalk glow', '#f5d28a', '#f5d28a');
    const perkBlue = makeMat(scene, 'blue machine', '#314f75', '#1a3758');
    const perkRed = makeMat(scene, 'red machine', '#723535', '#431818');
    const boxMat = makeMat(scene, 'supply box', '#3e3321', '#1d1509');
    const glow = makeMat(scene, 'supply glow', '#ffd166', '#ff8c2a', 0.72);

    function plank(x, y, z, yaw, tilt = 0) {
      const mesh = BABYLON.MeshBuilder.CreateBox('boarded barrier plank', { width: 5.6, height: 0.24, depth: 0.32 }, scene);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.rotation.z = tilt;
      mesh.material = wood;
      mesh.isPickable = false;
      return mesh;
    }

    function barrier(x, z, yaw) {
      plank(x, 2.2, z, yaw, 0.12);
      plank(x, 3.05, z, yaw, -0.1);
      plank(x, 3.9, z, yaw, 0.04);
    }

    barrier(-48, -23.75, 0);
    barrier(-42, -23.75, 0);
    barrier(43, -18.8, 0);
    barrier(-44, 22.65, Math.PI);
    barrier(-15, 35.3, Math.PI);
    barrier(63.3, 18, -Math.PI / 2);

    makeTextPlane(scene, 'wall buy notice 1', 'WALL BUY\nCARBINE 750', -32.5, 3.6, -23.65, 0, 6.2, 2.4);
    makeTextPlane(scene, 'wall buy notice 2', 'OPEN GATE\n1250', 12, 3.2, -64.2, 0, 5.2, 2.2);
    makeTextPlane(scene, 'power notice', 'POWER\nOFFLINE', -58.4, 4.5, 5, Math.PI / 2, 4.6, 2.2);

    const switchBox = BABYLON.MeshBuilder.CreateBox('power switch box', { width: 1.2, height: 2.4, depth: 0.55 }, scene);
    switchBox.position.set(-57.7, 2.1, 9.5);
    switchBox.rotation.y = Math.PI / 2;
    switchBox.material = chalk;
    switchBox.isPickable = false;

    const machine1 = BABYLON.MeshBuilder.CreateBox('perk machine speed', { width: 2.5, height: 4.5, depth: 1.6 }, scene);
    machine1.position.set(28, 2.25, 22);
    machine1.material = perkBlue;
    machine1.isPickable = false;
    makeTextPlane(scene, 'perk label speed', 'STAMINA\n2000', 28, 4.3, 21.15, 0, 2.2, 1.15);

    const machine2 = BABYLON.MeshBuilder.CreateBox('perk machine revive', { width: 2.5, height: 4.5, depth: 1.6 }, scene);
    machine2.position.set(-9, 2.25, 34.9);
    machine2.material = perkRed;
    machine2.isPickable = false;
    makeTextPlane(scene, 'perk label revive', 'MEDIC\n1500', -9, 4.3, 34.05, 0, 2.2, 1.15);

    const supply = BABYLON.MeshBuilder.CreateBox('mystery supply box', { width: 4.6, height: 2.1, depth: 2.4 }, scene);
    supply.position.set(3, 1.05, 16);
    supply.rotation.y = 0.25;
    supply.material = boxMat;
    supply.isPickable = false;
    const ring = BABYLON.MeshBuilder.CreateTorus('supply box glow ring', { diameter: 5.8, thickness: 0.08, tessellation: 36 }, scene);
    ring.position.set(3, 2.55, 16);
    ring.rotation.x = Math.PI / 2;
    ring.material = glow;
    ring.isPickable = false;

    const light = new BABYLON.PointLight('supply box amber light', new BABYLON.Vector3(3, 3.2, 16), scene);
    light.diffuse = BABYLON.Color3.FromHexString('#ffd166');
    light.intensity = 0.55;
    light.range = 18;

    scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() * 0.001;
      ring.rotation.z = t * 0.7;
      ring.position.y = 2.55 + Math.sin(t * 2.2) * 0.08;
      light.intensity = 0.42 + Math.sin(t * 3) * 0.16;
    });
  }

  function waitForScene() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const engine = BABYLON?.Engine?.Instances?.[0];
      const scene = engine?.scenes?.[0];
      if (scene) {
        window.clearInterval(timer);
        addZombiesModeDressing(scene);
      }
      if (attempts > 80) window.clearInterval(timer);
    }, 150);
  }

  document.addEventListener('DOMContentLoaded', () => {
    installMovementFallback();
    const scoreLabel = document.querySelector('.hud-row.top .stat-card:nth-child(2) span');
    if (scoreLabel) scoreLabel.textContent = 'Points';
    const note = document.createElement('div');
    note.id = 'zombies-mode-note';
    note.textContent = 'Zombies mode pass: barriers, wall buys, power props, supply box, points HUD. Movement uses left touch zone fallback.';
    note.className = 'hidden';
    document.body.appendChild(note);
    const startButton = $('start-button');
    if (startButton) startButton.addEventListener('click', () => {
      note.classList.remove('hidden');
      waitForScene();
    });
  });
})();
