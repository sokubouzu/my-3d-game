import * as THREE from 'three';
import { CITY_METRICS, type CollisionWorld } from './collisionWorld';

interface StreetLightPlacement {
  id: string;
  x: number;
  z: number;
  /** 設置地面高さ (内側歩道 0.12m / 外周道路 0m) */
  baseY: number;
  /** アーム（+Xローカル方向）を車道中心へ向ける Y 軸回転 (rad) */
  yaw: number;
}

const SW_Y = CITY_METRICS.sidewalkHeight;
const RING_OUTER_POST =
  CITY_METRICS.outerRingHalfSpan + CITY_METRICS.outerRingHalfWidth + 0.9;
const RING_CORNER_CENTER =
  CITY_METRICS.outerRingHalfSpan - CITY_METRICS.outerRingCornerRadius;
const RING_CORNER_POST =
  RING_CORNER_CENTER +
  (CITY_METRICS.outerRingCornerRadius + CITY_METRICS.outerRingHalfWidth + 0.95) *
    Math.SQRT1_2;

/**
 * 内側市街地（14基・歩道 Y=0.12）＋ 外周道路ループ（20基・Y=0）の計34基の街灯。
 * 支柱・ベース・アーム・灯具・発光レンズ・路面ライトプールを InstancedMesh で一括描画し、
 * M1 iPad Air で 60FPS を維持したまま外周ループ夜間走行を美しく照らす。
 */
const STREET_LIGHT_PLACEMENTS: readonly StreetLightPlacement[] = [
  // 内側市街地：北側通り (Z < 0)
  { id: 'street_light_n1', x: -6.45, z: -18, baseY: SW_Y, yaw: 0 },
  { id: 'street_light_n2', x: 6.45, z: -28, baseY: SW_Y, yaw: Math.PI },
  { id: 'street_light_n3', x: -6.45, z: -44, baseY: SW_Y, yaw: 0 },
  { id: 'street_light_n4', x: 6.45, z: -58, baseY: SW_Y, yaw: Math.PI },
  // 内側市街地：南側通り (Z > 0)
  { id: 'street_light_s1', x: 6.45, z: 18, baseY: SW_Y, yaw: Math.PI },
  { id: 'street_light_s2', x: -6.45, z: 28, baseY: SW_Y, yaw: 0 },
  { id: 'street_light_s3', x: 6.45, z: 44, baseY: SW_Y, yaw: Math.PI },
  { id: 'street_light_s4', x: -6.45, z: 58, baseY: SW_Y, yaw: 0 },
  // 内側市街地：西側通り (X < 0)
  { id: 'street_light_w1', x: -18, z: 6.45, baseY: SW_Y, yaw: Math.PI / 2 },
  { id: 'street_light_w2', x: -34, z: -6.45, baseY: SW_Y, yaw: -Math.PI / 2 },
  { id: 'street_light_w3', x: -54, z: 6.45, baseY: SW_Y, yaw: Math.PI / 2 },
  // 内側市街地：東側通り (X > 0)
  { id: 'street_light_e1', x: 18, z: -6.45, baseY: SW_Y, yaw: -Math.PI / 2 },
  { id: 'street_light_e2', x: 34, z: 6.45, baseY: SW_Y, yaw: Math.PI / 2 },
  { id: 'street_light_e3', x: 54, z: -6.45, baseY: SW_Y, yaw: -Math.PI / 2 },

  // 外周道路ループ：北直線 (アームを +Z 方向へ -> yaw = -PI/2)
  { id: 'street_light_rn1', x: -72, z: -RING_OUTER_POST, baseY: 0, yaw: -Math.PI / 2 },
  { id: 'street_light_rn2', x: -24, z: -RING_OUTER_POST, baseY: 0, yaw: -Math.PI / 2 },
  { id: 'street_light_rn3', x: 24, z: -RING_OUTER_POST, baseY: 0, yaw: -Math.PI / 2 },
  { id: 'street_light_rn4', x: 72, z: -RING_OUTER_POST, baseY: 0, yaw: -Math.PI / 2 },
  // 外周道路ループ：南直線 (アームを -Z 方向へ -> yaw = +PI/2)
  { id: 'street_light_rs1', x: -72, z: RING_OUTER_POST, baseY: 0, yaw: Math.PI / 2 },
  { id: 'street_light_rs2', x: -24, z: RING_OUTER_POST, baseY: 0, yaw: Math.PI / 2 },
  { id: 'street_light_rs3', x: 24, z: RING_OUTER_POST, baseY: 0, yaw: Math.PI / 2 },
  { id: 'street_light_rs4', x: 72, z: RING_OUTER_POST, baseY: 0, yaw: Math.PI / 2 },
  // 外周道路ループ：西直線 (アームを +X 方向へ -> yaw = 0)
  { id: 'street_light_rw1', x: -RING_OUTER_POST, z: -72, baseY: 0, yaw: 0 },
  { id: 'street_light_rw2', x: -RING_OUTER_POST, z: -24, baseY: 0, yaw: 0 },
  { id: 'street_light_rw3', x: -RING_OUTER_POST, z: 24, baseY: 0, yaw: 0 },
  { id: 'street_light_rw4', x: -RING_OUTER_POST, z: 72, baseY: 0, yaw: 0 },
  // 外周道路ループ：東直線 (アームを -X 方向へ -> yaw = PI)
  { id: 'street_light_re1', x: RING_OUTER_POST, z: -72, baseY: 0, yaw: Math.PI },
  { id: 'street_light_re2', x: RING_OUTER_POST, z: -24, baseY: 0, yaw: Math.PI },
  { id: 'street_light_re3', x: RING_OUTER_POST, z: 24, baseY: 0, yaw: Math.PI },
  { id: 'street_light_re4', x: RING_OUTER_POST, z: 72, baseY: 0, yaw: Math.PI },
  // 外周道路ループ：四隅コーナー中央 (アームをコーナー中心向き)
  { id: 'street_light_rc_ne', x: RING_CORNER_POST, z: -RING_CORNER_POST, baseY: 0, yaw: (-3 * Math.PI) / 4 },
  { id: 'street_light_rc_se', x: RING_CORNER_POST, z: RING_CORNER_POST, baseY: 0, yaw: (3 * Math.PI) / 4 },
  { id: 'street_light_rc_sw', x: -RING_CORNER_POST, z: RING_CORNER_POST, baseY: 0, yaw: Math.PI / 4 },
  { id: 'street_light_rc_nw', x: -RING_CORNER_POST, z: -RING_CORNER_POST, baseY: 0, yaw: -Math.PI / 4 },
];

