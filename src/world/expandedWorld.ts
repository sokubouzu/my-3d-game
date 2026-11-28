import * as THREE from 'three';
import { CITY_METRICS, type CollisionWorld } from './collisionWorld';
import { createRadialGlowTexture } from './streetLights';
import { createRealisticLawnPbr } from './vegetationSystem';

export interface ExpandedWorldHandle {
  group: THREE.Group;
  grassMaterial: THREE.MeshStandardMaterial;
  setNightFactor: (factor: number) => void;
  setProceduralBenchesVisible: (visible: boolean) => void;
  dispose: () => void;
}

export interface BenchPlacement {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

const PARK_CX = (CITY_METRICS.parkBounds.minX + CITY_METRICS.parkBounds.maxX) * 0.5;
const PARK_CZ = (CITY_METRICS.parkBounds.minZ + CITY_METRICS.parkBounds.maxZ) * 0.5;

/** 公園10脚 ＋ 駅前広場4脚 = 計14脚のベンチ配置座標（PHASE 5-G2 GLB差し替えと共有） */
export const EXPANDED_BENCH_PLACEMENTS: readonly BenchPlacement[] = [
  // 公園中央広場まわり4脚
  { id: 'bench_park_c1', x: PARK_CX - 6.8, z: PARK_CZ - 3.6, yaw: Math.PI * 0.35 },
  { id: 'bench_park_c2', x: PARK_CX + 6.8, z: PARK_CZ - 3.6, yaw: -Math.PI * 0.35 },
  { id: 'bench_park_c3', x: PARK_CX - 6.8, z: PARK_CZ + 3.6, yaw: Math.PI * 0.65 },
  { id: 'bench_park_c4', x: PARK_CX + 6.8, z: PARK_CZ + 3.6, yaw: -Math.PI * 0.65 },
  // 公園遊歩道沿い6脚
  { id: 'bench_park_w1', x: 30, z: PARK_CZ - 3.4, yaw: 0 },
  { id: 'bench_park_w2', x: 38, z: PARK_CZ + 3.4, yaw: Math.PI },
  { id: 'bench_park_e1', x: 72, z: PARK_CZ - 3.4, yaw: 0 },
  { id: 'bench_park_e2', x: 80, z: PARK_CZ + 3.4, yaw: Math.PI },
  { id: 'bench_park_n1', x: 40, z: CITY_METRICS.parkBounds.minZ + 3.4, yaw: 0 },
  { id: 'bench_park_s1', x: 70, z: CITY_METRICS.parkBounds.maxZ - 3.4, yaw: Math.PI },
  // 駅前ロータリー広場4脚（西側は駅キャノピー沿いへ整列、東側はバスシェルター下へ収容）
  { id: 'bench_plaza_w1', x: -27.2, z: 97.5, yaw: Math.PI / 2 },
  { id: 'bench_plaza_w2', x: -27.2, z: 110.5, yaw: Math.PI / 2 },
  { id: 'bench_plaza_e1', x: 26.2, z: 95.5, yaw: -Math.PI / 2 },
  { id: 'bench_plaza_e2', x: 26.2, z: 112.5, yaw: -Math.PI / 2 },
];

interface FenceSegmentSpec {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const WHITE_EMISSIVE = new THREE.Color(0xffffff);
const WARM_LAMP_EMISSIVE = new THREE.Color(0xffe0a6);
const FOUNTAIN_GLOW_EMISSIVE = new THREE.Color(0x38bdf8);
const STATION_GLASS_EMISSIVE = new THREE.Color(0xffdfa8);
const UNLIT_EMISSIVE = new THREE.Color(0x000000);

/**
 * PHASE 4-A: 街区拡張エリア（外周道路ループ・都市公園・駅前ロータリー広場）を構築する。
 * - 拡張した道路・公園・広場の地面高さはすべて Y = 0 に統一。
 * - 共有 PBR マテリアル（asphaltMaterial / pavementMaterial）を再利用し、
 *   Poly Haven 1K ホットスワップ時にも自動で全エリアが高精細化される。
 * - 反復パーツ（ベンチ・公園柵・ボラード・公園灯）は InstancedMesh でドローコールを最小化。
 */
export function buildExpandedWorld(
  scene: THREE.Scene,
  collisionWorld: CollisionWorld,
  asphaltMaterial: THREE.MeshStandardMaterial,
  pavementMaterial: THREE.MeshStandardMaterial,
  maxAnisotropy: number,
): ExpandedWorldHandle {
  const root = new THREE.Group();
  root.name = 'ExpandedWorldRoot';
  scene.add(root);

  const aniso = Math.min(4, Math.max(1, maxAnisotropy));
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const colliderIds: string[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };
  const addCollider = (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => {
    collisionWorld.upsertCollider(
      id,
      cx,
      cz,
      width,
      depth,
      rotationY,
      minY,
      maxY,
    );
    colliderIds.push(id);
  };

  // =========================================================================
  // 1. 拡張エリア基礎地面 (360m x 360m, Y = -0.018 — 物理地面は Y = 0)
  // =========================================================================
  const worldSize = CITY_METRICS.cityHalfSize * 2; // 360m
  const outskirtsTex = trackTex(createOutskirtsGroundTexture(aniso));
  const outskirtsMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: outskirtsTex,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  const outskirtsGeo = trackGeo(new THREE.PlaneGeometry(worldSize, worldSize));
  const outskirtsMesh = new THREE.Mesh(outskirtsGeo, outskirtsMat);
  outskirtsMesh.rotation.x = -Math.PI / 2;
  outskirtsMesh.position.y = -0.018;
  outskirtsMesh.receiveShadow = true;
  root.add(outskirtsMesh);

  // =========================================================================
  // 2. 拡張幹線道路 (中央十字路 ±80m -> 外周道路 ±132m) & 外周道路ループ (Y = 0)
  // =========================================================================
  const innerHalf = CITY_METRICS.innerCityHalfSize; // 80
  const roadHalf = CITY_METRICS.roadHalfWidth; // 6
  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 132
  const cornerR = CITY_METRICS.outerRingCornerRadius; // 38
  const ringHalfW = CITY_METRICS.outerRingHalfWidth; // 7
  const innerSwW = CITY_METRICS.outerRingInnerSidewalkWidth; // 3.5
  const outerSwW = CITY_METRICS.outerRingOuterSidewalkWidth; // 4.0

  // 2-A. 4方向幹線道路の延長アスファルト (80..126m、外周道路内縁と隙間・重なりゼロで接続)
  const armStart = innerHalf; // 80
  const armEnd = ringSpan - ringHalfW; // 126 (外周道路内縁と完全一致させてZファイティング防止)
  const armLen = armEnd - armStart; // 46m
  const armCenter = armStart + armLen * 0.5; // 103m
  const roadWidth = roadHalf * 2; // 12m

  const addWorldAsphaltRect = (
    x: number,
    z: number,
    w: number,
    d: number,
    y = 0.006,
  ) => {
    const geo = trackGeo(createWorldUvRectGeometry(w, d, 1 / 160));
    const mesh = new THREE.Mesh(geo, asphaltMaterial);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
  };

  // 北・西・東延長（南はロータリー込みで接続）
  addWorldAsphaltRect(0, -armCenter, roadWidth, armLen, 0.006);
  addWorldAsphaltRect(-armCenter, 0, armLen, roadWidth, 0.006);
  addWorldAsphaltRect(armCenter, 0, armLen, roadWidth, 0.006);
  // 南延長（内側80 -> ロータリー北端85、ロータリー南端123 -> 外周内縁126、広場タイル 0.002 より上・ロータリー車道 0.011 より下）
  addWorldAsphaltRect(0, 82.5, roadWidth, 5.0, 0.006);
  addWorldAsphaltRect(0, 124.5, roadWidth, 3.0, 0.006);

  // 幹線延長の両脇歩道帯（北・西・東のみ、幅 3.5m）
  const addWorldPavementRect = (
    x: number,
    z: number,
    w: number,
    d: number,
    y = 0.002,
  ) => {
    const geo = trackGeo(createWorldUvRectGeometry(w, d, 1 / 74));
    const mesh = new THREE.Mesh(geo, pavementMaterial);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  const extSwLen = ringSpan - ringHalfW - innerSwW - innerHalf; // 41.5m
  const extSwCenter = innerHalf + extSwLen * 0.5;
  const extSwOffset = roadHalf + 1.75;
  // 北道路両脇
  addWorldPavementRect(-extSwOffset, -extSwCenter, 3.5, extSwLen);
  addWorldPavementRect(extSwOffset, -extSwCenter, 3.5, extSwLen);
  // 西道路両脇
  addWorldPavementRect(-extSwCenter, -extSwOffset, extSwLen, 3.5);
  addWorldPavementRect(-extSwCenter, extSwOffset, extSwLen, 3.5);
  // 東道路両脇
  addWorldPavementRect(extSwCenter, -extSwOffset, extSwLen, 3.5);
  addWorldPavementRect(extSwCenter, extSwOffset, extSwLen, 3.5);

  // 2-B. 外周道路ループ本体（直線188m × 4 ＋ 緩やかなR=38mコーナー × 4）
  const ringAsphaltGeo = trackGeo(
    createRoundedLoopStripGeometry(
      ringSpan,
      cornerR,
      -ringHalfW,
      ringHalfW,
      0.006,
      20,
      1 / 160,
    ),
  );
  const ringAsphaltMesh = new THREE.Mesh(ringAsphaltGeo, asphaltMaterial);
  ringAsphaltMesh.receiveShadow = true;
  root.add(ringAsphaltMesh);

  // 外周道路の内側・外側歩道帯（Y = 0.002、物理高さは Y = 0）
  const ringInnerSwGeo = trackGeo(
    createRoundedLoopStripGeometry(
      ringSpan,
      cornerR,
      -ringHalfW - innerSwW,
      -ringHalfW,
      0.002,
      20,
      1 / 74,
    ),
  );
  const ringInnerSwMesh = new THREE.Mesh(ringInnerSwGeo, pavementMaterial);
  ringInnerSwMesh.receiveShadow = true;
  root.add(ringInnerSwMesh);

  const ringOuterSwGeo = trackGeo(
    createRoundedLoopStripGeometry(
      ringSpan,
      cornerR,
      ringHalfW,
      ringHalfW + outerSwW,
      0.002,
      20,
      1 / 74,
    ),
  );
  const ringOuterSwMesh = new THREE.Mesh(ringOuterSwGeo, pavementMaterial);
  ringOuterSwMesh.receiveShadow = true;
  root.add(ringOuterSwMesh);

  // 2-C. 拡張道路・外周ループ・ロータリーの道路標示（白線・オレンジ中央線・破線・横断歩道）
  buildExpandedRoadMarkings(root, trackGeo, trackMat);

  // =========================================================================
  // 3. 都市公園エリア（さくら中央公園: x∈[14,96], z∈[-120,-84], Y = 0）
  // =========================================================================
  const parkB = CITY_METRICS.parkBounds;
  const parkW = parkB.maxX - parkB.minX; // 82
  const parkD = parkB.maxZ - parkB.minZ; // 36
  const parkCx = (parkB.minX + parkB.maxX) * 0.5; // 55
  const parkCz = (parkB.minZ + parkB.maxZ) * 0.5; // -102

  const lawnPbr = createRealisticLawnPbr(aniso, 16, 7);
  for (const t of lawnPbr.textures) trackTex(t);
  const grassMat = trackMat(lawnPbr.material);
  const parkPathTex = trackTex(createParkPathTexture(aniso, 12, 5));
  const parkPathMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: parkPathTex,
      roughness: 0.88,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  // 芝生広場ベース
  const parkLawnGeo = trackGeo(new THREE.PlaneGeometry(parkW, parkD));
  const parkLawn = new THREE.Mesh(parkLawnGeo, grassMat);
  parkLawn.rotation.x = -Math.PI / 2;
  parkLawn.position.set(parkCx, 0.007, parkCz);
  parkLawn.receiveShadow = true;
  root.add(parkLawn);

  // 公園内遊歩道（重なり・Zファイティングゼロの非重複セグメント構成、4方向ゲート・道路へシームレス接続）
  const addParkPathRect = (x: number, z: number, w: number, d: number, y = 0.014) => {
    const geo = trackGeo(createWorldUvRectGeometry(w, d, 1 / 6));
    const mesh = new THREE.Mesh(geo, parkPathMat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  const plazaR = 8.6;
  const mainW = 4.4;
  const loopW = 2.8;
  const loopN = parkB.minZ + 5.5; // -114.5
  const loopS = parkB.maxZ - 5.5; // -89.5
  const loopW_X = parkB.minX + 7.5; // 21.5
  const loopE_X = parkB.maxX - 7.5; // 88.5

  // 東西メイン遊歩道（中央円形広場手前で分割し、西は北幹線歩道 x=6.2、東は公園東口 x=98 まで接続）
  const ewWestEnd = parkCx - plazaR + 0.3; // 46.7
  addParkPathRect((6.2 + ewWestEnd) * 0.5, parkCz, ewWestEnd - 6.2, mainW);
  const ewEastStart = parkCx + plazaR - 0.3; // 63.3
  const ewEastEnd = parkB.maxX + 2.0; // 98.0
  addParkPathRect((ewEastStart + ewEastEnd) * 0.5, parkCz, ewEastEnd - ewEastStart, mainW);

  // 南北メイン遊歩道（北は外周道路内側歩道 z=-122.5、南は内側街区 z=-80.0 まで接続）
  const nsNorthStart = -(ringSpan - ringHalfW - innerSwW); // -122.5
  const nsNorthEnd = parkCz - plazaR + 0.3; // -110.3
  addParkPathRect(parkCx, (nsNorthStart + nsNorthEnd) * 0.5, mainW, nsNorthEnd - nsNorthStart);
  const nsSouthStart = parkCz + plazaR - 0.3; // -93.7
  const nsSouthEnd = -innerHalf; // -80.0
  addParkPathRect(parkCx, (nsSouthStart + nsSouthEnd) * 0.5, mainW, nsSouthEnd - nsSouthStart);

  // 公園内周遊パス（メイン遊歩道・四隅との重複ゼロで分割配置）
  const loopLeftStart = loopW_X + loopW * 0.5; // 22.9
  const loopLeftEnd = parkCx - mainW * 0.5; // 52.8
  const loopRightStart = parkCx + mainW * 0.5; // 57.2
  const loopRightEnd = loopE_X - loopW * 0.5; // 87.1
  addParkPathRect((loopLeftStart + loopLeftEnd) * 0.5, loopN, loopLeftEnd - loopLeftStart, loopW);
  addParkPathRect((loopRightStart + loopRightEnd) * 0.5, loopN, loopRightEnd - loopRightStart, loopW);
  addParkPathRect((loopLeftStart + loopLeftEnd) * 0.5, loopS, loopLeftEnd - loopLeftStart, loopW);
  addParkPathRect((loopRightStart + loopRightEnd) * 0.5, loopS, loopRightEnd - loopRightStart, loopW);

  const loopNorthTop = loopN - loopW * 0.5; // -115.9
  const loopNorthBot = parkCz - mainW * 0.5; // -104.2
  const loopSouthTop = parkCz + mainW * 0.5; // -99.8
  const loopSouthBot = loopS + loopW * 0.5; // -88.1
  addParkPathRect(loopW_X, (loopNorthTop + loopNorthBot) * 0.5, loopW, loopNorthBot - loopNorthTop);
  addParkPathRect(loopW_X, (loopSouthTop + loopSouthBot) * 0.5, loopW, loopSouthBot - loopSouthTop);
  addParkPathRect(loopE_X, (loopNorthTop + loopNorthBot) * 0.5, loopW, loopNorthBot - loopNorthTop);
  addParkPathRect(loopE_X, (loopSouthTop + loopSouthBot) * 0.5, loopW, loopSouthBot - loopSouthTop);

  // 中央円形広場 (radius = 8.6m, Y = 0.017 で接続部と明確に分離)
  const parkPlazaGeo = trackGeo(new THREE.CircleGeometry(plazaR, 32));
  const parkPlaza = new THREE.Mesh(parkPlazaGeo, parkPathMat);
  parkPlaza.rotation.x = -Math.PI / 2;
  parkPlaza.position.set(parkCx, 0.017, parkCz);
  parkPlaza.receiveShadow = true;
  root.add(parkPlaza);

  // 公園中央の多段石造噴水モニュメント
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9c6be,
      roughness: 0.78,
      metalness: 0.06,
    }),
  );
  const darkStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b8085,
      roughness: 0.82,
      metalness: 0.08,
    }),
  );
  const fountainWaterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2c7a96,
      emissive: UNLIT_EMISSIVE.clone(),
      emissiveIntensity: 0,
      roughness: 0.14,
      metalness: 0.25,
    }),
  );

  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(parkCx, 0, parkCz);
  const outerBasinRim = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.75, 2.9, 0.56, 20)),
    stoneMat,
  );
  outerBasinRim.position.y = 0.28;
  outerBasinRim.receiveShadow = true;
  fountainGroup.add(outerBasinRim);

  const waterSurface = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.42, 2.42, 0.08, 20)),
    fountainWaterMat,
  );
  waterSurface.position.y = 0.52;
  fountainGroup.add(waterSurface);

  const pedestal = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.45, 0.65, 1.45, 14)),
    stoneMat,
  );
  pedestal.position.y = 0.95;
  fountainGroup.add(pedestal);

  const midBowl = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.15, 0.42, 0.34, 16)),
    stoneMat,
  );
  midBowl.position.y = 1.65;
  fountainGroup.add(midBowl);

  const upperSpire = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.14, 0.3, 0.85, 12)),
    darkStoneMat,
  );
  upperSpire.position.y = 2.18;
  fountainGroup.add(upperSpire);

  const topOrb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.22, 12, 10)),
    stoneMat,
  );
  topOrb.position.y = 2.66;
  fountainGroup.add(topOrb);
  root.add(fountainGroup);

  addCollider('park_fountain', parkCx, parkCz, 5.4, 5.4, 0, 0, 2.8);

  // 公園外周柵（4方向に幅8mの広い歩行者ゲートを開放、InstancedMesh + OBB コライダー）
  const parkFences: FenceSegmentSpec[] = [
    // 北辺 (z = -120, 中央 x=51..59 ゲート開放)
    { id: 'park_fence_n1', x0: 14, z0: -120, x1: 51, z1: -120 },
    { id: 'park_fence_n2', x0: 59, z0: -120, x1: 96, z1: -120 },
    // 南辺 (z = -84, 中央 x=51..59 ゲート開放)
    { id: 'park_fence_s1', x0: 14, z0: -84, x1: 51, z1: -84 },
    { id: 'park_fence_s2', x0: 59, z0: -84, x1: 96, z1: -84 },
    // 西辺 (x = 14, 中央 z=-106..-98 ゲート開放)
    { id: 'park_fence_w1', x0: 14, z0: -120, x1: 14, z1: -106 },
    { id: 'park_fence_w2', x0: 14, z0: -98, x1: 14, z1: -84 },
    // 東辺 (x = 96, 中央 z=-106..-98 ゲート開放)
    { id: 'park_fence_e1', x0: 96, z0: -120, x1: 96, z1: -106 },
    { id: 'park_fence_e2', x0: 96, z0: -98, x1: 96, z1: -84 },
  ];
  buildInstancedParkFences(root, parkFences, trackGeo, trackMat, addCollider);

  // =========================================================================
  // 4. 駅前ロータリー風の広場エリア (中央駅南口ロータリー: center=(0, 104), Y = 0)
  // =========================================================================
  const rotC = CITY_METRICS.rotaryCenter; // (0, 104)
  const rotInR = CITY_METRICS.rotaryIslandRadius; // 10.5
  const rotOutR = CITY_METRICS.rotaryOuterRoadRadius; // 20.5
  const plazaB = CITY_METRICS.plazaBounds; // x: [-44, 44], z: [82, 122]

  const plazaTileTex = trackTex(createPlazaTileTexture(aniso, 18, 9));
  const plazaTileMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: plazaTileTex,
      roughness: 0.82,
      metalness: 0.05,
    }),
  );

  // 広場タイル舗装ベース
  const plazaW = plazaB.maxX - plazaB.minX; // 88
  const plazaD = plazaB.maxZ - plazaB.minZ; // 40
  const plazaMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(plazaW, plazaD)),
    plazaTileMat,
  );
  plazaMesh.rotation.x = -Math.PI / 2;
  plazaMesh.position.set(
    (plazaB.minX + plazaB.maxX) * 0.5,
    0.002,
    (plazaB.minZ + plazaB.maxZ) * 0.5,
  );
  plazaMesh.receiveShadow = true;
  root.add(plazaMesh);

  // ロータリー環状車道アスファルト (r = 10.5..20.5, Y = 0.011 — 南接続車道 0.006 と明確に分離、物理地面 Y = 0)
  const rotaryRoadGeo = trackGeo(
    createRingAsphaltGeometry(rotInR, rotOutR, 48, 0.011, 1 / 160),
  );
  const rotaryRoadMesh = new THREE.Mesh(rotaryRoadGeo, asphaltMaterial);
  rotaryRoadMesh.position.set(rotC.x, 0, rotC.z);
  rotaryRoadMesh.receiveShadow = true;
  root.add(rotaryRoadMesh);

  // ロータリー中央島（石縁石＋植栽芝生＋中央駅時計塔モニュメント）
  const islandGroup = new THREE.Group();
  islandGroup.position.set(rotC.x, 0, rotC.z);

  const islandCurb = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(rotInR, rotInR + 0.25, 0.24, 36)),
    stoneMat,
  );
  islandCurb.position.y = 0.12;
  islandCurb.receiveShadow = true;
  islandGroup.add(islandCurb);

  const islandGrass = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(rotInR - 0.55, rotInR - 0.55, 0.06, 32)),
    grassMat,
  );
  islandGrass.position.y = 0.23;
  islandGrass.receiveShadow = true;
  islandGroup.add(islandGrass);

  // 環状植栽（低木リング：芝生PBR法線・粗さマップを共有して立体感を付与）
  const shrubMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x356436,
      map: grassMat.map,
      normalMap: grassMat.normalMap,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: grassMat.roughnessMap,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const shrubRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(6.2, 0.62, 8, 28)),
    shrubMat,
  );
  shrubRing.rotation.x = Math.PI / 2;
  shrubRing.position.y = 0.55;
  islandGroup.add(shrubRing);

  // 中央駅時計塔モニュメント（4面発光時計文字盤付き）
  const steelDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2f3640,
      roughness: 0.42,
      metalness: 0.72,
    }),
  );
  const steelSilverMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9aa4b0,
      roughness: 0.36,
      metalness: 0.78,
    }),
  );
  const clockFaceTex = trackTex(createClockFaceTexture());
  const clockFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: clockFaceTex,
      emissiveMap: clockFaceTex,
      emissive: WHITE_EMISSIVE.clone(),
      emissiveIntensity: 0.1,
      roughness: 0.28,
      metalness: 0.05,
    }),
  );

  const clockBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.45, 1.85, 0.85, 8)),
    darkStoneMat,
  );
  clockBase.position.y = 0.65;
  islandGroup.add(clockBase);

  const clockShaft = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.46, 0.62, 5.1, 8)),
    steelDarkMat,
  );
  clockShaft.position.y = 3.55;
  islandGroup.add(clockShaft);

  const clockHead = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.55, 1.55, 1.55)),
    steelDarkMat,
  );
  clockHead.position.y = 6.55;
  islandGroup.add(clockHead);

  const clockDialGeo = trackGeo(new THREE.CircleGeometry(0.62, 24));
  const dialOffsets: ReadonlyArray<[number, number, number]> = [
    [0, 0.785, 0],
    [0, -0.785, Math.PI],
    [0.785, 0, Math.PI / 2],
    [-0.785, 0, -Math.PI / 2],
  ];
  for (const [ox, oz, ry] of dialOffsets) {
    const dial = new THREE.Mesh(clockDialGeo, clockFaceMat);
    dial.position.set(ox, 6.55, oz);
    dial.rotation.y = ry;
    islandGroup.add(dial);
  }

  const clockCrown = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(1.18, 0.8, 4)),
    steelSilverMat,
  );
  clockCrown.rotation.y = Math.PI / 4;
  clockCrown.position.y = 7.72;
  islandGroup.add(clockCrown);
  root.add(islandGroup);

  // ロータリー中央島の近似円形コリジョン（2つの45度回転OBBで八角形カバー）
  addCollider('rotary_island_a', rotC.x, rotC.z, 15.0, 15.0, 0, 0, 2.2);
  addCollider(
    'rotary_island_b',
    rotC.x,
    rotC.z,
    15.0,
    15.0,
    Math.PI / 4,
    0,
    2.2,
  );

  // 駅前エントランスキャノピー（西側 x=-33, z=104、中央駅南口）
  const stationSignTex = trackTex(createStationSignTexture());
  const stationSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: stationSignTex,
      emissiveMap: stationSignTex,
      emissive: WHITE_EMISSIVE.clone(),
      emissiveIntensity: 0.12,
      roughness: 0.3,
      metalness: 0.08,
    }),
  );
  const stationGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6f98b8,
      emissive: UNLIT_EMISSIVE.clone(),
      emissiveIntensity: 0,
      roughness: 0.18,
      metalness: 0.35,
    }),
  );
  const canopyGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9cc7e0,
      roughness: 0.18,
      metalness: 0.25,
      transparent: true,
      opacity: 0.62,
    }),
  );

  buildStationEntrancePavilion(
    root,
    -33.5,
    rotC.z,
    steelDarkMat,
    steelSilverMat,
    stoneMat,
    stationGlassMat,
    canopyGlassMat,
    stationSignMat,
    trackGeo,
    addCollider,
  );

  // 東側バス・タクシー乗降シェルター × 2基
  const busSignTex = trackTex(createBusStopSignTexture());
  const busSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: busSignTex,
      emissiveMap: busSignTex,
      emissive: WHITE_EMISSIVE.clone(),
      emissiveIntensity: 0.08,
      roughness: 0.35,
      metalness: 0.05,
    }),
  );
  buildBusShelter(
    root,
    'plaza_bus_shelter_n',
    26.5,
    95.5,
    steelDarkMat,
    canopyGlassMat,
    busSignMat,
    trackGeo,
    addCollider,
  );
  buildBusShelter(
    root,
    'plaza_bus_shelter_s',
    26.5,
    112.5,
    steelDarkMat,
    canopyGlassMat,
    busSignMat,
    trackGeo,
    addCollider,
  );

  // ロータリー広場ボラード（InstancedMesh）
  buildInstancedPlazaBollards(
    root,
    rotC.x,
    rotC.z,
    rotOutR + 0.9,
    steelSilverMat,
    trackGeo,
    addCollider,
  );

  // =========================================================================
  // 5. ベンチ一括配置（公園10脚 ＋ 駅前広場4脚 = 14脚、GLBロード完了まで簡易フォールバック表示）
  // =========================================================================
  const proceduralBenchGroup = new THREE.Group();
  proceduralBenchGroup.name = 'ProceduralFallbackBenches';
  root.add(proceduralBenchGroup);
  buildInstancedBenches(
    proceduralBenchGroup,
    EXPANDED_BENCH_PLACEMENTS,
    trackGeo,
    trackMat,
    addCollider,
  );

  // =========================================================================
  // 6. 公園・駅前広場の夜間グローブ灯（InstancedMesh ＋ 加算ハロー）
  // =========================================================================
  const lampPositions: ReadonlyArray<[number, number]> = [
    // 公園内8基
    [parkCx - 7.4, parkCz - 7.4],
    [parkCx + 7.4, parkCz - 7.4],
    [parkCx - 7.4, parkCz + 7.4],
    [parkCx + 7.4, parkCz + 7.4],
    [26, parkCz - 3.2],
    [84, parkCz + 3.2],
    [34, parkB.minZ + 6.5],
    [76, parkB.maxZ - 6.5],
    // 駅前ロータリー広場6基
    [-23.5, 91],
    [-23.5, 117],
    [23.5, 91],
    [23.5, 117],
    [-34, 86],
    [34, 86],
  ];
  const parkLampGlobeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0ebe2,
      emissive: UNLIT_EMISSIVE.clone(),
      emissiveIntensity: 0,
      roughness: 0.22,
      metalness: 0.05,
    }),
  );
  const lampHaloTex = trackTex(
    createRadialGlowTexture(
      128,
      'rgba(255, 238, 195, 1.0)',
      'rgba(255, 196, 115, 0.42)',
      'rgba(255, 160, 64, 0.0)',
    ),
  );
  const lampHaloMat = trackMat(
    new THREE.SpriteMaterial({
      map: lampHaloTex,
      color: 0xffe2a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }),
  );
  const lampHalos: THREE.Sprite[] = [];

  const parkLampPoleGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.075, 3.2, 8));
  const parkLampGlobeGeo = trackGeo(new THREE.SphereGeometry(0.24, 12, 10));
  const poleInst = new THREE.InstancedMesh(
    parkLampPoleGeo,
    steelDarkMat,
    lampPositions.length,
  );
  const globeInst = new THREE.InstancedMesh(
    parkLampGlobeGeo,
    parkLampGlobeMat,
    lampPositions.length,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < lampPositions.length; i += 1) {
    const [lx, lz] = lampPositions[i];
    dummy.position.set(lx, 1.6, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx, 3.35, lz);
    dummy.updateMatrix();
    globeInst.setMatrixAt(i, dummy.matrix);

    const halo = new THREE.Sprite(lampHaloMat);
    halo.position.set(lx, 3.35, lz);
    halo.scale.set(2.1, 2.1, 1);
    halo.visible = false;
    root.add(halo);
    lampHalos.push(halo);

    addCollider(`park_plaza_lamp_${i}`, lx, lz, 0.24, 0.24, 0, 0, 3.5);
  }
  poleInst.instanceMatrix.needsUpdate = true;
  globeInst.instanceMatrix.needsUpdate = true;
  root.add(poleInst, globeInst);

  // =========================================================================
  // 7. 拡張エリアの代表光源 2基のみ（castShadow = false、M1 iPad Air 60FPS 維持）
  // =========================================================================
  const parkPointLight = new THREE.PointLight(0xffdfa8, 0, 34, 1.5);
  parkPointLight.position.set(parkCx, 5.5, parkCz);
  parkPointLight.castShadow = false;
  root.add(parkPointLight);

  const rotaryPointLight = new THREE.PointLight(0xffe4b8, 0, 38, 1.45);
  rotaryPointLight.position.set(rotC.x, 6.8, rotC.z);
  rotaryPointLight.castShadow = false;
  root.add(rotaryPointLight);

  let lastNightFactor = -1;
  const setNightFactor = (factor: number): void => {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - lastNightFactor) < 0.004) return;
    lastNightFactor = clamped;

    const isLit = clamped > 0.03;

    if (isLit) {
      parkLampGlobeMat.emissive.copy(WARM_LAMP_EMISSIVE);
      parkLampGlobeMat.emissiveIntensity = clamped * 1.75;
      fountainWaterMat.emissive.copy(FOUNTAIN_GLOW_EMISSIVE);
      fountainWaterMat.emissiveIntensity = clamped * 0.36;
      stationGlassMat.emissive.copy(STATION_GLASS_EMISSIVE);
      stationGlassMat.emissiveIntensity = clamped * 0.78;
    } else {
      parkLampGlobeMat.emissive.copy(UNLIT_EMISSIVE);
      parkLampGlobeMat.emissiveIntensity = 0;
      fountainWaterMat.emissive.copy(UNLIT_EMISSIVE);
      fountainWaterMat.emissiveIntensity = 0;
      stationGlassMat.emissive.copy(UNLIT_EMISSIVE);
      stationGlassMat.emissiveIntensity = 0;
    }

    clockFaceMat.emissiveIntensity = 0.05 + clamped * 1.05;
    stationSignMat.emissiveIntensity = 0.06 + clamped * 1.15;
    busSignMat.emissiveIntensity = 0.05 + clamped * 1.0;

    lampHaloMat.opacity = clamped * 0.5;
    for (let i = 0; i < lampHalos.length; i += 1) {
      lampHalos[i].visible = isLit;
    }

    parkPointLight.intensity = clamped * 32;
    rotaryPointLight.intensity = clamped * 38;
  };

  setNightFactor(0);

  return {
    group: root,
    grassMaterial: grassMat,
    setNightFactor,
    setProceduralBenchesVisible: (visible: boolean) => {
      proceduralBenchGroup.visible = visible;
    },
    dispose: () => {
      for (const id of colliderIds) {
        collisionWorld.removeCollider(id);
      }
      colliderIds.length = 0;
      scene.remove(root);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      geometries.length = 0;
      materials.length = 0;
      textures.length = 0;
      lampHalos.length = 0;
    },
  };
}

