import * as THREE from 'three';
import { CITY_METRICS, type CollisionWorld } from './collisionWorld';
import { sampleRoundedLoopPoints } from './expandedWorld';
import { createRadialGlowTexture } from './streetLights';

export interface JapanesePropsHandle {
  group: THREE.Group;
  setNightFactor: (factor: number) => void;
  dispose: () => void;
}

type VendingTheme = 'blue' | 'red' | 'white';
type SignTheme = 'konbini' | 'izakaya' | 'cafe' | 'parking';
type RoadSignType = 'tomare' | 'speed40' | 'speed60' | 'crosswalk' | 'chevron';

interface VendingSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  baseY: number;
  theme: VendingTheme;
}

interface ShopSignSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  baseY: number;
  theme: SignTheme;
  style: 'pylon' | 'facade';
}

interface GuardrailRun {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  baseY: number;
  hasReflector?: boolean;
}

interface RoadSignSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  baseY: number;
  type: RoadSignType;
}

interface TreeSpec {
  id: string;
  x: number;
  z: number;
  baseY: number;
  scale: number;
  yaw: number;
  hasPit: boolean;
  tintHex: number;
}

const WHITE_COLOR = new THREE.Color(0xffffff);
const REFLECTOR_EMISSIVE = new THREE.Color(0xffb830);
const UNLIT_COLOR = new THREE.Color(0x000000);

/**
 * PHASE 4-A: 日本の街並み装飾プロップ一括構築システム（昼夜ライティング連動・InstancedMesh 最適化）。
 * - 自動販売機（青・赤・白、夕方・夜に前面ディスプレイ発光）
 * - コンビニ・店舗風の光る袖看板／ファサード看板（夕方・夜に点灯）
 * - 白いスチール製ガードレール（歩道境界・外周カーブ、低め OBB コリジョン付き、InstancedMesh）
 * - 日本の道路標識（止まれ・制限速度40/60・横断歩道・カーブシェブロン、InstancedMesh）
 * - 街路樹・公園樹木（樹皮＋多層有機樹冠、InstancedMesh、幹コリジョン付き）
 */
