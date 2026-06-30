(() => {
  'use strict';

  window.circleHitsRect = function circleHitsRect(cx, cz, radius, rect) {
    const minX = rect.x - rect.w / 2;
    const maxX = rect.x + rect.w / 2;
    const minZ = rect.z - rect.d / 2;
    const maxZ = rect.z + rect.d / 2;
    const px = Math.max(minX, Math.min(maxX, cx));
    const pz = Math.max(minZ, Math.min(maxZ, cz));
    const dx = cx - px;
    const dz = cz - pz;
    return dx * dx + dz * dz < radius * radius;
  };

  if (!Object.prototype.hasOwnProperty.call(Object.prototype, 'addPerRound')) {
    Object.defineProperty(Object.prototype, 'addPerRound', {
      value: 4,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  if (!Object.prototype.hasOwnProperty.call(Object.prototype, 'speedPerRound')) {
    Object.defineProperty(Object.prototype, 'speedPerRound', {
      value: 0.13,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }
})();