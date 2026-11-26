import * as THREE from 'three';
import { createRadialGlowTexture } from '../world/streetLights';
import type { VehicleType } from './vehicleConfig';
import type { VehicleDimensions } from './vehicleModel';

export interface VehicleLightRig {
  group: THREE.Group;
  /** 0 = 消灯（昼）, 0.8 = 夕方, 1.0 = 夜（全灯） */
  setIntensity: (factor: number) => void;
  dispose: () => void;
}

const HEADLIGHT_DAY_COLOR = new THREE.Color(0xc8d2dc);
const HEADLIGHT_EMISSIVE = new THREE.Color(0xfff4d8);
const TAILLIGHT_DAY_COLOR = new THREE.Color(0x6e1818);
const TAILLIGHT_EMISSIVE = new THREE.Color(0xff1e24);
const BLACK_COLOR = new THREE.Color(0x000000);

/**
 * 3-G: 車両（乗用車・スポーツカー・AI交通車両）およびバイク共通の
 * ヘッドライト（白〜淡い暖色）＆テールランプ（赤）発光メッシュ＋軽量ハロー演出リグ。
 * - 車体の正規化寸法（+Z 前方、Y=0 接地）に合わせて自動配置する。
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
  const haloSprites: THREE.Sprite[] = [];

  const headlightMat = new THREE.MeshStandardMaterial({
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

  const headHaloMat = new THREE.SpriteMaterial({
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

  materials.push(headlightMat, taillightMat, headHaloMat, tailHaloMat);

  const { width, height, length } = dimensions;

  if (type === 'bike') {
    // バイク: 前方中央の丸型ヘッドライト + 後方中央のテールランプ
    const headGeo = new THREE.SphereGeometry(0.085, 12, 10);
    headGeo.scale(1.0, 1.0, 0.45);
    const tailGeo = new THREE.BoxGeometry(0.11, 0.055, 0.045);
    geometries.push(headGeo, tailGeo);

    const frontZ = length * 0.36;
    const frontY = height * 0.65;
    const headMesh = new THREE.Mesh(headGeo, headlightMat);
    headMesh.position.set(0, frontY, frontZ);
    group.add(headMesh);

    const headHalo = new THREE.Sprite(headHaloMat);
    headHalo.position.set(0, frontY, frontZ + 0.08);
    headHalo.scale.set(0.82, 0.82, 1);
    headHalo.visible = false;
    group.add(headHalo);
    haloSprites.push(headHalo);

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
    haloSprites.push(tailHalo);
  } else {
    // 四輪乗用車・スポーツカー・AI交通車両: 左右ヘッドライト + 左右テールランプ
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

    for (const side of [-1, 1]) {
      const headMesh = new THREE.Mesh(headGeo, headlightMat);
      headMesh.position.set(side * headX, headY, headZ);
      group.add(headMesh);

      const headHalo = new THREE.Sprite(headHaloMat);
      headHalo.position.set(side * headX, headY, headZ + 0.1);
      headHalo.scale.set(0.95, 0.72, 1);
      headHalo.visible = false;
      group.add(headHalo);
      haloSprites.push(headHalo);

      const tailMesh = new THREE.Mesh(tailGeo, taillightMat);
      tailMesh.position.set(side * tailX, tailY, tailZ);
      group.add(tailMesh);

      const tailHalo = new THREE.Sprite(tailHaloMat);
      tailHalo.position.set(side * tailX, tailY, tailZ - 0.08);
      tailHalo.scale.set(0.76, 0.52, 1);
      tailHalo.visible = false;
      group.add(tailHalo);
      haloSprites.push(tailHalo);
    }
  }

  let lastFactor = -1;

  const setIntensity = (factor: number): void => {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - lastFactor) < 0.005) return;
    lastFactor = clamped;

    const isLit = clamped > 0.03;
    if (isLit) {
      headlightMat.emissive.copy(HEADLIGHT_EMISSIVE);
      headlightMat.emissiveIntensity = 1.4 + clamped * 2.8;
      taillightMat.emissive.copy(TAILLIGHT_EMISSIVE);
      taillightMat.emissiveIntensity = 1.2 + clamped * 2.4;
    } else {
      headlightMat.emissive.copy(BLACK_COLOR);
      headlightMat.emissiveIntensity = 0;
      taillightMat.emissive.copy(BLACK_COLOR);
      taillightMat.emissiveIntensity = 0;
    }

    headHaloMat.opacity = clamped * 0.85;
    tailHaloMat.opacity = clamped * 0.72;
    for (let i = 0; i < haloSprites.length; i += 1) {
      haloSprites[i].visible = isLit;
    }
  };

  const dispose = (): void => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    geometries.length = 0;
    materials.length = 0;
    textures.length = 0;
    haloSprites.length = 0;
  };

  setIntensity(0);

  return {
    group,
    setIntensity,
    dispose,
  };
}