export function buildJapaneseStreetProps(
  scene: THREE.Scene,
  collisionWorld: CollisionWorld,
  maxAnisotropy: number,
): JapanesePropsHandle {
  const root = new THREE.Group();
  root.name = 'JapaneseStreetPropsRoot';
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

  // 夜間発光連動対象リスト
  const emissiveDisplayMats: Array<{
    mat: THREE.MeshStandardMaterial;
    dayIntensity: number;
    nightIntensity: number;
  }> = [];
  const nightGlowMeshes: THREE.Object3D[] = [];
  const nightGlowMats: Array<{ mat: THREE.Material; maxOpacity: number }> = [];

  const swY = CITY_METRICS.sidewalkHeight; // 0.12

  // =========================================================================
  // 1. 自動販売機（青・赤・白 10基 — 歩道外縁/壁際へ整列、夕方・夜に自然な明るさで発光）
  // =========================================================================
  const vendingSpecs: VendingSpec[] = [
    { id: 'jp_vm_n_west', x: -10.35, z: -38, yaw: Math.PI / 2, baseY: swY, theme: 'blue' },
    { id: 'jp_vm_n_east', x: 10.35, z: -48, yaw: -Math.PI / 2, baseY: swY, theme: 'red' },
    { id: 'jp_vm_s_west', x: -10.35, z: 44, yaw: Math.PI / 2, baseY: swY, theme: 'white' },
    { id: 'jp_vm_s_east', x: 10.35, z: 52, yaw: -Math.PI / 2, baseY: swY, theme: 'blue' },
    { id: 'jp_vm_w_north', x: -36, z: -10.35, yaw: 0, baseY: swY, theme: 'red' },
    { id: 'jp_vm_e_south', x: 38, z: 10.35, yaw: Math.PI, baseY: swY, theme: 'white' },
    { id: 'jp_vm_park_w', x: 13.4, z: -95.5, yaw: -Math.PI / 2, baseY: 0, theme: 'blue' },
    { id: 'jp_vm_park_n', x: 61.5, z: -120.6, yaw: Math.PI, baseY: 0, theme: 'white' },
    { id: 'jp_vm_plaza_w', x: -29.8, z: 91.5, yaw: Math.PI / 2, baseY: 0, theme: 'red' },
    { id: 'jp_vm_plaza_e', x: 28.0, z: 104.0, yaw: -Math.PI / 2, baseY: 0, theme: 'blue' },
  ];

  const vmBodyGeo = trackGeo(new THREE.BoxGeometry(1.12, 1.84, 0.72));
  const vmTopTrimGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.08, 0.76));
  const vmDisplayGeo = trackGeo(new THREE.PlaneGeometry(0.98, 1.06));
  const vmBinGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.78, 0.44));
  const vmGlowPoolGeo = trackGeo(new THREE.PlaneGeometry(2.6, 2.2));
  vmGlowPoolGeo.rotateX(-Math.PI / 2);

  const vmBodyMats: Record<VendingTheme, THREE.MeshStandardMaterial> = {
    blue: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1d63b8,
        roughness: 0.36,
        metalness: 0.35,
      }),
    ),
    red: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2282d,
        roughness: 0.36,
        metalness: 0.35,
      }),
    ),
    white: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xecf0f4,
        roughness: 0.34,
        metalness: 0.28,
      }),
    ),
  };
  const vmBinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.55,
      metalness: 0.45,
    }),
  );
  const vmDisplayMats: Record<VendingTheme, THREE.MeshStandardMaterial> = {
    blue: createVendingDisplayMaterial('blue', aniso, trackTex, trackMat),
    red: createVendingDisplayMaterial('red', aniso, trackTex, trackMat),
    white: createVendingDisplayMaterial('white', aniso, trackTex, trackMat),
  };
  for (const theme of ['blue', 'red', 'white'] as const) {
    emissiveDisplayMats.push({
      mat: vmDisplayMats[theme],
      dayIntensity: 0.02,
      nightIntensity: 1.18,
    });
  }

  const vmGlowTex = trackTex(
    createRadialGlowTexture(
      128,
      'rgba(225, 244, 255, 0.78)',
      'rgba(180, 224, 255, 0.32)',
      'rgba(120, 190, 255, 0.0)',
    ),
  );
  const vmGlowPoolMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: vmGlowTex,
      color: 0xdff4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  nightGlowMats.push({ mat: vmGlowPoolMat, maxOpacity: 0.26 });

  for (const spec of vendingSpecs) {
    const g = new THREE.Group();
    g.name = spec.id;
    g.position.set(spec.x, spec.baseY, spec.z);
    g.rotation.y = spec.yaw;

    const body = new THREE.Mesh(vmBodyGeo, vmBodyMats[spec.theme]);
    body.position.y = 0.94;
    body.receiveShadow = true;
    g.add(body);

    const trim = new THREE.Mesh(vmTopTrimGeo, vmBinMat);
    trim.position.y = 1.88;
    g.add(trim);

    // 前面ディスプレイ（+Z 正面、夕方・夜に発光）
    const display = new THREE.Mesh(vmDisplayGeo, vmDisplayMats[spec.theme]);
    display.position.set(0, 1.24, 0.368);
    g.add(display);

    // 隣接する空き缶・ペットボトルリサイクルボックス
    const bin = new THREE.Mesh(vmBinGeo, vmBinMat);
    bin.position.set(0.76, 0.39, 0.04);
    g.add(bin);

    // 夜間足元こぼれ光デカール
    const pool = new THREE.Mesh(vmGlowPoolGeo, vmGlowPoolMat);
    pool.position.set(0, 0.025, 1.05);
    pool.visible = false;
    g.add(pool);
    nightGlowMeshes.push(pool);

    root.add(g);
    addCollider(spec.id, spec.x, spec.z, 1.5, 0.78, spec.yaw, spec.baseY, spec.baseY + 1.9);
  }

  // =========================================================================
  // 2. コンビニ・店舗風の光る袖看板／ファサード看板（夕方・夜に点灯）
  // =========================================================================
  const shopSigns: ShopSignSpec[] = [
    // コンビニ風ポール袖看板（4方向商業角・駅前広場・外周合流付近）
    { id: 'sign_konbini_nw', x: -11.4, z: -12.0, yaw: Math.PI / 2, baseY: swY, theme: 'konbini', style: 'pylon' },
    { id: 'sign_konbini_se', x: 11.2, z: 32.0, yaw: -Math.PI / 2, baseY: swY, theme: 'konbini', style: 'pylon' },
    { id: 'sign_izakaya_nw', x: -11.4, z: -26.5, yaw: Math.PI / 2, baseY: swY, theme: 'izakaya', style: 'pylon' },
    { id: 'sign_cafe_sw', x: -11.2, z: 30.0, yaw: Math.PI / 2, baseY: swY, theme: 'cafe', style: 'pylon' },
    { id: 'sign_parking_ne', x: 42.0, z: -11.0, yaw: 0, baseY: swY, theme: 'parking', style: 'pylon' },
    { id: 'sign_konbini_plaza', x: 31.0, z: 85.0, yaw: 0, baseY: 0, theme: 'konbini', style: 'pylon' },
    // 店舗ファサード横長看板
    { id: 'facade_konbini_sw', x: -30.0, z: 11.2, yaw: Math.PI, baseY: swY, theme: 'konbini', style: 'facade' },
    { id: 'facade_cafe_ne', x: 28.0, z: -11.2, yaw: 0, baseY: swY, theme: 'cafe', style: 'facade' },
    { id: 'facade_izakaya_nw_ext', x: -62.0, z: -87.0, yaw: 0, baseY: 0, theme: 'izakaya', style: 'facade' },
    { id: 'facade_konbini_se_ext', x: 64.0, z: 87.0, yaw: Math.PI, baseY: 0, theme: 'konbini', style: 'facade' },
  ];

  const signPoleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3a414a,
      roughness: 0.42,
      metalness: 0.7,
    }),
  );
  const signFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22272e,
      roughness: 0.45,
      metalness: 0.6,
    }),
  );

  const pylonFaceMats: Record<SignTheme, THREE.MeshStandardMaterial> = {
    konbini: createShopSignMaterial('konbini', 'pylon', aniso, trackTex, trackMat),
    izakaya: createShopSignMaterial('izakaya', 'pylon', aniso, trackTex, trackMat),
    cafe: createShopSignMaterial('cafe', 'pylon', aniso, trackTex, trackMat),
    parking: createShopSignMaterial('parking', 'pylon', aniso, trackTex, trackMat),
  };
  const facadeFaceMats: Record<SignTheme, THREE.MeshStandardMaterial> = {
    konbini: createShopSignMaterial('konbini', 'facade', aniso, trackTex, trackMat),
    izakaya: createShopSignMaterial('izakaya', 'facade', aniso, trackTex, trackMat),
    cafe: createShopSignMaterial('cafe', 'facade', aniso, trackTex, trackMat),
    parking: createShopSignMaterial('parking', 'facade', aniso, trackTex, trackMat),
  };
  for (const theme of ['konbini', 'izakaya', 'cafe', 'parking'] as const) {
    emissiveDisplayMats.push({
      mat: pylonFaceMats[theme],
      dayIntensity: 0.03,
      nightIntensity: 1.15,
    });
    emissiveDisplayMats.push({
      mat: facadeFaceMats[theme],
      dayIntensity: 0.03,
      nightIntensity: 1.1,
    });
  }

  const signHaloTex = trackTex(
    createRadialGlowTexture(
      128,
      'rgba(255, 245, 220, 0.95)',
      'rgba(255, 220, 165, 0.36)',
      'rgba(255, 180, 100, 0.0)',
    ),
  );
  const signHaloMat = trackMat(
    new THREE.SpriteMaterial({
      map: signHaloTex,
      color: 0xfff0d4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }),
  );
  nightGlowMats.push({ mat: signHaloMat, maxOpacity: 0.32 });

  const pylonPoleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8));
  const pylonBoxGeo = trackGeo(new THREE.BoxGeometry(0.24, 2.2, 0.96));
  const pylonFaceGeo = trackGeo(new THREE.PlaneGeometry(0.88, 2.1));

  const facadeLegGeo = trackGeo(new THREE.CylinderGeometry(0.075, 0.085, 3.6, 8));
  const facadeBoxGeo = trackGeo(new THREE.BoxGeometry(4.8, 1.05, 0.28));
  const facadeFaceGeo = trackGeo(new THREE.PlaneGeometry(4.65, 0.94));

  for (const s of shopSigns) {
    const g = new THREE.Group();
    g.name = s.id;
    g.position.set(s.x, s.baseY, s.z);
    g.rotation.y = s.yaw;

    if (s.style === 'pylon') {
      const pole = new THREE.Mesh(pylonPoleGeo, signPoleMat);
      pole.position.set(0, 2.3, -0.58);
      g.add(pole);

      const cabinet = new THREE.Mesh(pylonBoxGeo, signFrameMat);
      cabinet.position.set(0, 3.5, 0);
      g.add(cabinet);

      // 両面発光アクリルパネル
      const faceR = new THREE.Mesh(pylonFaceGeo, pylonFaceMats[s.theme]);
      faceR.rotation.y = Math.PI / 2;
      faceR.position.set(0.125, 3.5, 0);
      g.add(faceR);

      const faceL = new THREE.Mesh(pylonFaceGeo, pylonFaceMats[s.theme]);
      faceL.rotation.y = -Math.PI / 2;
      faceL.position.set(-0.125, 3.5, 0);
      g.add(faceL);

      const halo = new THREE.Sprite(signHaloMat);
      halo.position.set(0, 3.5, 0);
      halo.scale.set(3.2, 3.2, 1);
      halo.visible = false;
      g.add(halo);
      nightGlowMeshes.push(halo);

      addCollider(s.id, s.x, s.z, 0.34, 0.34, 0, s.baseY, s.baseY + 4.6);
    } else {
      for (const lx of [-2.0, 2.0]) {
        const leg = new THREE.Mesh(facadeLegGeo, signPoleMat);
        leg.position.set(lx, 1.8, 0);
        g.add(leg);
      }

      const cabinet = new THREE.Mesh(facadeBoxGeo, signFrameMat);
      cabinet.position.set(0, 3.45, 0);
      g.add(cabinet);

      const faceF = new THREE.Mesh(facadeFaceGeo, facadeFaceMats[s.theme]);
      faceF.position.set(0, 3.45, 0.145);
      g.add(faceF);

      const faceB = new THREE.Mesh(facadeFaceGeo, facadeFaceMats[s.theme]);
      faceB.rotation.y = Math.PI;
      faceB.position.set(0, 3.45, -0.145);
      g.add(faceB);

      const halo = new THREE.Sprite(signHaloMat);
      halo.position.set(0, 3.45, 0);
      halo.scale.set(4.2, 2.4, 1);
      halo.visible = false;
      g.add(halo);
      nightGlowMeshes.push(halo);

      addCollider(s.id, s.x, s.z, 4.4, 0.36, s.yaw, s.baseY, s.baseY + 3.9);
    }

    root.add(g);
  }

  // =========================================================================
  // 3. 白いスチール製ガードレール（歩道境界・外周カーブ、InstancedMesh + 低めコリジョン）
  // =========================================================================
  const guardrailRuns = buildGuardrailLayout(swY);
  const reflectorMat = buildInstancedGuardrails(
    root,
    guardrailRuns,
    trackGeo,
    trackMat,
    addCollider,
  );
  emissiveDisplayMats.push({
    mat: reflectorMat,
    dayIntensity: 0.0,
    nightIntensity: 1.35,
  });

  // =========================================================================
  // 4. 日本の道路標識（止まれ・制限速度40/60・横断歩道・カーブシェブロン）
  // =========================================================================
  const roadSigns = buildRoadSignLayout(swY);
  const chevronMat = buildJapaneseRoadSigns(
    root,
    roadSigns,
    aniso,
    trackGeo,
    trackMat,
    trackTex,
    addCollider,
  );
  emissiveDisplayMats.push({
    mat: chevronMat,
    dayIntensity: 0.0,
    nightIntensity: 0.95,
  });

  // =========================================================================
  // 5. 街路樹・公園樹木（InstancedMesh 5ドローコール + 幹 OBB コライダー）
  // =========================================================================
  const trees = buildTreeLayout(swY);
  buildInstancedTrees(
    root,
    trees,
    aniso,
    trackGeo,
    trackMat,
    trackTex,
    addCollider,
  );

  // =========================================================================
  // 6. 昼・夕方・夜ライティング連動制御
  // =========================================================================
  let lastNightFactor = -1;
  const setNightFactor = (factor: number): void => {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - lastNightFactor) < 0.004) return;
    lastNightFactor = clamped;

    const isLit = clamped > 0.03;

    for (let i = 0; i < emissiveDisplayMats.length; i += 1) {
      const entry = emissiveDisplayMats[i];
      entry.mat.emissiveIntensity =
        entry.dayIntensity +
        (entry.nightIntensity - entry.dayIntensity) * clamped;
    }

    for (let i = 0; i < nightGlowMats.length; i += 1) {
      const gm = nightGlowMats[i];
      (gm.mat as THREE.MeshBasicMaterial | THREE.SpriteMaterial).opacity =
        clamped * gm.maxOpacity;
    }

    for (let i = 0; i < nightGlowMeshes.length; i += 1) {
      nightGlowMeshes[i].visible = isLit;
    }
  };

  setNightFactor(0);

  return {
    group: root,
    setNightFactor,
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
      emissiveDisplayMats.length = 0;
      nightGlowMeshes.length = 0;
      nightGlowMats.length = 0;
    },
  };
}