// ===========================================================================
// ジオメトリ構築ユーティリティ
// ===========================================================================

function createWorldUvRectGeometry(
  width: number,
  depth: number,
  uvPerMeter: number,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  const uSpan = width * uvPerMeter;
  const vSpan = depth * uvPerMeter;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * uSpan, uv.getY(i) * vSpan);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * 角丸長方形（外周道路ループ）の連続リボン BufferGeometry を生成する。
 * innerOffset / outerOffset は中心線からの法線オフセット（負=内側, 正=外側）。
 */
export function sampleRoundedLoopPoints(
  halfSpan: number,
  cornerRadius: number,
  arcSegments: number,
): Array<{ x: number; z: number; nx: number; nz: number; dist: number }> {
  const s = halfSpan - cornerRadius; // 94
  const corners: ReadonlyArray<{
    cx: number;
    cz: number;
    startAngle: number;
    endAngle: number;
  }> = [
    // NE corner (+s, -s): from North (-PI/2) to East (0)
    { cx: s, cz: -s, startAngle: -Math.PI / 2, endAngle: 0 },
    // SE corner (+s, +s): from East (0) to South (PI/2)
    { cx: s, cz: s, startAngle: 0, endAngle: Math.PI / 2 },
    // SW corner (-s, +s): from South (PI/2) to West (PI)
    { cx: -s, cz: s, startAngle: Math.PI / 2, endAngle: Math.PI },
    // NW corner (-s, -s): from West (PI) to North (3*PI/2)
    { cx: -s, cz: -s, startAngle: Math.PI, endAngle: Math.PI * 1.5 },
  ];

  const raw: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  for (const c of corners) {
    for (let i = 0; i <= arcSegments; i += 1) {
      const a = c.startAngle + ((c.endAngle - c.startAngle) * i) / arcSegments;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      raw.push({
        x: c.cx + nx * cornerRadius,
        z: c.cz + nz * cornerRadius,
        nx,
        nz,
      });
    }
  }
  // 始点を末尾に閉じて連続ループ化
  raw.push({ ...raw[0] });

  const out: Array<{
    x: number;
    z: number;
    nx: number;
    nz: number;
    dist: number;
  }> = [];
  let accum = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (i > 0) {
      accum += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    }
    out.push({ ...raw[i], dist: accum });
  }
  return out;
}

