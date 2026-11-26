import * as THREE from 'three';
import { createRadialGlowTexture } from '../world/streetLights';
import type { VehicleType } from './vehicleConfig';
import type { VehicleDimensions } from './vehicleModel';

export interface VehicleLightRig {
  group: THREE.Group;
  /** 0 = 消灯（昼）, 0.8 = 夕方, 1.0 = 夜（全灯） */
  setIntensity: (factor: number) => void;
  /**
   * 5-B: 損傷によるヘッドライト・テールランプの出力倍率を設定する (0 = 消灯/破損, 1 = 正常)。
   * バイクの場合は leftMul と rightMul の平均を単一ヘッドライトへ適用する。
   */
  setDamageMultipliers: (
    leftHeadMul: number,
    rightHeadMul: number,
    tailMul: number,
  ) => void;
  dispose: () => void;
}

const HEADLIGHT_DAY_COLOR = new THREE.Color(0xc8d2dc);
const HEADLIGHT_BROKEN_COLOR = new THREE.Color(0x2b2d30);
const HEADLIGHT_EMISSIVE = new THREE.Color(0xfff4d8);
const TAILLIGHT_DAY_COLOR = new THREE.Color(0x6e1818);
const TAILLIGHT_EMISSIVE = new THREE.Color(0xff1e24);
const BLACK_COLOR = new THREE.Color(0x000000);

/**
 * 3-G / 5-B: 車両（乗用車・スポーツカー・AI交通車両）およびバイク共通の
 * ヘッドライト（白〜淡い暖色）＆テールランプ（赤）発光メッシュ＋軽量ハロー演出リグ。
 * - 車体の正規化寸法（+Z 前方、Y=0 接地）に合わせて自動配置する。
 * - 5-B にて左右ヘッドライト独立の損傷点滅・消灯（破損レンズ暗化）に対応。
 */