const LAMP_DAY_COLOR = new THREE.Color(0xdbe3eb);
const LAMP_NIGHT_EMISSIVE = new THREE.Color(0xffdfa6);
const LAMP_UNLIT_EMISSIVE = new THREE.Color(0x000000);

/**
 * 3-G / 4-A: M1 iPad Air 60FPS 維持設計の街灯（ストリートライト）システム。
 * - 内側14基＋外周20基（計34基）を InstancedMesh で一括描画。
 * - 街灯ごとの PointLight 大量配置を避け、中央交差点の代表光源1基（castShadow = false）
 *   ＋ 発光マテリアル ＋ 加算ブレンドハロー＆Instanced路面ライトプールで夜道を演出する。
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
  private readonly groundPoolInst: THREE.InstancedMesh;

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

    const poleH = 5.6;
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.095, poleH, 8);
    const baseGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.24, 8);
    const armGeo = new THREE.CylinderGeometry(0.038, 0.048, 1.75, 6);
    const headGeo = new THREE.BoxGeometry(0.62, 0.1, 0.28);
    const lensGeo = new THREE.PlaneGeometry(0.52, 0.22);
    lensGeo.rotateX(Math.PI / 2);
    const poolGeo = new THREE.PlaneGeometry(7.6, 7.6);
    poolGeo.rotateX(-Math.PI / 2);

    this.geometries.push(poleGeo, baseGeo, armGeo, headGeo, lensGeo, poolGeo);

    const count = STREET_LIGHT_PLACEMENTS.length;
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const baseInst = new THREE.InstancedMesh(baseGeo, poleMat, count);
    const armInst = new THREE.InstancedMesh(armGeo, poleMat, count);
    const headInst = new THREE.InstancedMesh(headGeo, housingMat, count);
    const lensInst = new THREE.InstancedMesh(lensGeo, this.lampLensMat, count);
    this.groundPoolInst = new THREE.InstancedMesh(
      poolGeo,
      this.groundPoolMat,
      count,
    );
    this.groundPoolInst.visible = false;

    const dummy = new THREE.Object3D();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3(0, 0, 1);
    const baseQuat = new THREE.Quaternion();
    const armTiltQuat = new THREE.Quaternion().setFromAxisAngle(
      zAxis,
      -Math.PI * 0.43,
    );
    const localOffset = new THREE.Vector3();

    for (let i = 0; i < count; i += 1) {
      const spec = STREET_LIGHT_PLACEMENTS[i];
      baseQuat.setFromAxisAngle(yAxis, spec.yaw);

      // 支柱
      dummy.position.set(spec.x, spec.baseY + poleH * 0.5, spec.z);
      dummy.quaternion.copy(baseQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      // ベース
      dummy.position.set(spec.x, spec.baseY + 0.12, spec.z);
      dummy.quaternion.copy(baseQuat);
      dummy.updateMatrix();
      baseInst.setMatrixAt(i, dummy.matrix);

      // アーム
      localOffset.set(0.82, poleH + 0.16, 0).applyQuaternion(baseQuat);
      dummy.position.set(
        spec.x + localOffset.x,
        spec.baseY + localOffset.y,
        spec.z + localOffset.z,
      );
      dummy.quaternion.copy(baseQuat).multiply(armTiltQuat);
      dummy.updateMatrix();
      armInst.setMatrixAt(i, dummy.matrix);

      // 灯具フード
      localOffset.set(1.66, poleH + 0.34, 0).applyQuaternion(baseQuat);
      dummy.position.set(
        spec.x + localOffset.x,
        spec.baseY + localOffset.y,
        spec.z + localOffset.z,
      );
      dummy.quaternion.copy(baseQuat);
      dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);

      // 発光ディフューザー
      localOffset.set(1.66, poleH + 0.285, 0).applyQuaternion(baseQuat);
      dummy.position.set(
        spec.x + localOffset.x,
        spec.baseY + localOffset.y,
        spec.z + localOffset.z,
      );
      dummy.quaternion.copy(baseQuat);
      dummy.updateMatrix();
      lensInst.setMatrixAt(i, dummy.matrix);

      // 疑似光彩ハロー（加算ブレンドスプライト）
      localOffset.set(1.66, poleH + 0.24, 0).applyQuaternion(baseQuat);
      const halo = new THREE.Sprite(this.haloSpriteMat);
      halo.position.set(
        spec.x + localOffset.x,
        spec.baseY + localOffset.y,
        spec.z + localOffset.z,
      );
      halo.scale.set(2.45, 2.45, 1);
      halo.visible = false;
      this.root.add(halo);
      this.haloSprites.push(halo);

      // 路面ライトプール（灯具直下の車道 Y=0.026）
      localOffset.set(1.85, 0, 0).applyQuaternion(baseQuat);
      dummy.position.set(
        spec.x + localOffset.x,
        0.026,
        spec.z + localOffset.z,
      );
      dummy.quaternion.identity();
      dummy.updateMatrix();
      this.groundPoolInst.setMatrixAt(i, dummy.matrix);

      // 支柱の当たり判定登録
      this.collisionWorld.upsertCollider(
        spec.id,
        spec.x,
        spec.z,
        0.26,
        0.26,
        0,
        spec.baseY,
        spec.baseY + poleH,
      );
      this.colliderIds.push(spec.id);
    }

    poleInst.instanceMatrix.needsUpdate = true;
    baseInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    headInst.instanceMatrix.needsUpdate = true;
    lensInst.instanceMatrix.needsUpdate = true;
    this.groundPoolInst.instanceMatrix.needsUpdate = true;

    this.root.add(
      poleInst,
      baseInst,
      armInst,
      headInst,
      lensInst,
      this.groundPoolInst,
    );

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
      this.lampLensMat.emissiveIntensity = clamped * 1.9;
    } else {
      this.lampLensMat.emissive.copy(LAMP_UNLIT_EMISSIVE);
      this.lampLensMat.emissiveIntensity = 0;
    }

    this.haloSpriteMat.opacity = clamped * 0.56;
    this.groundPoolMat.opacity = clamped * 0.28;
    this.groundPoolInst.visible = isLit;

    for (let i = 0; i < this.haloSprites.length; i += 1) {
      this.haloSprites[i].visible = isLit;
    }

    this.intersectionLight.intensity = clamped * 40;
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