// ===========================================================================
// ガードレール配置・InstancedMesh 構築
// ===========================================================================

function buildGuardrailLayout(swY: number): GuardrailRun[] {
  const runs: GuardrailRun[] = [];
  const gEdge = 6.35; // 歩道縁石の内側へオフセット（車道端6.0mとの接触回避＆歩道動線7.2..9.5mと非干渉）

  // 1. 内側コア市街地の歩道・車道境界（交差点・横断歩道 ±14.5m および駐車/運転車両ドア付近は広く開放）
  // 北通り (z < 0) — Porsche (-4.2, -22) 付近 z=-27..-14.5 を開放
  runs.push(
    { id: 'gr_in_nw1', x0: -gEdge, z0: -76, x1: -gEdge, z1: -27, baseY: swY },
    { id: 'gr_in_ne1', x0: gEdge, z0: -76, x1: gEdge, z1: -21, baseY: swY },
  );
  // 南通り (z > 0) — Innova (4.1, 8.5) / Bike (4.75, 14) / 駐車車付近を開放
  runs.push(
    { id: 'gr_in_sw1', x0: -gEdge, z0: 23, x1: -gEdge, z1: 76, baseY: swY },
    { id: 'gr_in_se1', x0: gEdge, z0: 19, x1: gEdge, z1: 76, baseY: swY },
  );
  // 西通り (x < 0)
  runs.push(
    { id: 'gr_in_wn1', x0: -76, z0: -gEdge, x1: -25, z1: -gEdge, baseY: swY },
    { id: 'gr_in_ws1', x0: -76, z0: gEdge, x1: -14.5, z1: gEdge, baseY: swY },
  );
  // 東通り (x > 0)
  runs.push(
    { id: 'gr_in_en1', x0: 14.5, z0: -gEdge, x1: 76, z1: -gEdge, baseY: swY },
    { id: 'gr_in_es1', x0: 23, z0: gEdge, x1: 76, z1: gEdge, baseY: swY },
  );

  // 2. 拡張幹線道路（±82..±118m、T字交差点手前にゆとり確保・公園西入口 z=-107..-97 を10m開放、南はロータリーのため省略）
  runs.push(
    { id: 'gr_ext_nw', x0: -gEdge, z0: -118, x1: -gEdge, z1: -82, baseY: 0 },
    { id: 'gr_ext_ne1', x0: gEdge, z0: -118, x1: gEdge, z1: -107, baseY: 0 },
    { id: 'gr_ext_ne2', x0: gEdge, z0: -97, x1: gEdge, z1: -82, baseY: 0 },
    { id: 'gr_ext_wn', x0: -118, z0: -gEdge, x1: -82, z1: -gEdge, baseY: 0 },
    { id: 'gr_ext_ws', x0: -118, z0: gEdge, x1: -82, z1: gEdge, baseY: 0 },
    { id: 'gr_ext_en', x0: 82, z0: -gEdge, x1: 118, z1: -gEdge, baseY: 0 },
    { id: 'gr_ext_es', x0: 82, z0: gEdge, x1: 118, z1: gEdge, baseY: 0 },
  );

  // 3. 外周道路ループの外側ガードレール（16m幅員＋緩やかなR=42m高速コーナー、路肩 0.55m オフセット）
  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 134
  const cornerR = CITY_METRICS.outerRingCornerRadius; // 42
  const halfW = CITY_METRICS.outerRingHalfWidth; // 8.0
  const outerOffset = halfW + 0.55; // 8.55 (外側直線 ±142.55m, 外側カーブ r = 50.55m)
  const innerOffset = -(halfW + 0.55); // -8.55 (内側カーブ r = 33.45m)

  // 外周直線4辺（連続）
  const straightHalf = ringSpan - cornerR; // 92
  const outEdge = ringSpan + outerOffset; // 142.55
  runs.push(
    { id: 'gr_ring_out_n', x0: -straightHalf, z0: -outEdge, x1: straightHalf, z1: -outEdge, baseY: 0, hasReflector: true },
    { id: 'gr_ring_out_s', x0: -straightHalf, z0: outEdge, x1: straightHalf, z1: outEdge, baseY: 0, hasReflector: true },
    { id: 'gr_ring_out_w', x0: -outEdge, z0: -straightHalf, x1: -outEdge, z1: straightHalf, baseY: 0, hasReflector: true },
    { id: 'gr_ring_out_e', x0: outEdge, z0: -straightHalf, x1: outEdge, z1: straightHalf, baseY: 0, hasReflector: true },
  );

  // 外周内側直線（4方向T字交差点 ±16m と 公園北入口 x∈[48,62] を広く開放）
  const inEdge = ringSpan - outerOffset; // 125.45
  runs.push(
    { id: 'gr_ring_in_n1', x0: -straightHalf, z0: -inEdge, x1: -16, z1: -inEdge, baseY: 0 },
    { id: 'gr_ring_in_n2', x0: 16, z0: -inEdge, x1: 48, z1: -inEdge, baseY: 0 },
    { id: 'gr_ring_in_n3', x0: 62, z0: -inEdge, x1: straightHalf, z1: -inEdge, baseY: 0 },
    { id: 'gr_ring_in_s1', x0: -straightHalf, z0: inEdge, x1: -16, z1: inEdge, baseY: 0 },
    { id: 'gr_ring_in_s2', x0: 16, z0: inEdge, x1: straightHalf, z1: inEdge, baseY: 0 },
    { id: 'gr_ring_in_w1', x0: -inEdge, z0: -straightHalf, x1: -inEdge, z1: -16, baseY: 0 },
    { id: 'gr_ring_in_w2', x0: -inEdge, z0: 16, x1: -inEdge, z1: straightHalf, baseY: 0 },
    { id: 'gr_ring_in_e1', x0: inEdge, z0: -straightHalf, x1: inEdge, z1: -16, baseY: 0 },
    { id: 'gr_ring_in_e2', x0: inEdge, z0: 16, x1: inEdge, z1: straightHalf, baseY: 0 },
  );

  // 外周4コーナー曲線ガードレール（12分割で高速コーナーに沿った滑らかな曲線＋コリジョン）
  const cornerArcSegs = 12;
  const loopArcs = sampleRoundedLoopPoints(ringSpan, cornerR, cornerArcSegs);
  const ptsPerCorner = cornerArcSegs + 1;
  for (let c = 0; c < 4; c += 1) {
    const startIdx = c * ptsPerCorner;
    for (let i = 0; i < ptsPerCorner - 1; i += 1) {
      const p0 = loopArcs[startIdx + i];
      const p1 = loopArcs[startIdx + i + 1];
      runs.push({
        id: `gr_ring_oc_${c}_${i}`,
        x0: p0.x + p0.nx * outerOffset,
        z0: p0.z + p0.nz * outerOffset,
        x1: p1.x + p1.nx * outerOffset,
        z1: p1.z + p1.nz * outerOffset,
        baseY: 0,
        hasReflector: true,
      });
      runs.push({
        id: `gr_ring_ic_${c}_${i}`,
        x0: p0.x + p0.nx * innerOffset,
        z0: p0.z + p0.nz * innerOffset,
        x1: p1.x + p1.nx * innerOffset,
        z1: p1.z + p1.nz * innerOffset,
        baseY: 0,
      });
    }
  }

  return runs;
}

