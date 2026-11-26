import * as THREE from 'three';
import type { WheelSlot } from '../vehicle/vehicleConfig';
import type { VehicleDimensions, WheelRig } from '../vehicle/vehicleModel';
import type { CollisionWorld } from '../world/collisionWorld';
import {
  sampleRoadSegment,
  type RoadSample,
  type RoadSegment,
} from './roadNetwork';
import type { TrafficVehicleConfig } from './trafficConfig';

export interface TrafficObstacle {
  id: string;
  kind: 'player' | 'drivable' | 'traffic';
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfD: number;
  /** AI 車両同士の優先順位判定用（小さいほど優先） */
  priority?: number;
}

const WHEEL_SLOTS: readonly WheelSlot[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
];

const DETECTION_RANGE_METERS = 16.5;
const VEHICLE_STOP_GAP_METERS = 3.2;
const PLAYER_STOP_GAP_METERS = 3.5;
const ACCEL_RATE = 4.2;
const DECEL_RATE = 9.5;
const EMERGENCY_BRAKE_RATE = 16.5;
const MAX_STEER_ANGLE = 0.48;

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * 3-A: 道路ネットワーク上を日本の左側通行で自動走行する単体 AI 交通車両。
 * - 車輪回転・前輪ステアリング・前方障害物検知（プレイヤー/自車/他AI車）・車間距離維持
 * - CollisionWorld への OBB コライダー動的同期
 */
export class TrafficVehicle {
  public readonly config: TrafficVehicleConfig;
  public readonly priorityIndex: number;
  public readonly root: THREE.Group;
  public readonly dimensions: VehicleDimensions;

  private readonly segments: Map<string, RoadSegment>;
  private readonly collisionWorld: CollisionWorld;
  private readonly wheels: Record<WheelSlot, WheelRig | null>;
  private readonly avgWheelRadius: number;

  private currentSegment: RoadSegment;
  private segmentDistance: number;
  private turnCursor = 0;

  private x = 0;
  private z = 0;
  private yaw = 0;
  private speed = 0;
  private currentSteerAngle = 0;
  private blockedTimer = 0;

  private readonly sampleNow: RoadSample = {
    x: 0,
    z: 0,
    yaw: 0,
    speedFactor: 1,
  };
  private readonly sampleAhead: RoadSample = {
    x: 0,
    z: 0,
    yaw: 0,
    speedFactor: 1,
  };

