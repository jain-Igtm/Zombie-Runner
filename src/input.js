import { clamp } from './utils.js';

export class MobileInput {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.active = false;
    this.reloadRequested = false;
    this.sprinting = false;
    this.activeMovePointer = null;
    this.activeLookPointer = null;
    this.lookSensitivity = 0.0044;

    this.stick = document.getElementById('move-stick');
    this.nub = this.stick.querySelector('.nub');
    this.lookZone = document.getElementById('look-zone');
    this.actionButton = document.getElementById('action-button');
    this.reloadButton = document.getElementById('reload-button');
    this.sprintButton = document.getElementById('sprint-button');

    this.bindTouchControls();
    this.bindKeyboardFallback();
  }

  bindTouchControls() {
    this.stick.addEventListener('pointerdown', (event) => this.startMove(event));
    window.addEventListener('pointermove', (event) => this.movePointer(event), { passive: false });
    window.addEventListener('pointerup', (event) => this.endPointer(event));
    window.addEventListener('pointercancel', (event) => this.endPointer(event));
    this.lookZone.addEventListener('pointerdown', (event) => this.startLook(event));

    this.actionButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.active = true;
      this.actionButton.setPointerCapture?.(event.pointerId);
    });
    this.actionButton.addEventListener('pointerup', () => { this.active = false; });
    this.actionButton.addEventListener('pointercancel', () => { this.active = false; });
    this.actionButton.addEventListener('pointerleave', () => { this.active = false; });

    this.reloadButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.reloadRequested = true;
    });

    this.sprintButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.sprinting = true;
    });
    this.sprintButton.addEventListener('pointerup', () => { this.sprinting = false; });
    this.sprintButton.addEventListener('pointercancel', () => { this.sprinting = false; });
    this.sprintButton.addEventListener('pointerleave', () => { this.sprinting = false; });
  }

  bindKeyboardFallback() {
    const keys = new Set();
    window.addEventListener('keydown', (event) => {
      keys.add(event.code);
      if (event.code === 'Space') this.active = true;
      if (event.code === 'KeyR') this.reloadRequested = true;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.sprinting = true;
      this.updateKeyboardMove(keys);
    });
    window.addEventListener('keyup', (event) => {
      keys.delete(event.code);
      if (event.code === 'Space') this.active = false;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.sprinting = false;
      this.updateKeyboardMove(keys);
    });
  }

  updateKeyboardMove(keys) {
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('KeyW') ? -1 : 0) + (keys.has('KeyS') ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y) || 1;
      this.move.x = x / len;
      this.move.y = y / len;
    } else if (this.activeMovePointer === null) {
      this.move.x = 0;
      this.move.y = 0;
    }
  }

  startMove(event) {
    event.preventDefault();
    this.activeMovePointer = event.pointerId;
    this.stick.setPointerCapture?.(event.pointerId);
    this.updateStick(event.clientX, event.clientY);
  }

  startLook(event) {
    event.preventDefault();
    this.activeLookPointer = event.pointerId;
    this.lookZone.setPointerCapture?.(event.pointerId);
    this.lastLookX = event.clientX;
    this.lastLookY = event.clientY;
  }

  movePointer(event) {
    if (event.pointerId === this.activeMovePointer) {
      event.preventDefault();
      this.updateStick(event.clientX, event.clientY);
    }
    if (event.pointerId === this.activeLookPointer) {
      event.preventDefault();
      const dx = event.clientX - this.lastLookX;
      const dy = event.clientY - this.lastLookY;
      this.look.x += dx * this.lookSensitivity;
      this.look.y += dy * this.lookSensitivity;
      this.lastLookX = event.clientX;
      this.lastLookY = event.clientY;
    }
  }

  endPointer(event) {
    if (event.pointerId === this.activeMovePointer) {
      this.activeMovePointer = null;
      this.move.x = 0;
      this.move.y = 0;
      this.nub.style.transform = 'translate(0px, 0px)';
    }
    if (event.pointerId === this.activeLookPointer) this.activeLookPointer = null;
  }

  updateStick(clientX, clientY) {
    const rect = this.stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.33;
    const dx = clamp(clientX - cx, -max, max);
    const dy = clamp(clientY - cy, -max, max);
    const len = Math.hypot(dx, dy);
    const scale = len > max ? max / len : 1;
    const sx = dx * scale;
    const sy = dy * scale;
    this.nub.style.transform = `translate(${sx}px, ${sy}px)`;
    this.move.x = clamp(sx / max, -1, 1);
    this.move.y = clamp(sy / max, -1, 1);
  }

  consumeLook() {
    const look = { ...this.look };
    this.look.x = 0;
    this.look.y = 0;
    return look;
  }

  consumeReload() {
    const requested = this.reloadRequested;
    this.reloadRequested = false;
    return requested;
  }
}