function buildInstancedGuardrails(
  parent: THREE.Group,
  runs: readonly GuardrailRun[],
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
): THREE.MeshStandardMaterial {
  const whiteSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeef1f5,
      roughness: 0.36,
      metalness: 0.48,
    }),
  );
  const postMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9dfe6,
      roughness: 0.44,
      metalness: 0.56,
    }),
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffb703,
      emissive: REFLECTOR_EMISSIVE.clone(),
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );

  const posts: Array<{ x: number; y: number; z: number; reflector: boolean }> = [];
  const beams: Array<{
    x: number;
    y: number;
    z: number;
    len: number;
    ry: number;
  }> = [];

  for (const r of runs) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) continue;
    const ry = Math.atan2(dx, dz);
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;

    beams.push({ x: cx, y: r.baseY, z: cz, len: len + 0.08, ry });

    // 車両が歩道・路外へ乗り上げすぎない低め OBB コライダー（高さ 0.82m < カメラ遮蔽閾値 1.2m）
    addCollider(r.id, cx, cz, 0.28, len, ry, r.baseY, r.baseY + 0.82);

    const postSpacing = 3.0;
    const postCount = Math.max(2, Math.round(len / postSpacing) + 1);
    for (let i = 0; i < postCount; i += 1) {
      const t = i / (postCount - 1);
      posts.push({
        x: r.x0 + dx * t,
        y: r.baseY,
        z: r.z0 + dz * t,
        reflector: Boolean(r.hasReflector) && i % 2 === 0,
      });
    }
  }

  // 日本式2段波型スチールビーム（上リブ・下リブを2インスタンスで立体表現）
  const beamGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.13, 1.0));
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.06, 0.78, 6));
  const reflGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.09, 0.09));

  const beamInst = new THREE.InstancedMesh(
    beamGeo,
    whiteSteelMat,
    beams.length * 2,
  );
  const postInst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  const reflectorPosts = posts.filter((p) => p.reflector);
  const reflInst = new THREE.InstancedMesh(
    reflGeo,
    reflectorMat,
    Math.max(1, reflectorPosts.length),
  );

  const dummy = new THREE.Object3D();
  let bIdx = 0;
  for (const b of beams) {
    for (const h of [0.48, 0.68]) {
      dummy.position.set(b.x, b.y + h, b.z);
      dummy.rotation.set(0, b.ry, 0);
      dummy.scale.set(1, 1, b.len);
      dummy.updateMatrix();
      beamInst.setMatrixAt(bIdx, dummy.matrix);
      bIdx += 1;
    }
  }
  beamInst.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < posts.length; i += 1) {
    const p = posts[i];
    dummy.position.set(p.x, p.y + 0.39, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(i, dummy.matrix);
  }
  postInst.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < reflectorPosts.length; i += 1) {
    const p = reflectorPosts[i];
    dummy.position.set(p.x, p.y + 0.83, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    reflInst.setMatrixAt(i, dummy.matrix);
  }
  reflInst.count = reflectorPosts.length;
  reflInst.instanceMatrix.needsUpdate = true;

  parent.add(beamInst, postInst, reflInst);
  return reflectorMat;
}

