export const CONFIG = {
  world: {
    halfSize: 78,
    playerRadius: 1.05,
    playerHeight: 2.15,
    fogNear: 22,
    fogFar: 116
  },
  player: {
    walkSpeed: 10.2,
    sprintSpeed: 15.4,
    maxHealth: 100,
    regenDelay: 5.5,
    regenRate: 4
  },
  tool: {
    name: 'RUNNER CARBINE',
    magazineSize: 30,
    reserve: 90,
    power: 38,
    precisionPower: 85,
    range: 96,
    actionDelay: 0.115,
    reloadTime: 1.25,
    spread: 0.012,
    kick: 0.022
  },
  enemy: {
    baseHealth: 74,
    healthPerRound: 13,
    baseSpeed: 3.1,
    speedPerRound: 0.12,
    contactRange: 1.65,
    contactCost: 14,
    contactDelay: 0.78,
    spawnGrace: 1.35
  },
  rounds: {
    baseCount: 6,
    perRound: 4,
    spawnInterval: 0.72,
    betweenRounds: 4.2,
    maxActiveBase: 7,
    maxActiveScale: 2
  }
};