function createRoundedLoopStripGeometry(
  halfSpan: number,
  cornerRadius: number,
  innerOffset: number,
  outerOffset: number,
  y: number,
  arcSegments: number,
  uvPerMeter: number,
): THREE.BufferGeometry {
  const samples = sampleRoundedLoopPoints(halfSpan, cornerRadius, arcSegments);
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];

  const stripW = Math.abs(outerOffset - innerOffset);

  for (let i = 0; i < count; i += 1) {
    const p = samples[i];
    const ix = p.x + p.nx * innerOffset;
    const iz = p.z + p.nz * innerOffset;
    const ox = p.x + p.nx * outerOffset;
    const oz = p.z + p.nz * outerOffset;

    const v0 = i * 2;
    const v1 = i * 2 + 1;

    positions[v0 * 3] = ix;
    positions[v0 * 3 + 1] = y;
    positions[v0 * 3 + 2] = iz;

    positions[v1 * 3] = ox;
    positions[v1 * 3 + 1] = y;
    positions[v1 * 3 + 2] = oz;

    normals[v0 * 3] = 0;
    normals[v0 * 3 + 1] = 1;
    normals[v0 * 3 + 2] = 0;

    normals[v1 * 3] = 0;
    normals[v1 * 3 + 1] = 1;
    normals[v1 * 3 + 2] = 0;

    uvs[v0 * 2] = 0;
    uvs[v0 * 2 + 1] = p.dist * uvPerMeter;

    uvs[v1 * 2] = stripW * uvPerMeter;
    uvs[v1 * 2 + 1] = p.dist * uvPerMeter;

    if (i < count - 1) {
      const a = v0;
      const b = v1;
      const c = v0 + 2;
      const d = v1 + 2;
      // +Y 上向き法線になる反時計回り巻き順 ((c - a) x (b - a) = +Y)
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createRingAsphaltGeometry(
  innerR: number,
  outerR: number,
  segments: number,
  y: number,
  uvPerMeter: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ix = c * innerR;
    const iz = s * innerR;
    const ox = c * outerR;
    const oz = s * outerR;

    positions.push(ix, y, iz, ox, y, oz);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(
      ix * uvPerMeter,
      iz * uvPerMeter,
      ox * uvPerMeter,
      oz * uvPerMeter,
    );

    if (i < segments) {
      const v = i * 2;
      // +Y 上向き法線になる反時計回り巻き順
      indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** 拡張幹線道路・外周ループ・駅前ロータリーの道路標示を構築 */
function buildExpandedRoadMarkings(
  parent: THREE.Group,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
): void {
  const whiteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeaecef,
      roughness: 0.72,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const yellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3a82b,
      roughness: 0.7,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 134
  const cornerR = CITY_METRICS.outerRingCornerRadius; // 42
  const ringHalfW = CITY_METRICS.outerRingHalfWidth; // 8.0
  const laneDivOff = ringHalfW * 0.5; // 4.0m (片側2車線の中央)
  const y = 0.018;

  // 外周道路ループの中央線（オレンジ実線）および内側・外側白実線
  const ringCenterGeo = trackGeo(
    createRoundedLoopStripGeometry(ringSpan, cornerR, -0.11, 0.11, y, 22, 0.1),
  );
  parent.add(new THREE.Mesh(ringCenterGeo, yellowMat));

  const ringInnerLineGeo = trackGeo(
    createRoundedLoopStripGeometry(
      ringSpan,
      cornerR,
      -ringHalfW + 0.3,
      -ringHalfW + 0.48,
      y,
      22,
      0.1,
    ),
  );
  parent.add(new THREE.Mesh(ringInnerLineGeo, whiteMat));

  const ringOuterLineGeo = trackGeo(
    createRoundedLoopStripGeometry(
      ringSpan,
      cornerR,
      ringHalfW - 0.48,
      ringHalfW - 0.3,
      y,
      22,
      0.1,
    ),
  );
  parent.add(new THREE.Mesh(ringOuterLineGeo, whiteMat));

  // バッチ化用矩形ストリップ（白・黄）を InstancedMesh で描画
  const unitPlane = trackGeo(new THREE.PlaneGeometry(1, 1));
  unitPlane.rotateX(-Math.PI / 2);

  interface StripItem {
    x: number;
    z: number;
    w: number;
    d: number;
    ry: number;
  }
  const whiteStrips: StripItem[] = [];
  const yellowStrips: StripItem[] = [];

  // 外周道路ループの2車線分割破線（内側車線 -4.0m / 外側車線 +4.0m）
  const loopSamples = sampleRoundedLoopPoints(ringSpan, cornerR, 20);
  for (let i = 0; i < loopSamples.length - 1; i += 1) {
    const p0 = loopSamples[i];
    const p1 = loopSamples[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const tx = (p1.x - p0.x) / Math.max(1e-4, segLen);
    const tz = (p1.z - p0.z) / Math.max(1e-4, segLen);
    const ry = Math.atan2(tx, tz);
    const dashStep = 10.0;
    const count = Math.max(1, Math.floor(segLen / dashStep));
    for (let k = 0; k < count; k += 1) {
      const f = (k + 0.5) / count;
      const bx = p0.x + (p1.x - p0.x) * f;
      const bz = p0.z + (p1.z - p0.z) * f;
      const nx = p0.nx * (1 - f) + p1.nx * f;
      const nz = p0.nz * (1 - f) + p1.nz * f;
      const nLen = Math.hypot(nx, nz) || 1;
      const unx = nx / nLen;
      const unz = nz / nLen;
      // 4方向T字接続部 (±12m) は破線を省く
      if (
        (Math.abs(bx) < 12 && Math.abs(Math.abs(bz) - ringSpan) < 14) ||
        (Math.abs(bz) < 12 && Math.abs(Math.abs(bx) - ringSpan) < 14)
      ) {
        continue;
      }
      whiteStrips.push({
        x: bx - unx * laneDivOff,
        z: bz - unz * laneDivOff,
        w: 0.14,
        d: 4.0,
        ry,
      });
      whiteStrips.push({
        x: bx + unx * laneDivOff,
        z: bz + unz * laneDivOff,
        w: 0.14,
        d: 4.0,
        ry,
      });
    }
  }

  // 4方向延長幹線の白線・中央線 (80..121.8m、T字横断歩道手前まで)
  const extLen = 41.8;
  const extCenter = 80 + extLen * 0.5; // 100.9
  const roadHalf = CITY_METRICS.roadHalfWidth; // 6
  const outerOff = roadHalf - 0.35;

  // 北延長
  yellowStrips.push({ x: 0, z: -extCenter, w: 0.18, d: extLen, ry: 0 });
  whiteStrips.push({ x: -outerOff, z: -extCenter, w: 0.16, d: extLen, ry: 0 });
  whiteStrips.push({ x: outerOff, z: -extCenter, w: 0.16, d: extLen, ry: 0 });
  // 西・東延長
  for (const sign of [-1, 1]) {
    yellowStrips.push({ x: sign * extCenter, z: 0, w: extLen, d: 0.18, ry: 0 });
    whiteStrips.push({
      x: sign * extCenter,
      z: -outerOff,
      w: extLen,
      d: 0.16,
      ry: 0,
    });
    whiteStrips.push({
      x: sign * extCenter,
      z: outerOff,
      w: extLen,
      d: 0.16,
      ry: 0,
    });
  }

  // T字合流部（北・西・東・南）の横断歩道ゼブラストライプ（外周内縁 ±126m の手前 ±123.6m）
  const stripeCount = 8;
  const stripeSpan = roadHalf * 2 - 1.6;
  const stripeStep = stripeSpan / stripeCount;
  for (let i = 0; i < stripeCount; i += 1) {
    const off = -stripeSpan * 0.5 + stripeStep * (i + 0.5);
    // 北・南 T字合流部
    whiteStrips.push({ x: off, z: -123.6, w: 0.52, d: 2.8, ry: 0 });
    whiteStrips.push({ x: off, z: 123.8, w: 0.52, d: 2.4, ry: 0 });
    // 西・東 T字合流部
    whiteStrips.push({ x: -123.6, z: off, w: 2.8, d: 0.52, ry: 0 });
    whiteStrips.push({ x: 123.6, z: off, w: 2.8, d: 0.52, ry: 0 });
    // ロータリー北入口横断歩道 (z = 82.4)
    whiteStrips.push({ x: off, z: 82.4, w: 0.52, d: 2.6, ry: 0 });
  }

  // ロータリー環状破線 (r = 15.5m)
  const rotC = CITY_METRICS.rotaryCenter;
  const rotDashCount = 24;
  for (let i = 0; i < rotDashCount; i += 1) {
    const a = (i / rotDashCount) * Math.PI * 2;
    const rx = rotC.x + Math.cos(a) * 15.5;
    const rz = rotC.z + Math.sin(a) * 15.5;
    whiteStrips.push({
      x: rx,
      z: rz,
      w: 0.15,
      d: 2.1,
      ry: -a,
    });
  }

  const dummy = new THREE.Object3D();
  const whiteInst = new THREE.InstancedMesh(
    unitPlane,
    whiteMat,
    whiteStrips.length,
  );
  for (let i = 0; i < whiteStrips.length; i += 1) {
    const s = whiteStrips[i];
    dummy.position.set(s.x, y, s.z);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.set(s.w, 1, s.d);
    dummy.updateMatrix();
    whiteInst.setMatrixAt(i, dummy.matrix);
  }
  whiteInst.instanceMatrix.needsUpdate = true;
  parent.add(whiteInst);

  const yellowInst = new THREE.InstancedMesh(
    unitPlane,
    yellowMat,
    yellowStrips.length,
  );
  for (let i = 0; i < yellowStrips.length; i += 1) {
    const s = yellowStrips[i];
    dummy.position.set(s.x, y, s.z);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.set(s.w, 1, s.d);
    dummy.updateMatrix();
    yellowInst.setMatrixAt(i, dummy.matrix);
  }
  yellowInst.instanceMatrix.needsUpdate = true;
  parent.add(yellowInst);
}

/** 都市公園の外周スチール柵 (InstancedMesh + 連続区間ごとの OBB コライダー) */
function buildInstancedParkFences(
  parent: THREE.Group,
  segments: readonly FenceSegmentSpec[],
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): void {
  const fenceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b444b,
      roughness: 0.45,
      metalness: 0.65,
    }),
  );

  const postPositions: Array<{ x: number; z: number }> = [];
  const railSpans: Array<{ x: number; z: number; len: number; ry: number }> = [];

  for (const seg of segments) {
    const dx = seg.x1 - seg.x0;
    const dz = seg.z1 - seg.z0;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    const cx = (seg.x0 + seg.x1) * 0.5;
    const cz = (seg.z0 + seg.z1) * 0.5;

    railSpans.push({ x: cx, z: cz, len, ry });
    addCollider(seg.id, cx, cz, 0.24, len, ry, 0, 0.96);

    const postCount = Math.max(2, Math.round(len / 2.5) + 1);
    for (let i = 0; i < postCount; i += 1) {
      const t = i / (postCount - 1);
      postPositions.push({
        x: seg.x0 + dx * t,
        z: seg.z0 + dz * t,
      });
    }
  }

  const postGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.04, 0.96, 6));
  const railGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.055, 1.0));

  const postInst = new THREE.InstancedMesh(
    postGeo,
    fenceMat,
    postPositions.length,
  );
  const railInst = new THREE.InstancedMesh(
    railGeo,
    fenceMat,
    railSpans.length * 2,
  );
  postInst.frustumCulled = false;
  railInst.frustumCulled = false;
  const dummy = new THREE.Object3D();

  for (let i = 0; i < postPositions.length; i += 1) {
    dummy.position.set(postPositions[i].x, 0.48, postPositions[i].z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(i, dummy.matrix);
  }
  postInst.instanceMatrix.needsUpdate = true;

  let railIdx = 0;
  for (const r of railSpans) {
    for (const h of [0.34, 0.88]) {
      dummy.position.set(r.x, h, r.z);
      dummy.rotation.set(0, r.ry, 0);
      dummy.scale.set(1, 1, r.len);
      dummy.updateMatrix();
      railInst.setMatrixAt(railIdx, dummy.matrix);
      railIdx += 1;
    }
  }
  railInst.instanceMatrix.needsUpdate = true;

  parent.add(postInst, railInst);
}