// ===========================================================================
// 日本の道路標識（止まれ・制限速度40/60・横断歩道・カーブシェブロン）
// ===========================================================================

function buildRoadSignLayout(swY: number): RoadSignSpec[] {
  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 134
  const cornerR = CITY_METRICS.outerRingCornerRadius; // 42
  const halfW = CITY_METRICS.outerRingHalfWidth; // 8.0
  const ringOuterSign = ringSpan + halfW + 0.95; // 142.95 (外周ガードレール直後の歩道縁)

  const signs: RoadSignSpec[] = [
    // 内側市街地：横断歩道・制限速度40（すべて歩道縁石ライン ±6.45m へ整列し歩道中央を開放）
    { id: 'rs_cw_nw', x: -6.45, z: -12.6, yaw: Math.PI, baseY: swY, type: 'crosswalk' },
    { id: 'rs_cw_se', x: 6.45, z: 12.6, yaw: 0, baseY: swY, type: 'crosswalk' },
    { id: 'rs_cw_sw', x: -12.6, z: 6.45, yaw: -Math.PI / 2, baseY: swY, type: 'crosswalk' },
    { id: 'rs_cw_ne', x: 12.6, z: -6.45, yaw: Math.PI / 2, baseY: swY, type: 'crosswalk' },
    { id: 'rs_spd40_n', x: 6.45, z: -36.0, yaw: 0, baseY: swY, type: 'speed40' },
    { id: 'rs_spd40_s', x: -6.45, z: 36.0, yaw: Math.PI, baseY: swY, type: 'speed40' },
    { id: 'rs_spd40_w', x: -38.0, z: -6.45, yaw: -Math.PI / 2, baseY: swY, type: 'speed40' },
    { id: 'rs_spd40_e', x: 38.0, z: 6.45, yaw: Math.PI / 2, baseY: swY, type: 'speed40' },
    // 拡張T字路合流手前の「止まれ」標識（横断歩道 ±123.6m の手前 ±120.5m・縁石 ±6.45m へ整列）
    { id: 'rs_stop_n', x: -6.45, z: -120.5, yaw: 0, baseY: 0, type: 'tomare' },
    { id: 'rs_stop_s', x: 6.45, z: 121.2, yaw: Math.PI, baseY: 0, type: 'tomare' },
    { id: 'rs_stop_w', x: -120.5, z: 6.45, yaw: Math.PI / 2, baseY: 0, type: 'tomare' },
    { id: 'rs_stop_e', x: 120.5, z: -6.45, yaw: -Math.PI / 2, baseY: 0, type: 'tomare' },
    // 外周道路の制限速度60標識
    { id: 'rs_spd60_n', x: -42, z: -ringOuterSign, yaw: Math.PI / 2, baseY: 0, type: 'speed60' },
    { id: 'rs_spd60_s', x: 42, z: ringOuterSign, yaw: -Math.PI / 2, baseY: 0, type: 'speed60' },
    { id: 'rs_spd60_w', x: -ringOuterSign, z: 42, yaw: Math.PI, baseY: 0, type: 'speed60' },
    { id: 'rs_spd60_e', x: ringOuterSign, z: -42, yaw: 0, baseY: 0, type: 'speed60' },
  ];

  // 外周道路4コーナーの外側に視認性抜群の黒黄シェブロン（カーブ誘導標識）を各4基ずつ配置
  const s = ringSpan - cornerR; // 92
  const chevronRadius = cornerR + halfW + 1.1; // 51.1 (コーナー外側ガードレール 50.55m の外側)

  const cornerDefs: ReadonlyArray<{
    cx: number;
    cz: number;
    a0: number;
    a1: number;
  }> = [
    { cx: s, cz: -s, a0: -Math.PI / 2, a1: 0 },
    { cx: s, cz: s, a0: 0, a1: Math.PI / 2 },
    { cx: -s, cz: s, a0: Math.PI / 2, a1: Math.PI },
    { cx: -s, cz: -s, a0: Math.PI, a1: Math.PI * 1.5 },
  ];
  for (let c = 0; c < cornerDefs.length; c += 1) {
    const cd = cornerDefs[c];
    for (let k = 1; k <= 4; k += 1) {
      const t = k / 5;
      const a = cd.a0 + (cd.a1 - cd.a0) * t;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const x = cd.cx + nx * chevronRadius;
      const z = cd.cz + nz * chevronRadius;
      // コーナー内側（走行車両側）へ向ける
      const yaw = Math.atan2(-nx, -nz);
      signs.push({
        id: `rs_chev_${c}_${k}`,
        x,
        z,
        yaw,
        baseY: 0,
        type: 'chevron',
      });
    }
  }

  return signs;
}

