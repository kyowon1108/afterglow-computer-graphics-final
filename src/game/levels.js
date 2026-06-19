export const LEVELS = [
  {
    id: 1,
    name: "첫 빛: 방향 맞추기",
    width: 9,
    height: 4,
    start: { x: 1, z: 1 },
    exit: { x: 6, z: 1 },
    interiorWalls: [],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", colorLocked: true, kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 3, z: 1 } }],
    bouncePanels: [],
    mirrors: [],
    gates: [],
    cameraStart: "fp",
    objective: "방향을 맞춰 직선 다리를 켜라.",
    intendedSolutionClass: {
      requireAllBlocksPlaced: true,
      placements: [{ blockId: "b1", socketId: "s1" }],
      blockDirs: [{ blockId: "b1", emitDir: 90 }]
    },
    solutionActions: [{ type: "place", blockId: "b1", socketId: "s1", emitDir: 90 }],
    expectedSolution: ["b1 픽업", "동쪽을 보고 s1에 배치", "켜진 길을 따라 출구 도달"],
    validateAsserts: [
      { label: "wrong aim misses bridge", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 0]], cell: { x: 5, z: 1 }, expected: false },
      { label: "east aim lights bridge", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], cell: { x: 5, z: 1 }, expected: true }
    ]
  },
  {
    id: 2,
    name: "모퉁이 돌리기",
    width: 8,
    height: 7,
    start: { x: 1, z: 2 },
    exit: { x: 5, z: 4 },
    interiorWalls: [],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 2 }, colorKey: "white", colorLocked: true, kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 2, z: 2 } }],
    bouncePanels: [],
    mirrors: [{ id: "m1", cell: { x: 4, z: 1 }, normalYaw: 270, rotatable: true }],
    gates: [],
    cameraStart: "fp",
    objective: "미러를 남쪽으로 돌려 코너 뒤 길을 켜라.",
    intendedSolutionClass: {
      requireAllBlocksPlaced: true,
      placements: [{ blockId: "b1", socketId: "s1" }],
      blockDirs: [{ blockId: "b1", emitDir: 90 }],
      mirrorAngles: [{ mirrorId: "m1", normalYaw: 0 }]
    },
    solutionActions: [
      { type: "place", blockId: "b1", socketId: "s1", emitDir: 90 },
      { type: "rotateMirror", mirrorId: "m1", normalYaw: 0 }
    ],
    expectedSolution: ["b1을 s1에 동쪽으로 배치", "m1을 남쪽으로 회전", "코너를 돌아 출구 접근"],
    validateAsserts: [
      { label: "wrong mirror angle leaves corner void", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 270]], cell: { x: 5, z: 3 }, expected: false },
      { label: "south mirror lights corner", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 0]], cell: { x: 5, z: 3 }, expected: true }
    ]
  },
  {
    id: 3,
    name: "두 거울로 잇기",
    width: 10,
    height: 7,
    start: { x: 1, z: 2 },
    exit: { x: 6, z: 4 },
    interiorWalls: [{ x: 2, z: 3 }, { x: 3, z: 3 }],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 2 }, colorKey: "white", colorLocked: true, kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 2, z: 2 } }],
    bouncePanels: [],
    mirrors: [
      { id: "m1", cell: { x: 4, z: 1 }, normalYaw: 270, rotatable: true },
      { id: "m2", cell: { x: 6, z: 1 }, normalYaw: 270, rotatable: true }
    ],
    gates: [],
    cameraStart: "fp",
    objective: "두 미러를 연쇄로 맞춰 먼 방 입구를 켜라.",
    intendedSolutionClass: {
      requireAllBlocksPlaced: true,
      placements: [{ blockId: "b1", socketId: "s1" }],
      blockDirs: [{ blockId: "b1", emitDir: 90 }],
      mirrorAngles: [
        { mirrorId: "m1", normalYaw: 90 },
        { mirrorId: "m2", normalYaw: 315 }
      ]
    },
    solutionActions: [
      { type: "place", blockId: "b1", socketId: "s1", emitDir: 90 },
      { type: "rotateMirror", mirrorId: "m1", normalYaw: 90 },
      { type: "rotateMirror", mirrorId: "m2", normalYaw: 315 }
    ],
    expectedSolution: ["b1을 s1에 동쪽으로 배치", "m1을 동쪽으로 회전", "m2를 남서쪽으로 회전", "두 반사를 지나 출구 도달"],
    validateAsserts: [
      { label: "m1 wrong starves second mirror", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 0], ["m2", 315]], cell: { x: 6, z: 3 }, expected: false },
      { label: "m2 wrong blocks far entry", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 90], ["m2", 270]], cell: { x: 6, z: 3 }, expected: false },
      { label: "both mirrors route far entry", mode: "GI", afterPlace: [["b1", "s1"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 90], ["m2", 315]], cell: { x: 6, z: 3 }, expected: true }
    ]
  },
  {
    id: 4,
    name: "흰빛에서 노랑으로",
    width: 10,
    height: 5,
    start: { x: 1, z: 2 },
    exit: { x: 5, z: 2 },
    interiorWalls: [],
    blocks: [{ id: "p1", spawnCell: { x: 2, z: 2 }, colorKey: "white", kind: "prism", emitDir: 90, coneDeg: 90, state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 2, z: 3 } }],
    bouncePanels: [],
    mirrors: [],
    gates: [{ cell: { x: 4, z: 2 }, gateColor: "yellow", icon: "plus" }],
    cameraStart: "fp",
    objective: "프리즘을 동쪽으로 맞춰 노란 게이트에 빨강+초록을 겹쳐라.",
    intendedSolutionClass: {
      requireAllBlocksPlaced: true,
      placements: [{ blockId: "p1", socketId: "s1" }],
      blockDirs: [{ blockId: "p1", emitDir: 90 }],
      blockColors: [{ blockId: "p1", colorKey: "white" }]
    },
    solutionActions: [
      { type: "place", blockId: "p1", socketId: "s1", emitDir: 90 },
      { type: "color", blockId: "p1", colorKey: "white" }
    ],
    expectedSolution: ["p1을 s1에 동쪽으로 배치", "white split의 빨강+초록이 노란 게이트를 개방", "출구 도달"],
    validateAsserts: [
      { label: "wrong prism aim misses yellow mix", mode: "GI", afterPlace: [["p1", "s1"]], blockColors: [["p1", "white"]], blockDirs: [["p1", 0]], cell: { x: 4, z: 2 }, expected: false },
      { label: "red-only prism does not open yellow", mode: "GI", afterPlace: [["p1", "s1"]], blockColors: [["p1", "red"]], blockDirs: [["p1", 90]], cell: { x: 4, z: 2 }, expected: false },
      { label: "white split opens yellow", mode: "GI", afterPlace: [["p1", "s1"]], blockColors: [["p1", "white"]], blockDirs: [["p1", 90]], cell: { x: 4, z: 2 }, expected: true }
    ]
  },
  {
    id: 5,
    name: "잔광, 마젠타",
    width: 11,
    height: 7,
    start: { x: 1, z: 3 },
    exit: { x: 6, z: 4 },
    interiorWalls: [{ x: 6, z: 3 }, { x: 6, z: 5 }],
    blocks: [
      { id: "b1", spawnCell: { x: 2, z: 3 }, colorKey: "red", colorLocked: true, kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true },
      { id: "b2", spawnCell: { x: 2, z: 4 }, colorKey: "blue", colorLocked: true, kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }
    ],
    sockets: [
      { id: "s1", cell: { x: 2, z: 3 }, allowedBlockIds: ["b1"] },
      { id: "s2", cell: { x: 2, z: 5 }, allowedBlockIds: ["b2"] }
    ],
    bouncePanels: [],
    mirrors: [{ id: "m1", cell: { x: 5, z: 5 }, normalYaw: 270, rotatable: true }],
    gates: [{ cell: { x: 5, z: 4 }, gateColor: "magenta", icon: "diamondFilled" }],
    cameraStart: "fp",
    objective: "빨강 직진과 파랑 미러 반사를 겹쳐 마젠타 게이트를 열어라.",
    intendedSolutionClass: {
      requireAllBlocksPlaced: true,
      placements: [
        { blockId: "b1", socketId: "s1" },
        { blockId: "b2", socketId: "s2" }
      ],
      blockDirSets: [
        { blockId: "b1", allowedEmitDirs: [45, 90] },
        { blockId: "b2", allowedEmitDirs: [90, 135] }
      ],
      blockColors: [
        { blockId: "b1", colorKey: "red" },
        { blockId: "b2", colorKey: "blue" }
      ],
      mirrorAngles: [{ mirrorId: "m1", normalYaw: 225 }]
    },
    solutionActions: [
      { type: "place", blockId: "b1", socketId: "s1", emitDir: 90 },
      { type: "place", blockId: "b2", socketId: "s2", emitDir: 90 },
      { type: "rotateMirror", mirrorId: "m1", normalYaw: 225 }
    ],
    expectedSolution: ["b1을 s1에 동쪽으로 배치", "b2를 s2에 동쪽으로 배치", "m1을 북서쪽으로 회전", "마젠타 게이트 개방 후 출구 도달"],
    validateAsserts: [
      { label: "red-only cannot open magenta", mode: "GI", afterPlace: [["b1", "s1"]], blockColors: [["b1", "red"]], blockDirs: [["b1", 90]], mirrorAngles: [["m1", 225]], cell: { x: 5, z: 4 }, expected: false },
      { label: "wrong mirror misses blue component", mode: "GI", afterPlace: [["b1", "s1"], ["b2", "s2"]], blockColors: [["b1", "red"], ["b2", "blue"]], blockDirs: [["b1", 90], ["b2", 90]], mirrorAngles: [["m1", 270]], cell: { x: 5, z: 4 }, expected: false },
      { label: "magenta mix opens final gate", mode: "GI", afterPlace: [["b1", "s1"], ["b2", "s2"]], blockColors: [["b1", "red"], ["b2", "blue"]], blockDirs: [["b1", 90], ["b2", 90]], mirrorAngles: [["m1", 225]], cell: { x: 5, z: 4 }, expected: true }
    ]
  }
];
