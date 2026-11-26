import * as THREE from 'three';
import type { TrafficLightController } from '../traffic/trafficLights';
import type { TrafficObstacle } from '../traffic/trafficVehicle';
import type { CollisionWorld } from '../world/collisionWorld';
import type {
  PedestrianAppearance,
  PedestrianConfig,
} from './pedestrianRoutes';

const PED_RADIUS = 0.34;
const WALK_ANIM_REF_SPEED = 1.28; // Walking クリップの標準速度基準 (m/s)
const WAYPOINT_REACH_DIST = 0.45;
const VEHICLE_STOP_DIST = 2.8;
const HUMAN_AVOID_DIST = 1.85;
const HUMAN_STOP_DIST = 0.82;
const CROSSFADE_SEC = 0.22;
const WARDROBE_SHADER_KEY = 'pedestrian-wardrobe-v1';

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * 3-B / 3-C: 歩道および横断歩道を歩行する単体 AI 歩行者エージェント。
 * - SkeletonUtils.clone で複製したスキニングモデル + 個体別 AnimationMixer（Walking / Idle クロスフェード）
 * - 個体ごとに material.clone() を行い、服（上下）と髪色のバリエーション＋身長 1.55m〜1.80m を適用
 * - 信号連動（横断歩道が青のときのみ進入、横断中は対岸まで渡り切る）
 * - プレイヤー・車両・他歩行者への一時停止 / 軽回避 / めり込み防止分離
 */
export class PedestrianAgent {
  public readonly config: PedestrianConfig;
  public readonly root: THREE.Group;
  public readonly heightMeters: number;

  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idleAction: THREE.AnimationAction | null;
  private readonly walkAction: THREE.AnimationAction | null;
  private readonly collisionWorld: CollisionWorld;
  private readonly clonedMaterials: THREE.Material[] = [];

  private currentWpIdx: number;
  private nextWpIdx: number;
  private inCrosswalk = false;

  private x: number;
  private y: number;
  private z: number;
  private yaw: number;
  private currentSpeed = 0;
  private isWalkingAnim = false;

  private readonly obstacleSnapshot: TrafficObstacle;