function buildJapaneseRoadSigns(
  parent: THREE.Group,
  signs: readonly RoadSignSpec[],
  aniso: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  trackTex: <T extends THREE.Texture>(t: T) => T,
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
): THREE.MeshStandardMaterial {
  const poleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa6aeb8,
      roughness: 0.42,
      metalness: 0.68,
    }),
  );
  const backMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6c747e,
      roughness: 0.55,
      metalness: 0.5,
    }),
  );

  const tomareMat = createRoadSignPlateMaterial('tomare', aniso, trackTex, trackMat);
  const speed40Mat = createRoadSignPlateMaterial('speed40', aniso, trackTex, trackMat);
  const speed60Mat = createRoadSignPlateMaterial('speed60', aniso, trackTex, trackMat);
  const crosswalkMat = createRoadSignPlateMaterial('crosswalk', aniso, trackTex, trackMat);
  const chevronMat = createRoadSignPlateMaterial('chevron', aniso, trackTex, trackMat);

  // 全標識の支柱を 1 InstancedMesh で描画
  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.042, 2.75, 6));
  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, signs.length);
  const dummy = new THREE.Object3D();

  const plateBackGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.68, 0.035));
  const plateFaceGeo = trackGeo(new THREE.PlaneGeometry(0.66, 0.66));
  const chevBoxGeo = trackGeo(new THREE.BoxGeometry(0.86, 0.64, 0.05));
  const chevFaceGeo = trackGeo(new THREE.PlaneGeometry(0.84, 0.62));

  for (let i = 0; i < signs.length; i += 1) {
    const s = signs[i];
    const poleH = s.type === 'chevron' ? 1.55 : 2.75;
    dummy.position.set(s.x, s.baseY + poleH * 0.5, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, poleH / 2.75, 1);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    const g = new THREE.Group();
    g.position.set(s.x, s.baseY + (s.type === 'chevron' ? 1.48 : 2.55), s.z);
    g.rotation.y = s.yaw;

    if (s.type === 'chevron') {
      const box = new THREE.Mesh(chevBoxGeo, backMat);
      g.add(box);
      const face = new THREE.Mesh(chevFaceGeo, chevronMat);
      face.position.z = 0.028;
      g.add(face);
    } else {
      const mat =
        s.type === 'tomare'
          ? tomareMat
          : s.type === 'speed40'
            ? speed40Mat
            : s.type === 'speed60'
              ? speed60Mat
              : crosswalkMat;
      const box = new THREE.Mesh(plateBackGeo, backMat);
      g.add(box);
      const face = new THREE.Mesh(plateFaceGeo, mat);
      face.position.z = 0.02;
      g.add(face);
    }
    parent.add(g);

    addCollider(s.id, s.x, s.z, 0.18, 0.18, 0, s.baseY, s.baseY + poleH);
  }

  poleInst.instanceMatrix.needsUpdate = true;
  parent.add(poleInst);
  return chevronMat;
}

// ===========================================================================
// 街路樹・公園樹木配置・InstancedMesh 構築
// ===========================================================================

function buildTreeLayout(swY: number): TreeSpec[] {
  const trees: TreeSpec[] = [];
  const leafTints = [0x3d7238, 0x4b803f, 0x366634, 0x568944, 0x44783c];
  let idx = 0;

  const pushTree = (
    x: number,
    z: number,
    baseY: number,
    scale: number,
    hasPit: boolean,
  ) => {
    const tintHex = leafTints[idx % leafTints.length];
    const yaw = ((idx * 137.5) % 360) * (Math.PI / 180);
    trees.push({
      id: `jp_tree_${idx}`,
      x,
      z,
      baseY,
      scale,
      yaw,
      hasPit,
      tintHex,
    });
    idx += 1;
  };

  // 1. 内側コア市街地の歩道街路樹（建物・歩行者±7.2/9.5・街灯±6.45と非干渉な外側帯 ±10.2m）
  const innerStreetCoords: ReadonlyArray<[number, number]> = [
    [-10.4, -50],
    [-10.4, -66],
    [10.4, -42],
    [10.4, -64],
    [-10.4, 52],
    [-10.4, 68],
    [10.4, 38],
    [10.4, 62],
    [-46, -10.4],
    [-64, -10.4],
    [-44, 10.4],
    [-64, 10.4],
    [48, -10.4],
    [66, -10.4],
    [48, 10.4],
    [66, 10.4],
  ];
  for (const [x, z] of innerStreetCoords) {
    pushTree(x, z, swY, 0.92 + (idx % 3) * 0.08, true);
  }

  // 2. 都市公園エリア（さくら中央公園: x∈[14,96], z∈[-120,-84]、遊歩道と中央噴水を避けて配置）
  const parkTreeCoords: ReadonlyArray<[number, number, number]> = [
    [19, -116, 1.15],
    [28, -115, 1.05],
    [41, -116, 1.2],
    [69, -116, 1.15],
    [82, -115, 1.08],
    [91, -116, 1.18],
    [19, -88, 1.12],
    [29, -89, 1.0],
    [42, -88, 1.18],
    [68, -88, 1.1],
    [81, -89, 1.06],
    [91, -88, 1.16],
    [25, -109, 0.96],
    [39, -109, 1.05],
    [71, -109, 1.08],
    [85, -109, 0.98],
    [25, -95, 1.04],
    [39, -95, 0.95],
    [71, -95, 1.02],
    [85, -95, 1.1],
  ];
  for (const [x, z, sc] of parkTreeCoords) {
    pushTree(x, z, 0, sc, false);
  }

  // 3. 駅前ロータリー広場（広場周囲の並木）
  const plazaTreeCoords: ReadonlyArray<[number, number]> = [
    [-39, 86],
    [-20, 86],
    [20, 86],
    [39, 86],
    [-39, 118],
    [39, 118],
    [38, 104],
  ];
  for (const [x, z] of plazaTreeCoords) {
    pushTree(x, z, 0, 1.02, true);
  }

  // 4. 外周道路ループ沿いの並木（外側歩道の外縁へ整列し、歩道中央を開放）
  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 134
  const outerVerge =
    ringSpan +
    CITY_METRICS.outerRingHalfWidth +
    CITY_METRICS.outerRingOuterSidewalkWidth -
    0.55; // 145.45 (外側歩道 142..146m の外縁)
  for (const coord of [-84, -56, -28, 28, 56, 84]) {
    pushTree(coord, -outerVerge, 0, 1.05 + (idx % 3) * 0.09, true);
    pushTree(coord, outerVerge, 0, 1.05 + (idx % 3) * 0.09, true);
    pushTree(-outerVerge, coord, 0, 1.05 + (idx % 3) * 0.09, true);
    pushTree(outerVerge, coord, 0, 1.05 + (idx % 3) * 0.09, true);
  }

  // コーナー外側の街路樹（4コーナー各3本、外側歩道外縁に整列）
  const s = ringSpan - CITY_METRICS.outerRingCornerRadius; // 92
  const treeArcR =
    CITY_METRICS.outerRingCornerRadius +
    CITY_METRICS.outerRingHalfWidth +
    CITY_METRICS.outerRingOuterSidewalkWidth -
    0.4; // 53.6
  const corners: ReadonlyArray<[number, number, number, number]> = [
    [s, -s, -Math.PI / 2, 0],
    [s, s, 0, Math.PI / 2],
    [-s, s, Math.PI / 2, Math.PI],
    [-s, -s, Math.PI, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0, a1] of corners) {
    for (const f of [0.22, 0.5, 0.78]) {
      const a = a0 + (a1 - a0) * f;
      pushTree(cx + Math.cos(a) * treeArcR, cz + Math.sin(a) * treeArcR, 0, 1.14, false);
    }
  }

  return trees;
}

