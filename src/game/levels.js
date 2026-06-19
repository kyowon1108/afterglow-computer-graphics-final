export const LEVELS = [
  {
    id: 1,
    name: "First Light",
    width: 8,
    height: 4,
    start: { x: 1, z: 1 },
    exit: { x: 6, z: 1 },
    interiorWalls: [],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 4, z: 1 } }],
    bouncePanels: [],
    gates: [],
    cameraStart: "top",
    objective: "블록을 소켓에 놓아 출구까지 길을 켜라.",
    expectedSolution: ["(2,1)에서 b1 픽업", "(4,1) 소켓에 배치", "(5,1) 점등 → 출구(6,1) 도달"],
    validateAsserts: [
      { mode: "GI", afterPlace: [], cell: { x: 5, z: 1 }, expected: false },
      { mode: "GI", afterPlace: [["b1", "s1"]], cell: { x: 5, z: 1 }, expected: true }
    ]
  },
  {
    id: 2,
    name: "Around the Corner",
    width: 7,
    height: 6,
    start: { x: 1, z: 1 },
    exit: { x: 1, z: 4 },
    interiorWalls: [
      { x: 1, z: 2 },
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 }
    ],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 5, z: 1 } }],
    bouncePanels: [{ id: "w1", cells: [{ x: 1, z: 5 }, { x: 2, z: 5 }, { x: 3, z: 5 }, { x: 4, z: 5 }], normal: "-z", albedo: 0xf2f0e6 }],
    gates: [],
    cameraStart: "top",
    objective: "정면은 막혔다. 빛을 벽에 튕겨 코너 뒤를 켜라.",
    expectedSolution: ["b1 픽업", "(5,1) 배치", "연결통로(5,2) 하강", "W가 (2,4) 등 entry 타일로 bounce → 출구(1,4)"],
    validateAsserts: [
      { mode: "DIRECT_ONLY", afterPlace: [["b1", "s1"]], cell: { x: 2, z: 4 }, expected: false },
      { mode: "GI", afterPlace: [["b1", "s1"]], cell: { x: 2, z: 4 }, expected: true }
    ]
  },
  {
    id: 3,
    name: "Long Throw",
    width: 11,
    height: 5,
    start: { x: 1, z: 1 },
    exit: { x: 10, z: 3 },
    interiorWalls: [],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 4, z: 1 } }],
    bouncePanels: [
      { id: "w1", cells: [{ x: 9, z: 2 }], normal: "-z", albedo: 0xf2f0e6 },
      { id: "w2", cells: [{ x: 8, z: 2 }], normal: "-x", albedo: 0xf2f0e6 }
    ],
    gates: [],
    cameraStart: "top",
    objective: "멀다. 한 번이 아니라 두 번 튕겨야 닿는다.",
    expectedSolution: ["b1 (4,1) 배치", "W1→W2 2차 bounce로 (9,3) 점등", "출구(10,3) 도달"],
    validateAsserts: [
      { mode: "BOUNCE1", afterPlace: [["b1", "s1"]], cell: { x: 9, z: 3 }, expected: false },
      { mode: "GI", afterPlace: [["b1", "s1"]], cell: { x: 9, z: 3 }, expected: true }
    ]
  },
  {
    id: 4,
    name: "Meet in the Middle",
    width: 9,
    height: 6,
    start: { x: 1, z: 3 },
    exit: { x: 7, z: 3 },
    interiorWalls: [],
    blocks: [
      { id: "b1", spawnCell: { x: 2, z: 3 }, colorKey: "white", state: "pickup", on: true },
      { id: "b2", spawnCell: { x: 3, z: 3 }, colorKey: "white", state: "pickup", on: true }
    ],
    sockets: [{ id: "s1", cell: { x: 3, z: 1 } }, { id: "s2", cell: { x: 5, z: 1 } }],
    bouncePanels: [],
    gates: [],
    cameraStart: "top",
    objective: "한 빛으로는 부족하다. 두 빛을 겹쳐라.",
    expectedSolution: ["b1→s1, b2→s2 배치", "(4,3)가 가산으로 점등 → 출구"],
    validateAsserts: [
      { mode: "GI", afterPlace: [["b1", "s1"]], cell: { x: 4, z: 3 }, expected: false },
      { mode: "GI", afterPlace: [["b1", "s1"], ["b2", "s2"]], cell: { x: 4, z: 3 }, expected: true }
    ]
  },
  {
    id: 5,
    name: "Afterglow",
    width: 11,
    height: 5,
    start: { x: 1, z: 1 },
    exit: { x: 10, z: 4 },
    interiorWalls: [],
    blocks: [
      { id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", state: "pickup", on: true },
      { id: "b2", spawnCell: { x: 3, z: 1 }, colorKey: "green", state: "pickup", on: true }
    ],
    sockets: [{ id: "s1", cell: { x: 4, z: 1 } }, { id: "s2", cell: { x: 9, z: 2 } }],
    bouncePanels: [{ id: "w1", cells: [{ x: 5, z: 3 }], normal: "+z", albedo: 0xf2f0e6 }],
    gates: [{ cell: { x: 9, z: 3 }, gateColor: "green", icon: "square" }],
    cameraStart: "chase",
    objective: "마지막 문은 초록 빛이 필요하다.",
    expectedSolution: ["b1(white) s1 배치로 본 경로 점등", "b2(green) s2 배치", "g(9,3) hueMatch → open → 출구(10,4)"],
    validateAsserts: [
      { mode: "GI", afterPlace: [["b1", "s1"]], cell: { x: 9, z: 3 }, expected: false },
      { mode: "GI", afterPlace: [["b1", "s1"], ["b2", "s2"]], cell: { x: 9, z: 3 }, expected: true }
    ]
  }
];