  constructor(
    config: TrafficVehicleConfig,
    priorityIndex: number,
    clonedModel: THREE.Object3D,
    segments: Map<string, RoadSegment>,
    collisionWorld: CollisionWorld,
    maxAnisotropy: number,
  ) {
    this.config = config;
    this.priorityIndex = priorityIndex;
    this.segments = segments;
    this.collisionWorld = collisionWorld;

    const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
    clonedModel.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = config.castShadow;
      obj.receiveShadow = true;
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      for (const mat of materials) {
        if (!mat) continue;
        const stdMat = mat as THREE.MeshStandardMaterial;
        if (stdMat.map) stdMat.map.anisotropy = anisotropy;
        if (stdMat.normalMap) stdMat.normalMap.anisotropy = anisotropy;
        if (stdMat.roughnessMap) stdMat.roughnessMap.anisotropy = anisotropy;
      }
    });

    // 1. スケール正規化・+Z 正面化・Y = 0 厳密接地
    clonedModel.position.set(0, 0, 0);
    clonedModel.rotation.set(0, config.modelForwardCorrectionY, 0);
    clonedModel.scale.set(1, 1, 1);
    clonedModel.updateMatrixWorld(true);

    const rawBox = new THREE.Box3().setFromObject(clonedModel);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawLength = Math.max(rawSize.x, rawSize.z);
    const scale =
      rawLength > 0.0001 ? config.targetLengthMeters / rawLength : 1.0;

    clonedModel.scale.setScalar(scale);
    clonedModel.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(clonedModel);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledSize = scaledBox.getSize(new THREE.Vector3());

    clonedModel.position.set(
      -scaledCenter.x,
      -scaledBox.min.y,
      -scaledCenter.z,
    );
    clonedModel.updateMatrixWorld(true);

    this.root = new THREE.Group();
    this.root.name = config.id;
    this.root.add(clonedModel);
    this.root.updateMatrixWorld(true);

    this.dimensions = {
      width: scaledSize.x,
      height: scaledSize.y,
      length: scaledSize.z,
    };

    // 2. 4輪ピボットリグ構築
    this.wheels = buildTrafficWheelRig(this.root, clonedModel, config);
    let rSum = 0;
    let rCount = 0;
    for (const slot of WHEEL_SLOTS) {
      const w = this.wheels[slot];
      if (w) {
        rSum += w.radiusMeters;
        rCount += 1;
      }
    }
    this.avgWheelRadius = rCount > 0 ? rSum / rCount : 0.34;

    // 3. 初期道路セグメント配置
    const initialSeg =
      segments.get(config.startSegmentId) ?? segments.values().next().value!;
    this.currentSegment = initialSeg;
    this.segmentDistance = Math.min(
      Math.max(0, config.startDistance),
      initialSeg.totalLength,
    );

    sampleRoadSegment(this.currentSegment, this.segmentDistance, this.sampleNow);
    this.x = this.sampleNow.x;
    this.z = this.sampleNow.z;
    this.yaw = this.sampleNow.yaw;
    this.speed = config.cruiseSpeedMs * 0.6;

    this.syncTransformAndCollider();
  }

  public getObstacleSnapshot(): TrafficObstacle {
    return {
      id: this.config.id,
      kind: 'traffic',
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      halfW: this.dimensions.width * 0.5,
      halfD: this.dimensions.length * 0.5,
      priority: this.priorityIndex,
    };
  }

  public getSpeedKmh(): number {
    return Math.round(this.speed * 3.6);
  }

  public update(dt: number, obstacles: readonly TrafficObstacle[]): void {
    if (dt <= 0) return;

    // 1. 現在の目標巡航速度（カーブ・交差点で自然減速）
    const baseTargetSpeed =
      this.config.cruiseSpeedMs * this.currentSegment.speedFactor;
    let targetSpeed = baseTargetSpeed;
    let emergencyStop = false;
    let blockedOnlyByTraffic = false;
    let blockingTrafficHasHigherPriority = false;

    const halfW = this.dimensions.width * 0.5;
    const halfL = this.dimensions.length * 0.5;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // 2. 前方障害物検知（歩行中プレイヤー・運転車両2台・他AI交通車両）
    let minGap = Infinity;
    let minStopGap = VEHICLE_STOP_GAP_METERS;
    let closestKind: TrafficObstacle['kind'] | null = null;
    let closestPriority = Infinity;

    for (const obs of obstacles) {
      if (obs.id === this.config.id) continue;

      const dx = obs.x - this.x;
      const dz = obs.z - this.z;
      const approxDistSq = dx * dx + dz * dz;
      const maxCheck = DETECTION_RANGE_METERS + halfL + obs.halfD + 2.0;
      if (approxDistSq > maxCheck * maxCheck) continue;

      const lateralMargin = obs.kind === 'player' ? 0.95 : 0.52;
      const corridorHalfW = halfW + lateralMargin;

      // 相手 OBB の中心 + 4隅を自車ローカル座標系（+Z = 前方, +X = 左）へ変換
      const oCos = Math.cos(obs.yaw);
      const oSin = Math.sin(obs.yaw);
      const cornersX = [
        obs.x,
        obs.x + obs.halfW * oCos + obs.halfD * oSin,
        obs.x - obs.halfW * oCos + obs.halfD * oSin,
        obs.x + obs.halfW * oCos - obs.halfD * oSin,
        obs.x - obs.halfW * oCos - obs.halfD * oSin,
      ];
      const cornersZ = [
        obs.z,
        obs.z - obs.halfW * oSin + obs.halfD * oCos,
        obs.z + obs.halfW * oSin + obs.halfD * oCos,
        obs.z - obs.halfW * oSin - obs.halfD * oCos,
        obs.z + obs.halfW * oSin - obs.halfD * oCos,
      ];

      let bestLocalGap = Infinity;
      for (let i = 0; i < 5; i += 1) {
        const rx = cornersX[i] - this.x;
        const rz = cornersZ[i] - this.z;
        // 自車前方ベクトル (sinY, cosY) / 自車左ベクトル (cosY, -sinY)
        const forwardDist = rx * sinY + rz * cosY;
        const lateralDist = rx * cosY - rz * sinY;

        if (Math.abs(lateralDist) <= corridorHalfW && forwardDist > 0.2) {
          const gap = forwardDist - halfL;
          if (gap < bestLocalGap) {
            bestLocalGap = gap;
          }
        }
      }

      if (bestLocalGap < DETECTION_RANGE_METERS && bestLocalGap < minGap) {
        minGap = bestLocalGap;
        minStopGap =
          obs.kind === 'player'
            ? PLAYER_STOP_GAP_METERS
            : VEHICLE_STOP_GAP_METERS;
        closestKind = obs.kind;
        closestPriority = obs.priority ?? Infinity;
      }
    }

    // 3. 中央交差点への進入前譲り合い判定（交差方向に他車両が進入中なら停止線手前で待機）
    const remaining = this.currentSegment.totalLength - this.segmentDistance;
    if (
      this.currentSegment.kind === 'straight' &&
      this.currentSegment.id.endsWith('_IN') &&
      remaining < 7.5
    ) {
      for (const obs of obstacles) {
        if (obs.id === this.config.id) continue;
        if (Math.abs(obs.x) < 6.8 && Math.abs(obs.z) < 6.8) {
          // 既に交差点内にいる車両またはプレイヤーがいれば停止線手前で減速・停止
          const stopLineGap = Math.max(0, remaining - halfL - 0.8);
          if (stopLineGap < minGap) {
            minGap = stopLineGap;
            minStopGap = 1.2;
            closestKind = obs.kind;
            closestPriority = obs.priority ?? Infinity;
          }
        }
      }
    }

    if (minGap < DETECTION_RANGE_METERS) {
      if (minGap <= minStopGap) {
        targetSpeed = 0;
        emergencyStop = true;
      } else {
        const ratio =
          (minGap - minStopGap) / (DETECTION_RANGE_METERS - minStopGap);
        targetSpeed = Math.min(targetSpeed, baseTargetSpeed * ratio);
      }

      if (closestKind === 'traffic') {
        blockedOnlyByTraffic = true;
        blockingTrafficHasHigherPriority = closestPriority < this.priorityIndex;
      }
    }

    // 4. 交差点等での AI 同士デッドロック防止（プレイヤー・自車が前方にいない場合のみ）
    if (targetSpeed < 0.3 && blockedOnlyByTraffic) {
      this.blockedTimer += dt;
      if (this.blockedTimer > 3.2 && !blockingTrafficHasHigherPriority) {
        targetSpeed = baseTargetSpeed * 0.45;
        emergencyStop = false;
      }
    } else {
      this.blockedTimer = 0;
    }

    // 5. 滑らかな加減速
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + ACCEL_RATE * dt);
    } else if (this.speed > targetSpeed) {
      const rate = emergencyStop ? EMERGENCY_BRAKE_RATE : DECEL_RATE;
      this.speed = Math.max(targetSpeed, this.speed - rate * dt);
    }

    // 6. 道路セグメント上を前進・次セグメントへ遷移
    const travel = this.speed * dt;
    if (travel > 1e-6) {
      this.advanceAlongNetwork(travel);
    }

    // 7. 現在位置・向き・先読みステアリング角を更新
    sampleRoadSegment(this.currentSegment, this.segmentDistance, this.sampleNow);
    this.x = this.sampleNow.x;
    this.z = this.sampleNow.z;

    // 向きを滑らかに補間（セグメント継ぎ目の急変を防ぐ）
    const yawDiff = normalizeAngle(this.sampleNow.yaw - this.yaw);
    this.yaw = normalizeAngle(
      this.yaw + yawDiff * Math.min(1, dt * 10.5),
    );

    // 4.5m 先のルート向きから前輪ステア角を算出
    this.sampleLookahead(4.5, this.sampleAhead);
    const steerError = normalizeAngle(this.sampleAhead.yaw - this.yaw);
    const targetSteer = Math.max(
      -MAX_STEER_ANGLE,
      Math.min(MAX_STEER_ANGLE, steerError * 1.15),
    );
    this.currentSteerAngle +=
      (targetSteer - this.currentSteerAngle) * Math.min(1, dt * 9.0);

    // 8. 4輪回転＆前輪ステアリング反映
    const spinDelta = travel / this.avgWheelRadius;
    for (const slot of WHEEL_SLOTS) {
      const w = this.wheels[slot];
      if (!w) continue;
      if (w.steerable) {
        w.steerPivot.rotation.y = this.currentSteerAngle;
      }
      w.spinPivot.rotation.x += spinDelta;
    }

    // 9. メッシュ Transform & OBB コライダー同期
    this.syncTransformAndCollider();
  }

  private advanceAlongNetwork(distanceDelta: number): void {
    let rem = distanceDelta;
    let guard = 0;
    while (rem > 0 && guard < 4) {
      guard += 1;
      const leftInSeg = this.currentSegment.totalLength - this.segmentDistance;
      if (rem < leftInSeg) {
        this.segmentDistance += rem;
        rem = 0;
      } else {
        rem -= leftInSeg;
        this.currentSegment = this.pickNextSegment(this.currentSegment);
        this.segmentDistance = 0;
      }
    }
  }

  private pickNextSegment(seg: RoadSegment): RoadSegment {
    const nextIds = seg.nextIds;
    if (nextIds.length === 0) return seg;
    if (nextIds.length === 1) {
      return this.segments.get(nextIds[0]) ?? seg;
    }
    const pattern = this.config.turnPattern;
    const choiceIdx =
      pattern.length > 0
        ? pattern[this.turnCursor % pattern.length] % nextIds.length
        : 0;
    this.turnCursor += 1;
    return this.segments.get(nextIds[choiceIdx]) ?? seg;
  }

  private sampleLookahead(lookaheadMeters: number, out: RoadSample): void {
    const nextDist = this.segmentDistance + lookaheadMeters;
    if (nextDist <= this.currentSegment.totalLength) {
      sampleRoadSegment(this.currentSegment, nextDist, out);
      return;
    }
    const overflow = nextDist - this.currentSegment.totalLength;
    const nextIds = this.currentSegment.nextIds;
    if (nextIds.length === 0) {
      sampleRoadSegment(
        this.currentSegment,
        this.currentSegment.totalLength,
        out,
      );
      return;
    }
    const pattern = this.config.turnPattern;
    const previewIdx =
      nextIds.length === 1
        ? 0
        : pattern.length > 0
          ? pattern[this.turnCursor % pattern.length] % nextIds.length
          : 0;
    const nextSeg = this.segments.get(nextIds[previewIdx]) ?? this.currentSegment;
    sampleRoadSegment(nextSeg, overflow, out);
  }

  private syncTransformAndCollider(): void {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.set(0, this.yaw, 0);

    this.collisionWorld.upsertCollider(
      this.config.id,
      this.x,
      this.z,
      this.dimensions.width * this.config.colliderShrink,
      this.dimensions.length * this.config.colliderShrink,
      this.yaw,
      0,
      this.dimensions.height,
    );
  }
}

