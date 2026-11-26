import * as THREE from 'three';
import { CITY_METRICS, type CollisionWorld } from './collisionWorld';

interface StreetLightPlacement {
  id: string;
  x: number;
  z: number;
  /** アーム（+Xローカル方向）を車道中心へ向ける Y 軸回転 (rad) */
  yaw: number;
}

/**
 * 日本の街区歩道沿い（縁石内側 ±6.45m）に配置する街灯14基。
 * 信号支柱 (±6.7, ±6.7) や自販機 (±8.2, ±14 / +24)・駐車車両 (±4.35) と干渉しない位置に整列。
 */
const STREET_LIGHT_PLACEMENTS: readonly StreetLightPlacement[] = [
  // 北側通り (Z < 0)
  { id: 'street_light_n1', x: -6.45, z: -18, yaw: 0 },
  { id: 'street_light_n2', x: 6.45, z: -28, yaw: Math.PI },
  { id: 'street_light_n3', x: -6.45, z: -44, yaw: 0 },
  { id: 'street_light_n4', x: 6.45, z: -58, yaw: Math.PI },
  // 南側通り (Z > 0)
  { id: 'street_light_s1', x: 6.45, z: 18, yaw: Math.PI },
  { id: 'street_light_s2', x: -6.45, z: 28, yaw: 0 },
  { id: 'street_light_s3', x: 6.45, z: 44, yaw: Math.PI },
  { id: 'street_light_s4', x: -6.45, z: 58, yaw: 0 },
  // 西側通り (X < 0)
  { id: 'street_light_w1', x: -18, z: 6.45, yaw: Math.PI / 2 },
  { id: 'street_light_w2', x: -34, z: -6.45, yaw: -Math.PI / 2 },
  { id: 'street_light_w3', x: -54, z: 6.45, yaw: Math.PI / 2 },
  // 東側通り (X > 0)
  { id: 'street_light_e1', x: 18, z: -6.45, yaw: -Math.PI / 2 },
  { id: 'street_light_e2', x: 34, z: 6.45, yaw: Math.PI / 2 },
  { id: 'street_light_e3', x: 54, z: -6.45, yaw: -Math.PI / 2 },
];

const LAMP_DAY_COLOR = new THREE.Color(0xdbe3eb);
const LAMP_NIGHT_EMISSIVE = new THREE.Color(0xffdfa6);
const LAMP_UNLIT_EMISSIVE = new THREE.Color(0x000000);

/**
 * 3-G: M1 iPad Air 60FPS 維持設計の街灯（ストリートライト）システム。
 * - 全14基でジオメトリ・マテリアル・疑似光彩テクスチャを完全共有。
 * - 街灯ごとの PointLight 大量配置を避け、代表交差点（中央交差点）のみの最小限の光源（castShadow = false）
 *   ＋ 発光マテリアル ＋ 加算ブレンドハロー＆路面ライトプールで夜道を美しく演出する。
 */
export class StreetLightSystem {
  private readonly scene: THREE.Scene;
  private readonly collisionWorld: CollisionWorld;
  private readonly root: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly colliderIds: string[] = [];

  private readonly lampLensMat: THREE.MeshStandardMaterial;
  private readonly haloSpriteMat: THREE.SpriteMaterial;
  private readonly groundPoolMat: THREE.MeshBasicMaterial;
  private readonly haloSprites: THREE.Sprite[] = [];
  private readonly groundPools: THREE.Mesh[] = [];

  /** 中央交差点の代表光源（1基のみ、castShadow = false で軽量） */
  private readonly intersectionLight: THREE.PointLight;

  private lastNightFactor = -1;