function buildInstancedTrees(
  parent: THREE.Group,
  trees: readonly TreeSpec[],
  aniso: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  trackTex: <T extends THREE.Texture>(t: T) => T,
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
  const barkTex = trackTex(createBarkTexture(aniso));
  const barkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: barkTex,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const foliageTex = trackTex(createFoliageTexture(aniso));
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: foliageTex,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.0,
    }),
  );
  const pitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d574f,
      roughness: 0.94,
      metalness: 0.04,
    }),
  );

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.22, 2.8, 7));
  const pitGeo = trackGeo(new THREE.BoxGeometry(1.25, 0.06, 1.25));
  const crownGeoA = trackGeo(createOrganicCanopyGeometry(1.55, 11));
  const crownGeoB = trackGeo(createOrganicCanopyGeometry(1.25, 29));
  const crownGeoC = trackGeo(createOrganicCanopyGeometry(1.05, 53));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const crownAInst = new THREE.InstancedMesh(crownGeoA, foliageMat, trees.length);
  const crownBInst = new THREE.InstancedMesh(crownGeoB, foliageMat, trees.length);
  const crownCInst = new THREE.InstancedMesh(crownGeoC, foliageMat, trees.length);

  const pitTrees = trees.filter((t) => t.hasPit);
  const pitInst = new THREE.InstancedMesh(
    pitGeo,
    pitMat,
    Math.max(1, pitTrees.length),
  );

  const dummy = new THREE.Object3D();
  const colorScratch = new THREE.Color();

  for (let i = 0; i < trees.length; i += 1) {
    const t = trees[i];
    const sc = t.scale;

    // 幹
    dummy.position.set(t.x, t.baseY + 1.4 * sc, t.z);
    dummy.rotation.set(0, t.yaw, 0);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    // 下段主樹冠
    dummy.position.set(t.x, t.baseY + 3.45 * sc, t.z);
    dummy.rotation.set(0, t.yaw, 0);
    dummy.scale.set(1.12 * sc, 0.88 * sc, 1.08 * sc);
    dummy.updateMatrix();
    crownAInst.setMatrixAt(i, dummy.matrix);
    colorScratch.setHex(t.tintHex);
    crownAInst.setColorAt(i, colorScratch);

    // 中段オフセット樹冠
    const cCos = Math.cos(t.yaw);
    const cSin = Math.sin(t.yaw);
    dummy.position.set(
      t.x + cCos * 0.55 * sc,
      t.baseY + 4.35 * sc,
      t.z + cSin * 0.55 * sc,
    );
    dummy.rotation.set(0, t.yaw + 1.1, 0);
    dummy.scale.set(1.0 * sc, 0.92 * sc, 1.0 * sc);
    dummy.updateMatrix();
    crownBInst.setMatrixAt(i, dummy.matrix);
    colorScratch.setHex(t.tintHex).offsetHSL(0.015, 0.03, 0.04);
    crownBInst.setColorAt(i, colorScratch);

    // 上段頂部樹冠
    dummy.position.set(
      t.x - cCos * 0.35 * sc,
      t.baseY + 4.95 * sc,
      t.z - cSin * 0.35 * sc,
    );
    dummy.rotation.set(0, t.yaw + 2.3, 0);
    dummy.scale.set(0.95 * sc, 0.86 * sc, 0.95 * sc);
    dummy.updateMatrix();
    crownCInst.setMatrixAt(i, dummy.matrix);
    colorScratch.setHex(t.tintHex).offsetHSL(-0.01, 0.02, 0.07);
    crownCInst.setColorAt(i, colorScratch);

    // 幹のみのスリムな OBB コライダー（高い樹冠は通過可能）
    addCollider(t.id, t.x, t.z, 0.44 * sc, 0.44 * sc, 0, t.baseY, t.baseY + 3.0 * sc);
  }

  for (let i = 0; i < pitTrees.length; i += 1) {
    const t = pitTrees[i];
    dummy.position.set(t.x, t.baseY + 0.03, t.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pitInst.setMatrixAt(i, dummy.matrix);
  }
  pitInst.count = pitTrees.length;

  trunkInst.instanceMatrix.needsUpdate = true;
  crownAInst.instanceMatrix.needsUpdate = true;
  crownBInst.instanceMatrix.needsUpdate = true;
  crownCInst.instanceMatrix.needsUpdate = true;
  pitInst.instanceMatrix.needsUpdate = true;
  if (crownAInst.instanceColor) crownAInst.instanceColor.needsUpdate = true;
  if (crownBInst.instanceColor) crownBInst.instanceColor.needsUpdate = true;
  if (crownCInst.instanceColor) crownCInst.instanceColor.needsUpdate = true;

  parent.add(trunkInst, crownAInst, crownBInst, crownCInst, pitInst);
}

/** 決定論的ノイズで有機的に凹凸を付けた樹冠ジオメトリを生成（ローポリ箱・平面回避） */
function createOrganicCanopyGeometry(
  radius: number,
  seedOffset: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const wave =
      Math.sin(vx * 2.7 + seedOffset) *
      Math.cos(vy * 3.1 + seedOffset * 0.7) *
      Math.sin(vz * 2.5 - seedOffset * 0.4);
    const factor = 1.0 + wave * 0.16;
    pos.setXYZ(i, vx * factor, vy * factor * 0.92, vz * factor);
  }
  geo.computeVertexNormals();
  return geo;
}

// ===========================================================================
// テクスチャ生成ユーティリティ（自販機・看板・道路標識・樹皮・葉）
// ===========================================================================