/** 公園・駅前広場の木製スラット＋鋳鉄フレームベンチ (InstancedMesh) */
function buildInstancedBenches(
  parent: THREE.Group,
  benches: readonly BenchPlacement[],
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): void {
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8b5a34,
      roughness: 0.78,
      metalness: 0.04,
    }),
  );
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2a2f36,
      roughness: 0.48,
      metalness: 0.72,
    }),
  );

  const slatGeo = trackGeo(new THREE.BoxGeometry(1.68, 0.055, 0.12));
  const legGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.46, 0.56));

  // 座面3本 + 背もたれ2本 = 5スラット / ベンチ
  const slatInst = new THREE.InstancedMesh(slatGeo, woodMat, benches.length * 5);
  const legInst = new THREE.InstancedMesh(legGeo, ironMat, benches.length * 2);

  const dummy = new THREE.Object3D();
  const baseQuat = new THREE.Quaternion();
  const localQuat = new THREE.Quaternion();
  const localPos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);

  let sIdx = 0;
  let lIdx = 0;

  const slatOffsets: ReadonlyArray<[number, number, number]> = [
    [0.44, 0.16, 0],
    [0.44, 0.0, 0],
    [0.44, -0.16, 0],
    [0.68, -0.25, -0.22],
    [0.84, -0.29, -0.22],
  ];

  for (const b of benches) {
    baseQuat.setFromAxisAngle(yAxis, b.yaw);

    for (const [ly, lz, pitch] of slatOffsets) {
      localPos.set(0, ly, lz).applyQuaternion(baseQuat);
      dummy.position.set(b.x + localPos.x, localPos.y, b.z + localPos.z);
      localQuat.setFromAxisAngle(xAxis, pitch);
      dummy.quaternion.copy(baseQuat).multiply(localQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      slatInst.setMatrixAt(sIdx, dummy.matrix);
      sIdx += 1;
    }

    for (const lx of [-0.68, 0.68]) {
      localPos.set(lx, 0.23, 0).applyQuaternion(baseQuat);
      dummy.position.set(b.x + localPos.x, localPos.y, b.z + localPos.z);
      dummy.quaternion.copy(baseQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      legInst.setMatrixAt(lIdx, dummy.matrix);
      lIdx += 1;
    }

    addCollider(b.id, b.x, b.z, 1.72, 0.66, b.yaw, 0, 0.9);
  }

  slatInst.instanceMatrix.needsUpdate = true;
  legInst.instanceMatrix.needsUpdate = true;
  parent.add(slatInst, legInst);
}

/** 駅前ロータリー西側の現代的な駅エントランスキャノピー（中央駅南口） */
function buildStationEntrancePavilion(
  parent: THREE.Group,
  cx: number,
  cz: number,
  steelDarkMat: THREE.Material,
  steelSilverMat: THREE.Material,
  stoneMat: THREE.Material,
  stationGlassMat: THREE.Material,
  canopyGlassMat: THREE.Material,
  stationSignMat: THREE.Material,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): void {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);

  // 奥側ガラスコンコースファサード（幅 22m × 高さ 5.4m × 奥行 5.2m）
  const plinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(5.4, 0.5, 22.4)),
    stoneMat,
  );
  plinth.position.set(-2.2, 0.25, 0);
  g.add(plinth);

  const glassWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.8, 4.5, 21.4)),
    stationGlassMat,
  );
  glassWall.position.set(-2.2, 2.75, 0);
  g.add(glassWall);

  // 縦マリオン（ガラス枠支柱）
  const mullionGeo = trackGeo(new THREE.BoxGeometry(0.22, 4.6, 0.18));
  for (let i = -4; i <= 4; i += 1) {
    const m = new THREE.Mesh(mullionGeo, steelDarkMat);
    m.position.set(0.22, 2.8, i * 2.55);
    g.add(m);
  }

  // 張り出し大庇（キャノピーフレーム＋ガラス天窓）
  const roofFrame = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(10.6, 0.36, 23.6)),
    steelDarkMat,
  );
  roofFrame.position.set(0.3, 5.25, 0);
  g.add(roofFrame);

  const skylight = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(4.4, 0.08, 19.6)),
    canopyGlassMat,
  );
  skylight.position.set(2.5, 5.45, 0);
  g.add(skylight);

  // 前方キャノピー支柱（6本の鋼管柱）
  const colGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 5.1, 10));
  for (const zOff of [-10.2, -5.1, 0, 5.1, 10.2]) {
    const col = new THREE.Mesh(colGeo, steelSilverMat);
    col.position.set(4.8, 2.55, zOff);
    g.add(col);
  }

  // 駅名発光ファサード看板（"中央駅 CHUO STATION"）
  const signBacking = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.28, 1.35, 11.4)),
    steelDarkMat,
  );
  signBacking.position.set(5.45, 5.95, 0);
  g.add(signBacking);

  const signFace = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(11.0, 1.12)),
    stationSignMat,
  );
  signFace.rotation.y = Math.PI / 2;
  signFace.position.set(5.62, 5.95, 0);
  g.add(signFace);

  parent.add(g);

  // コンコース建物本体のコリジョン（手前の柱間は歩けるように奥側を主コリジョン）
  addCollider('station_pavilion_main', cx - 2.2, cz, 5.6, 22.6, 0, 0, 5.6);
}