  constructor(scene: THREE.Scene, collisionWorld: CollisionWorld) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.root = new THREE.Group();
    this.root.name = 'JapaneseStreetLights';

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x5c646d,
      roughness: 0.44,
      metalness: 0.68,
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x3b4148,
      roughness: 0.5,
      metalness: 0.52,
    });
    this.lampLensMat = new THREE.MeshStandardMaterial({
      color: LAMP_DAY_COLOR.clone(),
      emissive: LAMP_UNLIT_EMISSIVE.clone(),
      emissiveIntensity: 0,
      roughness: 0.25,
      metalness: 0.05,
    });

    const haloTex = createRadialGlowTexture(
      128,
      'rgba(255, 240, 200, 1.0)',
      'rgba(255, 198, 120, 0.42)',
      'rgba(255, 160, 64, 0.0)',
    );
    const poolTex = createRadialGlowTexture(
      128,
      'rgba(255, 224, 168, 0.72)',
      'rgba(255, 196, 118, 0.25)',
      'rgba(255, 165, 80, 0.0)',
    );
    this.textures.push(haloTex, poolTex);

    this.haloSpriteMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xffe4b0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });

    this.groundPoolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0xffd596,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.materials.push(
      poleMat,
      housingMat,
      this.lampLensMat,
      this.haloSpriteMat,
      this.groundPoolMat,
    );

    // 共有ジオメトリ
    const poleH = 5.6;
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.095, poleH, 10);
    const baseGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.24, 10);
    const armGeo = new THREE.CylinderGeometry(0.038, 0.048, 1.75, 8);
    const headGeo = new THREE.BoxGeometry(0.62, 0.1, 0.28);
    const lensGeo = new THREE.PlaneGeometry(0.52, 0.22);
    const poolGeo = new THREE.PlaneGeometry(7.2, 7.2);

    this.geometries.push(poleGeo, baseGeo, armGeo, headGeo, lensGeo, poolGeo);

    const baseY = CITY_METRICS.sidewalkHeight;

    for (const spec of STREET_LIGHT_PLACEMENTS) {
      const group = new THREE.Group();
      group.name = spec.id;
      group.position.set(spec.x, baseY, spec.z);
      group.rotation.y = spec.yaw;

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = poleH * 0.5;
      pole.receiveShadow = true;
      group.add(pole);

      const base = new THREE.Mesh(baseGeo, poleMat);
      base.position.y = 0.12;
      group.add(base);

      // 緩やかに上向きに張り出すアーム (+X 方向へ車道上空へ張り出し)
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.z = -Math.PI * 0.43;
      arm.position.set(0.82, poleH + 0.16, 0);
      group.add(arm);

      // 灯具フード
      const head = new THREE.Mesh(headGeo, housingMat);
      head.position.set(1.66, poleH + 0.34, 0);
      group.add(head);

      // 下向き LED 発光ディフューザー
      const lens = new THREE.Mesh(lensGeo, this.lampLensMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(1.66, poleH + 0.285, 0);
      group.add(lens);

      // 疑似光彩ハロー（加算ブレンドスプライト）
      const halo = new THREE.Sprite(this.haloSpriteMat);
      halo.position.set(1.66, poleH + 0.24, 0);
      halo.scale.set(2.35, 2.35, 1);
      halo.visible = false;
      group.add(halo);
      this.haloSprites.push(halo);

      // 路面ライトプール（灯具直下の車道 Y=0.025 に配置）
      const pool = new THREE.Mesh(poolGeo, this.groundPoolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(1.85, -baseY + 0.026, 0);
      pool.visible = false;
      group.add(pool);
      this.groundPools.push(pool);

      this.root.add(group);

      // 支柱の当たり判定登録
      this.collisionWorld.upsertCollider(
        spec.id,
        spec.x,
        spec.z,
        0.26,
        0.26,
        0,
        baseY,
        baseY + poleH,
      );
      this.colliderIds.push(spec.id);
    }

    // 中央交差点の代表光源（1基のみ・影計算オフで M1 iPad Air 60FPS 維持）
    this.intersectionLight = new THREE.PointLight(0xffdca8, 0, 36, 1.5);
    this.intersectionLight.position.set(0, 7.2, 0);
    this.intersectionLight.castShadow = false;
    this.root.add(this.intersectionLight);

    this.scene.add(this.root);
    this.setNightFactor(0);
  }

  public setNightFactor(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - this.lastNightFactor) < 0.004) return;
    this.lastNightFactor = clamped;

    const isLit = clamped > 0.03;

    if (isLit) {
      this.lampLensMat.emissive.copy(LAMP_NIGHT_EMISSIVE);
      this.lampLensMat.emissiveIntensity = clamped * 3.4;
    } else {
      this.lampLensMat.emissive.copy(LAMP_UNLIT_EMISSIVE);
      this.lampLensMat.emissiveIntensity = 0;
    }

    this.haloSpriteMat.opacity = clamped * 0.72;
    this.groundPoolMat.opacity = clamped * 0.32;

    for (let i = 0; i < this.haloSprites.length; i += 1) {
      this.haloSprites[i].visible = isLit;
    }
    for (let i = 0; i < this.groundPools.length; i += 1) {
      this.groundPools[i].visible = isLit;
    }

    this.intersectionLight.intensity = clamped * 44;
  }

  public dispose(): void {
    for (const id of this.colliderIds) {
      this.collisionWorld.removeCollider(id);
    }
    this.colliderIds.length = 0;
    this.scene.remove(this.root);
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
    for (const tex of this.textures) tex.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
    this.haloSprites.length = 0;
    this.groundPools.length = 0;
  }
}

export function createRadialGlowTexture(
  size: number,
  innerColor: string,
  midColor: string,
  outerColor: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, innerColor);
    grad.addColorStop(0.32, midColor);
    grad.addColorStop(1.0, outerColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