function createVendingDisplayMaterial(
  theme: VendingTheme,
  aniso: number,
  trackTex: <T extends THREE.Texture>(t: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
): THREE.MeshStandardMaterial {
  const w = 256;
  const h = 256;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const dCtx = diffCanvas.getContext('2d');

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = w;
  emisCanvas.height = h;
  const eCtx = emisCanvas.getContext('2d');

  const headerColor =
    theme === 'blue' ? '#0ea5e9' : theme === 'red' ? '#ef4444' : '#22c55e';
  const bottleColors =
    theme === 'blue'
      ? ['#38bdf8', '#0284c7', '#e0f2fe', '#facc15', '#34d399', '#fb923c']
      : theme === 'red'
        ? ['#dc2626', '#f97316', '#f8fafc', '#fbbf24', '#22c55e', '#38bdf8']
        : ['#22c55e', '#84cc16', '#f5f5f4', '#eab308', '#38bdf8', '#b45309'];

  for (const ctx of [dCtx, eCtx]) {
    if (!ctx) continue;
    const isEmissive = ctx === eCtx;
    // 背景
    ctx.fillStyle = isEmissive ? '#080c12' : '#1e293b';
    ctx.fillRect(0, 0, w, h);

    // 上部ドリンクディスプレイ窓（夜間に白飛びせずカラフルな飲料棚が映える適度な白バックライト）
    ctx.fillStyle = isEmissive ? '#cde4f5' : '#f1f5f9';
    ctx.fillRect(10, 10, w - 20, 152);

    // 3段のドリンク棚＋カラフルな缶・ペットボトル
    for (let row = 0; row < 3; row += 1) {
      const shelfY = 16 + row * 48;
      // 棚下段の価格・ボタン帯（赤「あったか〜い」/ 青「つめた〜い」）
      ctx.fillStyle = row === 2 ? '#ef4444' : '#0284c7';
      ctx.fillRect(14, shelfY + 34, w - 28, 10);

      for (let col = 0; col < 7; col += 1) {
        const bx = 20 + col * 31;
        ctx.fillStyle = bottleColors[(row * 3 + col) % bottleColors.length];
        ctx.fillRect(bx, shelfY + 4, 20, 28);
        // ラベル白帯
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(bx + 2, shelfY + 12, 16, 8);
      }
    }

    // 中段ブランドバナー＆コイン投入口
    ctx.fillStyle = headerColor;
    ctx.fillRect(10, 170, w - 20, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      theme === 'blue' ? 'DRINK 24H' : theme === 'red' ? 'COLD & HOT' : 'GREEN TEA',
      w * 0.5,
      183,
    );

    // 下段取り出し口フラップ（発光しない暗い金属面）
    ctx.fillStyle = isEmissive ? '#000000' : '#0f172a';
    ctx.fillRect(18, 204, w - 36, 42);
    if (!isEmissive) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 204, w - 36, 42);
    }
  }

  const mapTex = trackTex(new THREE.CanvasTexture(diffCanvas));
  mapTex.anisotropy = aniso;
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.needsUpdate = true;

  const emisTex = trackTex(new THREE.CanvasTexture(emisCanvas));
  emisTex.anisotropy = aniso;
  emisTex.colorSpace = THREE.SRGBColorSpace;
  emisTex.needsUpdate = true;

  return trackMat(
    new THREE.MeshStandardMaterial({
      map: mapTex,
      emissiveMap: emisTex,
      emissive: WHITE_COLOR.clone(),
      emissiveIntensity: 0.02,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
}

function createShopSignMaterial(
  theme: SignTheme,
  style: 'pylon' | 'facade',
  aniso: number,
  trackTex: <T extends THREE.Texture>(t: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = style === 'facade' ? 512 : 256;
  canvas.height = style === 'facade' ? 128 : 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const w = canvas.width;
    const h = canvas.height;
    if (theme === 'konbini') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      if (style === 'facade') {
        // 日本のコンビニ風トリコロール帯
        ctx.fillStyle = '#f97316';
        ctx.fillRect(0, 8, w, 18);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(0, 30, w, 22);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, h - 22, w, 14);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 42px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('24H  MART  コンビニ', w * 0.5, h * 0.62);
      } else {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(0, 16, w, 32);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(0, 56, w, 36);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, h - 56, w, 32);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 54px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('24H', w * 0.5, 175);
        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText('MART', w * 0.5, 255);
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('酒・たばこ', w * 0.5, 345);
        ctx.fillText('ATM', w * 0.5, 405);
      }
    } else if (theme === 'izakaya') {
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#fef9c3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (style === 'facade') {
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('お食事処  ・  ラーメン  居酒屋', w * 0.5, h * 0.52);
      } else {
        ctx.font = 'bold 64px sans-serif';
        const chars = ['居', '酒', '屋', '味', '処'];
        for (let i = 0; i < chars.length; i += 1) {
          ctx.fillText(chars[i], w * 0.5, 78 + i * 88);
        }
      }
    } else if (theme === 'cafe') {
      ctx.fillStyle = '#292524';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = '#fef3c7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (style === 'facade') {
        ctx.font = 'bold 46px sans-serif';
        ctx.fillText('COFFEE & BAKERY  珈琲館', w * 0.5, h * 0.52);
      } else {
        ctx.font = 'bold 48px sans-serif';
        ctx.fillText('CAFE', w * 0.5, 130);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 54px sans-serif';
        ctx.fillText('珈琲', w * 0.5, 255);
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('BAKERY', w * 0.5, 375);
      }
    } else {
      // parking
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 160px sans-serif';
      ctx.fillText('P', w * 0.5, h * 0.36);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 52px sans-serif';
      ctx.fillText('24H 空', w * 0.5, h * 0.72);
    }
  }

  const tex = trackTex(new THREE.CanvasTexture(canvas));
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return trackMat(
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: WHITE_COLOR.clone(),
      emissiveIntensity: 0.04,
      roughness: 0.28,
      metalness: 0.06,
    }),
  );
}

function createRoadSignPlateMaterial(
  type: RoadSignType,
  aniso: number,
  trackTex: <T extends THREE.Texture>(t: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
): THREE.MeshStandardMaterial {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const c = size * 0.5;
    if (type === 'tomare') {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 0, size, size);
      // 日本の「止まれ」逆三角形
      ctx.beginPath();
      ctx.moveTo(16, 26);
      ctx.lineTo(size - 16, 26);
      ctx.lineTo(c, size - 18);
      ctx.closePath();
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('止まれ', c, 94);
    } else if (type === 'speed40' || type === 'speed60') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(c, c, 114, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 24;
      ctx.strokeStyle = '#dc2626';
      ctx.stroke();

      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 104px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(type === 'speed40' ? '40' : '60', c, c + 6);
    } else if (type === 'crosswalk') {
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, size - 20, size - 20);
      // 横断歩道ストライプ＋歩行者アイコン
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(36 + i * 50, 184, 34, 36);
      }
      ctx.beginPath();
      ctx.arc(c, 74, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(c - 14, 100, 28, 52);
      ctx.fillRect(c - 32, 110, 64, 14);
      ctx.fillRect(c - 22, 148, 14, 32);
      ctx.fillRect(c + 8, 148, 14, 32);
    } else {
      // chevron (黒黄カーブ誘導標識)
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(48, 24);
      ctx.lineTo(132, 24);
      ctx.lineTo(212, c);
      ctx.lineTo(132, size - 24);
      ctx.lineTo(48, size - 24);
      ctx.lineTo(128, c);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = trackTex(new THREE.CanvasTexture(canvas));
  tex.anisotropy = aniso;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  return trackMat(
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: type === 'chevron' ? tex : null,
      emissive: type === 'chevron' ? WHITE_COLOR.clone() : UNLIT_COLOR.clone(),
      emissiveIntensity: 0,
      roughness: 0.35,
      metalness: 0.12,
    }),
  );
}

function createBarkTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#534336';
    ctx.fillRect(0, 0, size, size);
    let seed = 3141;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 420; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const h = 16 + rand() * 44;
      const v = Math.floor(55 + rand() * 42);
      ctx.fillStyle = `rgb(${v + 12}, ${v + 4}, ${v - 6})`;
      ctx.fillRect(x, y, 2 + rand() * 3, h);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFoliageTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#a2c29c';
    ctx.fillRect(0, 0, size, size);
    let seed = 8821;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 950; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 3 + rand() * 7;
      const shade = Math.floor(135 + rand() * 95);
      ctx.fillStyle = `rgb(${Math.floor(shade * 0.85)}, ${shade}, ${Math.floor(shade * 0.78)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
