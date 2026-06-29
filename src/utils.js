export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const rand = (min, max) => min + Math.random() * (max - min);
export function circleIntersectsRect(cx, cz, radius, rect) {
  const closestX = clamp(cx, rect.x - rect.w / 2, rect.x + rect.w / 2);
  const closestZ = clamp(cz, rect.z - rect.d / 2, rect.z + rect.d / 2);
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz < radius * radius;
}
export const formatEnergy = (current, reserve) => `${current} / ${reserve}`;