export function createVehicleLightRig(
  type: VehicleType,
  dimensions: VehicleDimensions,
): VehicleLightRig {
  const group = new THREE.Group();
  group.name = 'VehicleLightRig';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const leftHeadlightMat = new THREE.MeshStandardMaterial({
    color: HEADLIGHT_DAY_COLOR.clone(),
    emissive: BLACK_COLOR.clone(),
    emissiveIntensity: 0,
    roughness: 0.18,
    metalness: 0.1,
  });
  const rightHeadlightMat = new THREE.MeshStandardMaterial({
    color: HEADLIGHT_DAY_COLOR.clone(),
    emissive: BLACK_COLOR.clone(),
    emissiveIntensity: 0,
    roughness: 0.18,
    metalness: 0.1,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: TAILLIGHT_DAY_COLOR.clone(),
    emissive: BLACK_COLOR.clone(),
    emissiveIntensity: 0,
    roughness: 0.22,
    metalness: 0.1,
  });

  const headHaloTex = createRadialGlowTexture(
    64,
    'rgba(255, 250, 232, 1.0)',
    'rgba(255, 238, 192, 0.45)',
    'rgba(255, 224, 150, 0.0)',
  );
  const tailHaloTex = createRadialGlowTexture(
    64,
    'rgba(255, 72, 72, 0.95)',
    'rgba(255, 28, 36, 0.4)',
    'rgba(220, 0, 16, 0.0)',
  );
  textures.push(headHaloTex, tailHaloTex);

  const leftHeadHaloMat = new THREE.SpriteMaterial({
    map: headHaloTex,
    color: 0xfff3d4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const rightHeadHaloMat = new THREE.SpriteMaterial({
    map: headHaloTex,
    color: 0xfff3d4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const tailHaloMat = new THREE.SpriteMaterial({
    map: tailHaloTex,
    color: 0xff2c34,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });

  materials.push(
    leftHeadlightMat,
    rightHeadlightMat,
    taillightMat,
    leftHeadHaloMat,
    rightHeadHaloMat,
    tailHaloMat,
  );

  const leftHeadHalos: THREE.Sprite[] = [];
  const rightHeadHalos: THREE.Sprite[] = [];
  const tailHalos: THREE.Sprite[] = [];

  const { width, height, length } = dimensions;

  if (type === 'bike') {
    // バイク: 前方中央の丸型ヘッドライト + 後方中央のテールランプ
    const headGeo = new THREE.SphereGeometry(0.085, 12, 10);
    headGeo.scale(1.0, 1.0, 0.45);
    const tailGeo = new THREE.BoxGeometry(0.11, 0.055, 0.045);
    geometries.push(headGeo, tailGeo);

    const frontZ = length * 0.36;
    const frontY = height * 0.65;
    const headMesh = new THREE.Mesh(headGeo, leftHeadlightMat);
    headMesh.position.set(0, frontY, frontZ);
    group.add(headMesh);

    const headHalo = new THREE.Sprite(leftHeadHaloMat);
    headHalo.position.set(0, frontY, frontZ + 0.08);
    headHalo.scale.set(0.82, 0.82, 1);
    headHalo.visible = false;
    group.add(headHalo);
    leftHeadHalos.push(headHalo);

    const rearZ = -length * 0.43;
    const rearY = height * 0.56;
    const tailMesh = new THREE.Mesh(tailGeo, taillightMat);
    tailMesh.position.set(0, rearY, rearZ);
    group.add(tailMesh);

    const tailHalo = new THREE.Sprite(tailHaloMat);
    tailHalo.position.set(0, rearY, rearZ - 0.06);
    tailHalo.scale.set(0.55, 0.42, 1);
    tailHalo.visible = false;
    group.add(tailHalo);
    tailHalos.push(tailHalo);
  } else {
    // 四輪乗用車・スポーツカー・AI交通車両: 左右独立ヘッドライト + 左右テールランプ
    const isLowSports = height < 1.45;
    const headGeo = new THREE.BoxGeometry(
      Math.max(0.2, width * 0.14),
      Math.max(0.09, height * 0.075),
      0.06,
    );
    const tailGeo = new THREE.BoxGeometry(
      Math.max(0.22, width * 0.16),
      Math.max(0.08, height * 0.07),
      0.055,
    );
    geometries.push(headGeo, tailGeo);

    const headX = width * 0.34;
    const headY = height * (isLowSports ? 0.44 : 0.42);
    const headZ = length * 0.482;

    const tailX = width * 0.35;
    const tailY = height * (isLowSports ? 0.48 : 0.47);
    const tailZ = -length * 0.482;

    // +X = 左側, -X = 右側
    const sides: ReadonlyArray<{
      side: number;
      headMat: THREE.MeshStandardMaterial;
      haloMat: THREE.SpriteMaterial;
      haloList: THREE.Sprite[];
    }> = [
      {
        side: 1,
        headMat: leftHeadlightMat,
        haloMat: leftHeadHaloMat,
        haloList: leftHeadHalos,
      },
      {
        side: -1,
        headMat: rightHeadlightMat,
        haloMat: rightHeadHaloMat,
        haloList: rightHeadHalos,
      },
    ];

    for (const s of sides) {
      const headMesh = new THREE.Mesh(headGeo, s.headMat);
      headMesh.position.set(s.side * headX, headY, headZ);
      group.add(headMesh);

      const headHalo = new THREE.Sprite(s.haloMat);
      headHalo.position.set(s.side * headX, headY, headZ + 0.1);
      headHalo.scale.set(0.95, 0.72, 1);
      headHalo.visible = false;
      group.add(headHalo);
      s.haloList.push(headHalo);

      const tailMesh = new THREE.Mesh(tailGeo, taillightMat);
      tailMesh.position.set(s.side * tailX, tailY, tailZ);
      group.add(tailMesh);

      const tailHalo = new THREE.Sprite(tailHaloMat);
      tailHalo.position.set(s.side * tailX, tailY, tailZ - 0.08);
      tailHalo.scale.set(0.76, 0.52, 1);
      tailHalo.visible = false;
      group.add(tailHalo);
      tailHalos.push(tailHalo);
    }
  }

  let baseFactor = -1;
  let leftMul = 1;
  let rightMul = 1;
  let tailMul = 1;

  const applyHeadChannel = (
    mat: THREE.MeshStandardMaterial,
    haloMat: THREE.SpriteMaterial,
    halos: THREE.Sprite[],
    effective: number,
    damageMul: number,
  ): void => {
    const isBroken = damageMul < 0.08;
    mat.color.copy(isBroken ? HEADLIGHT_BROKEN_COLOR : HEADLIGHT_DAY_COLOR);
    const isLit = effective > 0.03;
    if (isLit) {
      mat.emissive.copy(HEADLIGHT_EMISSIVE);
      mat.emissiveIntensity = 1.4 + effective * 2.8;
    } else {
      mat.emissive.copy(BLACK_COLOR);
      mat.emissiveIntensity = 0;
    }
    haloMat.opacity = effective * 0.85;
    for (let i = 0; i < halos.length; i += 1) {
      halos[i].visible = isLit;
    }
  };

  const applyAll = (): void => {
    const f = Math.max(0, Math.min(1, baseFactor));
    if (type === 'bike') {
      const bikeMul = Math.max(0, Math.min(1, (leftMul + rightMul) * 0.5));
      applyHeadChannel(
        leftHeadlightMat,
        leftHeadHaloMat,
        leftHeadHalos,
        f * bikeMul,
        bikeMul,
      );
    } else {
      applyHeadChannel(
        leftHeadlightMat,
        leftHeadHaloMat,
        leftHeadHalos,
        f * leftMul,
        leftMul,
      );
      applyHeadChannel(
        rightHeadlightMat,
        rightHeadHaloMat,
        rightHeadHalos,
        f * rightMul,
        rightMul,
      );
    }

    const tailEff = f * tailMul;
    const tailLit = tailEff > 0.03;
    if (tailLit) {
      taillightMat.emissive.copy(TAILLIGHT_EMISSIVE);
      taillightMat.emissiveIntensity = 1.2 + tailEff * 2.4;
    } else {
      taillightMat.emissive.copy(BLACK_COLOR);
      taillightMat.emissiveIntensity = 0;
    }
    tailHaloMat.opacity = tailEff * 0.72;
    for (let i = 0; i < tailHalos.length; i += 1) {
      tailHalos[i].visible = tailLit;
    }
  };

  const setIntensity = (factor: number): void => {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - baseFactor) < 0.005) return;
    baseFactor = clamped;
    applyAll();
  };

  const setDamageMultipliers = (
    nextLeftHeadMul: number,
    nextRightHeadMul: number,
    nextTailMul: number,
  ): void => {
    const nl = Math.max(0, Math.min(1, nextLeftHeadMul));
    const nr = Math.max(0, Math.min(1, nextRightHeadMul));
    const nt = Math.max(0, Math.min(1, nextTailMul));
    if (
      Math.abs(nl - leftMul) < 0.01 &&
      Math.abs(nr - rightMul) < 0.01 &&
      Math.abs(nt - tailMul) < 0.01
    ) {
      return;
    }
    leftMul = nl;
    rightMul = nr;
    tailMul = nt;
    applyAll();
  };

  const dispose = (): void => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    geometries.length = 0;
    materials.length = 0;
    textures.length = 0;
    leftHeadHalos.length = 0;
    rightHeadHalos.length = 0;
    tailHalos.length = 0;
  };

  setIntensity(0);

  return {
    group,
    setIntensity,
    setDamageMultipliers,
    dispose,
  };
}