/** 駅前ロータリー東側のバス・タクシー乗降シェルター */
function buildBusShelter(
  parent: THREE.Group,
  id: string,
  x: number,
  z: number,
  steelDarkMat: THREE.Material,
  canopyGlassMat: THREE.Material,
  busSignMat: THREE.Material,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const postGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.065, 2.65, 8));
  for (const pz of [-2.4, 2.4]) {
    const p = new THREE.Mesh(postGeo, steelDarkMat);
    p.position.set(0.8, 1.325, pz);
    g.add(p);
  }
  const backGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.08, 2.1, 4.7)),
    canopyGlassMat,
  );
  backGlass.position.set(0.85, 1.25, 0);
  g.add(backGlass);

  const roof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.3, 0.1, 5.4)),
    steelDarkMat,
  );
  roof.position.set(-0.05, 2.68, 0);
  g.add(roof);

  // バス停ポール＆時刻表発光サイン
  const pole = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.035, 0.04, 2.4, 8)),
    steelDarkMat,
  );
  pole.position.set(-0.95, 1.2, -2.9);
  g.add(pole);

  const disc = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16)),
    busSignMat,
  );
  disc.rotation.z = Math.PI / 2;
  disc.position.set(-0.95, 2.35, -2.9);
  g.add(disc);

  parent.add(g);
  addCollider(id, x + 0.75, z, 0.5, 5.2, 0, 0, 2.7);
}