  constructor(
    config: PedestrianConfig,
    clonedModel: THREE.Object3D,
    animations: readonly THREE.AnimationClip[],
    collisionWorld: CollisionWorld,
    baseScaleFactor: number,
    baseMinYOffset: number,
    heightMeters: number,
    appearance: PedestrianAppearance,
  ) {
    this.config = config;
    this.collisionWorld = collisionWorld;
    this.model = clonedModel;
    this.heightMeters = heightMeters;

    // 身長バリエーション（1.55m〜1.80m）を反映しつつ足裏 Y=0 接地を維持
    const heightRatio = heightMeters / 1.7;
    const finalScale = baseScaleFactor * heightRatio;
    clonedModel.scale.setScalar(finalScale);
    clonedModel.position.set(0, baseMinYOffset * heightRatio, 0);

    // M1 iPad Air 最適化: AI 歩行者は castShadow = false、テクスチャは完全共有し
    // 各個体のマテリアルのみ material.clone() して服・髪色のバリエーションを適用
    const topColor = new THREE.Color(appearance.topHex);
    const bottomColor = new THREE.Color(appearance.bottomHex);
    const hairColor = new THREE.Color(appearance.hairHex);

    clonedModel.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) {
        node.frustumCulled = false;
      }
      if (node instanceof THREE.Mesh) {
        node.castShadow = false;
        node.receiveShadow = true;

        if (Array.isArray(node.material)) {
          node.material = node.material.map((m) =>
            this.cloneVariedMaterial(
              m,
              topColor,
              bottomColor,
              hairColor,
              appearance,
            ),
          );
        } else if (node.material) {
          node.material = this.cloneVariedMaterial(
            node.material,
            topColor,
            bottomColor,
            hairColor,
            appearance,
          );
        }
      }
    });

    this.root = new THREE.Group();
    this.root.name = config.id;
    this.root.add(clonedModel);

    // 個体ごとの独立 AnimationMixer & Walking / Idle アクション
    this.mixer = new THREE.AnimationMixer(clonedModel);
    const idleClip =
      animations.find((c) => c.name === 'Idle') ?? animations[0] ?? null;
    const walkClip =
      animations.find((c) => c.name === 'Walking') ?? idleClip;

    this.idleAction = idleClip ? this.mixer.clipAction(idleClip) : null;
    this.walkAction = walkClip ? this.mixer.clipAction(walkClip) : null;

    if (this.walkAction) {
      this.walkAction.play();
      this.walkAction.time =
        config.animPhaseOffsetSec %
        Math.max(0.1, this.walkAction.getClip().duration);
      this.isWalkingAnim = true;
    } else if (this.idleAction) {
      this.idleAction.play();
      this.isWalkingAnim = false;
    }

    // 初期ウェイポイント配置
    const wps = config.waypoints;
    this.currentWpIdx = config.startWaypointIndex % wps.length;
    this.nextWpIdx = (this.currentWpIdx + 1) % wps.length;

    const startWp = wps[this.currentWpIdx];
    const nextWp = wps[this.nextWpIdx];
    this.x = startWp.x;
    this.z = startWp.z;
    this.y = collisionWorld.getGroundHeight(this.x, this.z);
    this.yaw = Math.atan2(nextWp.x - startWp.x, nextWp.z - startWp.z);
    this.currentSpeed = config.walkSpeedMs;

    this.obstacleSnapshot = {
      id: config.id,
      kind: 'pedestrian',
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      halfW: PED_RADIUS,
      halfD: PED_RADIUS,
    };

    this.syncTransform();
  }

  /**
   * テクスチャを共有したままマテリアルを個別複製 (material.clone()) し、
   * 肌色を保護しつつ上半身・下半身の服装カラーと髪色トーンを軽量シェーダで個体別に変化させる。
   * 全歩行者で単一の shader program cache key を共有するため、M1 iPad Air でもコンパイル負荷ゼロ。
   */
  private cloneVariedMaterial(
    mat: THREE.Material,
    topColor: THREE.Color,
    bottomColor: THREE.Color,
    hairColor: THREE.Color,
    appearance: PedestrianAppearance,
  ): THREE.Material {
    if (!(mat instanceof THREE.MeshStandardMaterial)) {
      const cloned = mat.clone();
      this.clonedMaterials.push(cloned);
      return cloned;
    }

    const cloned = mat.clone();
    this.clonedMaterials.push(cloned);

    // 眉マテリアルは髪色トーンに軽く調和させる
    const lowerName = cloned.name.toLowerCase();
    if (cloned.transparent) {
      if (lowerName.includes('brow') || lowerName.includes('hair')) {
        cloned.color.copy(hairColor).lerp(new THREE.Color(0xffffff), 0.35);
      }
      return cloned;
    }

    // 本体マテリアル: バインドポーズの高さ (0..1.7m) と肌色マスクを用いて服・髪色のみを自然にリカラー
    cloned.customProgramCacheKey = () => WARDROBE_SHADER_KEY;
    cloned.onBeforeCompile = (shader) => {
      shader.uniforms.uPedTopColor = { value: topColor };
      shader.uniforms.uPedBottomColor = { value: bottomColor };
      shader.uniforms.uPedHairColor = { value: hairColor };
      shader.uniforms.uPedStrengths = {
        value: new THREE.Vector3(
          appearance.topStrength,
          appearance.bottomStrength,
          appearance.hairStrength,
        ),
      };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vPedNormY;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vPedNormY = clamp(position.y / 1.7, 0.0, 1.0);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vPedNormY;
uniform vec3 uPedTopColor;
uniform vec3 uPedBottomColor;
uniform vec3 uPedHairColor;
uniform vec3 uPedStrengths;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  // 肌色（顔・手）を保護するための滑らかなマスク（リニア色空間）
  float rgDiff = smoothstep(0.02, 0.085, diffuseColor.r - diffuseColor.g);
  float gbDiff = smoothstep(0.01, 0.065, diffuseColor.g - diffuseColor.b);
  float skinBright = smoothstep(0.11, 0.26, diffuseColor.r);
  float skinMask = rgDiff * gbDiff * skinBright;
  float nonSkin = 1.0 - skinMask;

  // 元の布地・髪の陰影（明度）を保持して自然にリカラー
  float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float clothShade = 0.24 + luma * 1.48;
  float hairShade = 0.20 + luma * 1.55;

  // 領域マスク: ズボン (0.10..0.44) / 上着 (0.44..0.74) / 髪・頭部 (0.74..1.00)
  float bottomMask = smoothstep(0.08, 0.13, vPedNormY) * (1.0 - smoothstep(0.42, 0.46, vPedNormY));
  float topMask = smoothstep(0.42, 0.46, vPedNormY) * (1.0 - smoothstep(0.72, 0.76, vPedNormY));
  float hairMask = smoothstep(0.73, 0.78, vPedNormY);

  vec3 col = diffuseColor.rgb;
  col = mix(col, uPedBottomColor * clothShade, bottomMask * nonSkin * uPedStrengths.y);
  col = mix(col, uPedTopColor * clothShade, topMask * nonSkin * uPedStrengths.x);
  col = mix(col, uPedHairColor * hairShade, hairMask * nonSkin * uPedStrengths.z);
  diffuseColor.rgb = col;
}`,
        );
    };
    cloned.needsUpdate = true;
    return cloned;
  }

  public getObstacleSnapshot(): TrafficObstacle {
    this.obstacleSnapshot.x = this.x;
    this.obstacleSnapshot.z = this.z;
    this.obstacleSnapshot.yaw = this.yaw;
    return this.obstacleSnapshot;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3 | null,
    vehicleObstacles: readonly TrafficObstacle[],
    allPedestrians: readonly PedestrianAgent[],
    trafficLights?: TrafficLightController,
  ): void {
    if (dt <= 0) return;

    const wps = this.config.waypoints;
    const targetWp = wps[this.nextWpIdx];

    const toTargetX = targetWp.x - this.x;
    const toTargetZ = targetWp.z - this.z;
    const distToTarget = Math.hypot(toTargetX, toTargetZ);

    // 1. ウェイポイント到達判定＆次の横断歩道信号チェック
    if (distToTarget <= WAYPOINT_REACH_DIST) {
      this.inCrosswalk = false;
      this.currentWpIdx = this.nextWpIdx;
      this.nextWpIdx = (this.currentWpIdx + 1) % wps.length;
    }

    const activeFrom = wps[this.currentWpIdx];
    const activeTo = wps[this.nextWpIdx];
    const dxGoal = activeTo.x - this.x;
    const dzGoal = activeTo.z - this.z;
    const goalDist = Math.hypot(dxGoal, dzGoal);
    const dirX = goalDist > 1e-4 ? dxGoal / goalDist : Math.sin(this.yaw);
    const dirZ = goalDist > 1e-4 ? dzGoal / goalDist : Math.cos(this.yaw);

    // 2. 信号サイクル連動（横断歩道の進入手前でのみ信号待機、進入済みなら対岸まで渡り切る）
    let waitingForSignal = false;
    const crosswalkAxis = activeFrom.nextCrosswalkAxis;
    if (crosswalkAxis && trafficLights) {
      if (!this.inCrosswalk) {
        // 歩道端からまだ車道へ踏み出していない段階
        const distFromStart = Math.hypot(
          this.x - activeFrom.x,
          this.z - activeFrom.z,
        );
        if (distFromStart < 1.1) {
          if (trafficLights.canPedestrianStartCrossing(crosswalkAxis)) {
            this.inCrosswalk = true;
          } else {
            waitingForSignal = true;
          }
        } else {
          this.inCrosswalk = true;
        }
      }
    } else {
      this.inCrosswalk = false;
    }

    // 3. 前方の車両・プレイヤー・他歩行者検知（一時停止・軽回避）
    let desiredSpeed = waitingForSignal
      ? 0
      : this.inCrosswalk
        ? this.config.walkSpeedMs * 1.15 // 横断中はわずかに早足で自然に渡り切る
        : this.config.walkSpeedMs;
    let steerAvoidX = 0;
    let steerAvoidZ = 0;

    // 3a. 車両（自車・AI交通車両）の前方検知と安全停止
    for (let i = 0; i < vehicleObstacles.length; i += 1) {
      const veh = vehicleObstacles[i];
      const rx = veh.x - this.x;
      const rz = veh.z - this.z;
      const maxR = Math.hypot(veh.halfW, veh.halfD) + VEHICLE_STOP_DIST + 1.0;
      const distSq = rx * rx + rz * rz;
      if (distSq > maxR * maxR) continue;

      // 車両ローカル座標へ変換して表面距離を計測
      const vCos = Math.cos(veh.yaw);
      const vSin = Math.sin(veh.yaw);
      const localX = -rx * vCos + rz * vSin;
      const localZ = -rx * vSin - rz * vCos;
      const outX = Math.max(0, Math.abs(localX) - (veh.halfW + PED_RADIUS));
      const outZ = Math.max(0, Math.abs(localZ) - (veh.halfD + PED_RADIUS));
      const surfaceDist = Math.hypot(outX, outZ);

      // 進行方向前方にある車両なら手前で一時停止
      const fwdDot = rx * dirX + rz * dirZ;
      if (surfaceDist < 1.35 && fwdDot > -0.4) {
        desiredSpeed = 0;
        break;
      }
      if (surfaceDist < VEHICLE_STOP_DIST && fwdDot > 0.2) {
        const ratio = Math.max(0, (surfaceDist - 1.1) / (VEHICLE_STOP_DIST - 1.1));
        desiredSpeed = Math.min(desiredSpeed, this.config.walkSpeedMs * ratio);
      }
    }

    // 3b. プレイヤーへの回避・一時停止
    if (playerPos && desiredSpeed > 0) {
      const rx = playerPos.x - this.x;
      const rz = playerPos.z - this.z;
      const dist = Math.hypot(rx, rz);
      if (dist < HUMAN_AVOID_DIST && dist > 1e-4) {
        const fwdDot = (rx * dirX + rz * dirZ) / dist;
        if (fwdDot > 0.25) {
          if (dist < HUMAN_STOP_DIST) {
            desiredSpeed = 0;
          } else {
            // 右側（進行方向の右ベクトル (-dirZ, dirX)）へ軽く回避
            const weight = (HUMAN_AVOID_DIST - dist) / HUMAN_AVOID_DIST;
            steerAvoidX += -dirZ * weight * 0.85;
            steerAvoidZ += dirX * weight * 0.85;
            desiredSpeed = Math.min(desiredSpeed, this.config.walkSpeedMs * 0.72);
          }
        }
      }
    }

    // 3c. 他の AI 歩行者との回避・一時停止
    if (desiredSpeed > 0) {
      for (let i = 0; i < allPedestrians.length; i += 1) {
        const other = allPedestrians[i];
        if (other === this) continue;
        const rx = other.x - this.x;
        const rz = other.z - this.z;
        const distSq = rx * rx + rz * rz;
        if (distSq >= HUMAN_AVOID_DIST * HUMAN_AVOID_DIST || distSq < 1e-6) {
          continue;
        }
        const dist = Math.sqrt(distSq);
        const fwdDot = (rx * dirX + rz * dirZ) / dist;
        if (fwdDot > 0.2) {
          if (dist < HUMAN_STOP_DIST) {
            desiredSpeed = 0;
            break;
          }
          const weight = (HUMAN_AVOID_DIST - dist) / HUMAN_AVOID_DIST;
          // 相手から離れる横方向へ回避
          const sideSign = -dirZ * rx + dirX * rz >= 0 ? -1 : 1;
          steerAvoidX += -dirZ * sideSign * weight * 0.75;
          steerAvoidZ += dirX * sideSign * weight * 0.75;
          desiredSpeed = Math.min(desiredSpeed, this.config.walkSpeedMs * 0.8);
        }
      }
    }

    // 4. 速度の滑らかな補間と移動ベクトル算出
    const accel = desiredSpeed > this.currentSpeed ? 3.2 : 6.5;
    if (this.currentSpeed < desiredSpeed) {
      this.currentSpeed = Math.min(desiredSpeed, this.currentSpeed + accel * dt);
    } else {
      this.currentSpeed = Math.max(desiredSpeed, this.currentSpeed - accel * dt);
    }

    let moveX = dirX + steerAvoidX;
    let moveZ = dirZ + steerAvoidZ;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1e-4) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    if (this.currentSpeed > 0.02) {
      const nextX = this.x + moveX * this.currentSpeed * dt;
      const nextZ = this.z + moveZ * this.currentSpeed * dt;

      // 建物・自販機・信号支柱・全車両 OBB とのめり込み防止解決
      const resolved = this.collisionWorld.resolveHorizontalCollision(
        nextX,
        this.y,
        nextZ,
        PED_RADIUS,
        this.heightMeters,
      );
      this.x = resolved.x;
      this.z = resolved.z;

      const targetYaw = Math.atan2(moveX, moveZ);
      const yawDiff = normalizeAngle(targetYaw - this.yaw);
      this.yaw = normalizeAngle(this.yaw + yawDiff * Math.min(1, dt * 8.5));
    } else if (waitingForSignal) {
      // 信号待ち中は横断歩道の対岸方向を向いて待つ
      const targetYaw = Math.atan2(dirX, dirZ);
      const yawDiff = normalizeAngle(targetYaw - this.yaw);
      this.yaw = normalizeAngle(this.yaw + yawDiff * Math.min(1, dt * 6.0));
    }

    // 5. 歩行者同士およびプレイヤーとの最小距離分離（めり込み絶対防止）
    const minHumanSep = PED_RADIUS * 2.15;
    if (playerPos) {
      const dx = this.x - playerPos.x;
      const dz = this.z - playerPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minHumanSep * minHumanSep && dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        const push = minHumanSep - d;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
      }
    }
    for (let i = 0; i < allPedestrians.length; i += 1) {
      const other = allPedestrians[i];
      if (other === this) continue;
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minHumanSep * minHumanSep && dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        const push = (minHumanSep - d) * 0.5;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
      }
    }

    // 6. 歩道 (Y=0.12) <-> 車道/横断歩道 (Y=0) の滑らかな接地追従
    const groundY = this.collisionWorld.getGroundHeight(this.x, this.z);
    this.y += (groundY - this.y) * Math.min(1, dt * 14.0);
    if (Math.abs(this.y - groundY) < 0.002) {
      this.y = groundY;
    }

    // 7. Walking / Idle アニメーションクロスフェード＆歩行速度連動 timeScale
    const shouldWalk = this.currentSpeed > 0.12;
    if (shouldWalk !== this.isWalkingAnim) {
      this.isWalkingAnim = shouldWalk;
      if (this.walkAction && this.idleAction && this.walkAction !== this.idleAction) {
        if (shouldWalk) {
          this.walkAction.reset().fadeIn(CROSSFADE_SEC).play();
          this.idleAction.fadeOut(CROSSFADE_SEC);
        } else {
          this.idleAction.reset().fadeIn(CROSSFADE_SEC).play();
          this.walkAction.fadeOut(CROSSFADE_SEC);
        }
      }
    }

    if (this.walkAction && this.isWalkingAnim) {
      this.walkAction.timeScale = Math.max(
        0.55,
        Math.min(1.45, this.currentSpeed / WALK_ANIM_REF_SPEED),
      );
    }

    this.mixer.update(dt);
    this.syncTransform();
  }

  private syncTransform(): void {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.yaw, 0);
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const mat of this.clonedMaterials) {
      mat.dispose();
    }
    this.clonedMaterials.length = 0;
  }
}