function buildTrafficWheelRig(
  root: THREE.Group,
  model: THREE.Object3D,
  config: TrafficVehicleConfig,
): Record<WheelSlot, WheelRig | null> {
  const wheels: Record<WheelSlot, WheelRig | null> = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
  };

  for (const slot of WHEEL_SLOTS) {
    const binding = config.wheels[slot];
    const spinNodes: THREE.Object3D[] = [];
    const steerOnlyNodes: THREE.Object3D[] = [];

    for (const name of binding.spinNodeNames) {
      const found = model.getObjectByName(name);
      if (found) spinNodes.push(found);
    }
    for (const name of binding.steerOnlyNodeNames) {
      const found = model.getObjectByName(name);
      if (found) steerOnlyNodes.push(found);
    }

    if (spinNodes.length === 0) continue;

    const wheelBox = new THREE.Box3();
    for (const node of spinNodes) {
      wheelBox.expandByObject(node);
    }
    if (wheelBox.isEmpty()) continue;

    const wheelCenter = wheelBox.getCenter(new THREE.Vector3());
    const wheelSize = wheelBox.getSize(new THREE.Vector3());
    const radiusMeters = Math.max(0.15, wheelSize.y * 0.5);

    const steerPivot = new THREE.Group();
    steerPivot.name = `traffic_${slot}_steerPivot`;
    steerPivot.position.copy(wheelCenter);

    const spinPivot = new THREE.Group();
    spinPivot.name = `traffic_${slot}_spinPivot`;
    steerPivot.add(spinPivot);

    root.add(steerPivot);
    root.updateMatrixWorld(true);

    const attachedNodes: string[] = [];
    for (const node of spinNodes) {
      spinPivot.attach(node);
      attachedNodes.push(node.name);
    }
    for (const node of steerOnlyNodes) {
      steerPivot.attach(node);
      attachedNodes.push(node.name);
    }

    wheels[slot] = {
      slot,
      steerable: binding.steerable,
      steerPivot,
      spinPivot,
      radiusMeters,
      attachedNodes,
    };
  }

  return wheels;
}