/** 駅前ロータリー外周ボラード（InstancedMesh） */
function buildInstancedPlazaBollards(
  parent: THREE.Group,
  cx: number,
  cz: number,
  radius: number,
  metalMat: THREE.Material,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): void {
  const coords: Array<{ x: number; z: number }> = [];
  // 東・西の歩道円弧（北・南の車道接続開口部＋駅エントランス/バス停前の東西歩行者出入口を開放）
  const arcRanges: ReadonlyArray<[number, number]> = [
    [-Math.PI * 0.34, -Math.PI * 0.09], // 東北側円弧
    [Math.PI * 0.09, Math.PI * 0.34], // 東南側円弧
    [Math.PI * 0.66, Math.PI * 0.91], // 西南側円弧
    [Math.PI * 1.09, Math.PI * 1.34], // 西北側円弧
  ];
  for (const [aStart, aEnd] of arcRanges) {
    const steps = 4;
    for (let i = 0; i <= steps; i += 1) {
      const a = aStart + ((aEnd - aStart) * i) / steps;
      coords.push({
        x: cx + Math.cos(a) * radius,
        z: cz + Math.sin(a) * radius,
      });
    }
  }

  const geo = trackGeo(new THREE.CylinderGeometry(0.085, 0.095, 0.78, 8));
  const inst = new THREE.InstancedMesh(geo, metalMat, coords.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < coords.length; i += 1) {
    dummy.position.set(coords[i].x, 0.39, coords[i].z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  parent.add(inst);

  // 各サブ弧を2本の低めコリジョンセグメントで近似（車両の広場乗り上げ防止しつつ歩行者出入口を確保）
  for (let rIdx = 0; rIdx < arcRanges.length; rIdx += 1) {
    const [aStart, aEnd] = arcRanges[rIdx];
    const segs = 2;
    for (let i = 0; i < segs; i += 1) {
      const a0 = aStart + ((aEnd - aStart) * i) / segs;
      const a1 = aStart + ((aEnd - aStart) * (i + 1)) / segs;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      addCollider(
        `plaza_bollard_arc_${rIdx}_${i}`,
        mx,
        mz,
        0.24,
        len,
        ry,
        0,
        0.8,
      );
    }
  }
}

// ===========================================================================
// プロシージャル高精細テクスチャ生成 (CanvasTexture)
// ===========================================================================

function createOutskirtsGroundTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#757d78';
    ctx.fillRect(0, 0, size, size);
    let seed = 9182;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 9000; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const v = Math.floor(104 + (rand() - 0.5) * 28);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v - 2})`;
      ctx.fillRect(x, y, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createParkPathTexture(
  anisotropy: number,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c9bfae';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const cols = 4;
    const cellW = size / cols;
    const cellH = size / rows;
    let seed = 2029;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * (cellW * 0.5);
      for (let c = -1; c <= cols; c += 1) {
        const shade = Math.floor(190 + (rand() - 0.5) * 24);
        ctx.fillStyle = `rgb(${shade + 8}, ${shade}, ${shade - 12})`;
        ctx.fillRect(c * cellW + offset + 2, r * cellH + 2, cellW - 4, cellH - 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createPlazaTileTexture(
  anisotropy: number,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#b9bec4';
    ctx.fillRect(0, 0, size, size);
    const n = 4;
    const step = size / n;
    let seed = 6151;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = Math.floor(182 + (rand() - 0.5) * 16);
        const warm = (x + y) % 2 === 0 ? 4 : -4;
        ctx.fillStyle = `rgb(${v + warm}, ${v + warm}, ${v + 2})`;
        ctx.fillRect(x * step + 3, y * step + 3, step - 6, step - 6);
      }
    }
    ctx.strokeStyle = 'rgba(85, 92, 102, 0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createClockFaceTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size * 0.5;
    ctx.fillStyle = '#f8f5ec';
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.stroke();

    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const inner = i % 3 === 0 ? c - 36 : c - 24;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = i % 3 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
      ctx.stroke();
    }

    // 10時10分の針
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c - 44, c - 28);
    ctx.stroke();

    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + 58, c - 42);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(c, c, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createStationSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#14294a';
    ctx.fillRect(0, 0, 1024, 128);
    // 駅カラーライン（JR風の緑＆シアン帯）
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(0, 106, 1024, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('中 央 駅  南 口    CHUO STATION', 512, 56);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBusStopSignTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size * 0.5;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(16, c - 36, size - 32, 72);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BUS', c, c);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
