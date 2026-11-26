import * as THREE from 'three';
import type { WheelSlot } from '../vehicle/vehicleConfig';
import type { VehicleDimensions, WheelRig } from '../vehicle/vehicleModel';
import type { CollisionWorld, ObbBox2D } from '../world/collisionWorld';
import {
  sampleRoadSegment,
  TRAFFIC_ROAD_METRICS,
  type RoadSample,
  type RoadSegment,
} from './roadNetwork';
import type { TrafficVehicleConfig } from './trafficConfig';
import type { TrafficAxis, TrafficLightController } from './trafficLights';

export interface TrafficObstacle {
  id: string;
  kind: 'player' | 'pedestrian' | 'drivable' | 'traffic';
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

/** バンパー先端基準の減速開始距離 (m) */
const DETECTION_RANGE_METERS = 20.0;
/** 車両同士のバンパー先端間・安全停止車間バッファ (m) — 最低 1.5m 以上を厳守 */
const VEHICLE_STOP_GAP_METERS = 2.6;
/** プレイヤー・AI歩行者に対するバンパー先端間・安全停止距離 (m) */
const HUMAN_STOP_GAP_METERS = 3.2;
/** 停止線位置 (交差点中心から 11.4m, セグメント終端 8.5m からの手前距離 = 2.9m) */
const STOP_LINE_OFFSET_FROM_SEG_END =
  11.4 - TRAFFIC_ROAD_METRICS.intersectionEdge;
const STOP_LINE_BUFFER_METERS = 0.6;

const ACCEL_RATE = 4.4;
const DECEL_RATE = 10.5;
const EMERGENCY_BRAKE_RATE = 20.0;
const MAX_STEER_ANGLE = 0.48;

/** ゼロアロケーション: 相手 OBB 9点サンプリング用スクラッチ配列 */
const SAMPLE_PT_X = new Float64Array(9);
const SAMPLE_PT_Z = new Float64Array(9);

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function getApproachAxis(segmentId: string): TrafficAxis | null {
  if (segmentId === 'N_IN' || segmentId === 'S_IN') return 'NS';
  if (segmentId === 'W_IN' || segmentId === 'E_IN') return 'EW';
  return null;
}

/**
 * 3-A / 3-B: 道路ネットワーク上を日本の左側通行で自動走行する単体 AI 交通車両。
 * - 車輪回転・前輪ステアリング・バンパー先端基準の前方障害物検知・信号サイクル停止
 * - CollisionWorld への OBB コライダー動的同期および接触時 SAT 分離押し戻し対応
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
  /** 接触分離時に一時適用される横方向オフセット（滑らかにレーン復帰） */
  private sepOffsetX = 0;
  private sepOffsetZ = 0;

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
  private readonly obstacleSnapshot: TrafficObstacle;

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

    this.obstacleSnapshot = {
      id: this.config.id,
      kind: 'traffic',
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      halfW: this.dimensions.width * 0.5,
      halfD: this.dimensions.length * 0.5,
      priority: this.priorityIndex,
    };

    this.syncTransformAndCollider();
  }

  public getObstacleSnapshot(): TrafficObstacle {
    this.obstacleSnapshot.x = this.x;
    this.obstacleSnapshot.z = this.z;
    this.obstacleSnapshot.yaw = this.yaw;
    return this.obstacleSnapshot;
  }

  public fillObb(out: ObbBox2D): void {
    out.cx = this.x;
    out.cz = this.z;
    out.halfW = this.dimensions.width * 0.5;
    out.halfD = this.dimensions.length * 0.5;
    out.cos = Math.cos(this.yaw);
    out.sin = Math.sin(this.yaw);
  }

  /**
   * 3-B: 車体 OBB 同士が万が一接触した際の最小侵入深度分離押し戻し。
   * 押し戻し量に応じて位置・セグメント距離・速度を即時補正し、めり込みを確実に解消する。
   */
  public applySeparationPush(
    pushX: number,
    pushZ: number,
    stopSpeed: boolean,
  ): void {
    this.x += pushX;
    this.z += pushZ;

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const alongFwd = pushX * fwdX + pushZ * fwdZ;

    // 進行方向と逆向きの押し戻しはセグメント距離も戻し、次フレームでの再突入を防ぐ
    if (alongFwd < -1e-4) {
      this.segmentDistance = Math.max(0, this.segmentDistance + alongFwd);
      const latX = pushX - fwdX * alongFwd;
      const latZ = pushZ - fwdZ * alongFwd;
      this.sepOffsetX += latX;
      this.sepOffsetZ += latZ;
    } else {
      this.sepOffsetX += pushX;
      this.sepOffsetZ += pushZ;
    }

    // オフセットの上限クランプ（道路外へ飛び出しすぎないよう保護）
    const offLen = Math.hypot(this.sepOffsetX, this.sepOffsetZ);
    if (offLen > 2.2) {
      const s = 2.2 / offLen;
      this.sepOffsetX *= s;
      this.sepOffsetZ *= s;
    }

    if (stopSpeed) {
      this.speed = 0;
    } else if (alongFwd < -0.01) {
      this.speed = Math.min(this.speed, 0.5);
    }

    this.syncTransformAndCollider();
  }

  public getSpeedKmh(): number {
    return Math.round(this.speed * 3.6);
  }

  public update(
    dt: number,
    obstacles: readonly TrafficObstacle[],
    trafficLights?: TrafficLightController,
  ): void {
    if (dt <= 0) return;

    // 1. 現在の目標巡航速度（カーブ・交差点で自然減速）
    const baseTargetSpeed =
      this.config.cruiseSpeedMs * this.currentSegment.speedFactor;
    let targetSpeed = baseTargetSpeed;
    let emergencyStop = false;
    let blockedOnlyByTraffic = false;
    let blockingTrafficHasHigherPriority = false;
    let stoppedBySignal = false;

    const halfW = this.dimensions.width * 0.5;
    const halfL = this.dimensions.length * 0.5;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // 2. 前方障害物検知（バンパー先端基準＋安全車間バッファ >= 2.6m）
    let minGap = Infinity;
    let minStopGap = VEHICLE_STOP_GAP_METERS;
    let closestKind: TrafficObstacle['kind'] | null = null;
    let closestPriority = Infinity;

    for (let idx = 0; idx < obstacles.length; idx += 1) {
      const obs = obstacles[idx];
      if (obs.id === this.config.id) continue;

      const dx = obs.x - this.x;
      const dz = obs.z - this.z;
      const approxDistSq = dx * dx + dz * dz;
      const maxCheck = DETECTION_RANGE_METERS + halfL + obs.halfD + 2.5;
      if (approxDistSq > maxCheck * maxCheck) continue;

      const isHuman = obs.kind === 'player' || obs.kind === 'pedestrian';
      const lateralMargin = isHuman ? 0.95 : 0.62;
      const corridorHalfW = halfW + lateralMargin;

      // 相手 OBB の 9 点（中心 + 4隅 + 前後左右4辺中点）をゼロアロケーションで算出
      const oCos = Math.cos(obs.yaw);
      const oSin = Math.sin(obs.yaw);
      const wx = obs.halfW * oCos;
      const wz = -obs.halfW * oSin;
      const fx = obs.halfD * oSin;
      const fz = obs.halfD * oCos;

      SAMPLE_PT_X[0] = obs.x;
      SAMPLE_PT_Z[0] = obs.z;
      SAMPLE_PT_X[1] = obs.x + wx + fx;
      SAMPLE_PT_Z[1] = obs.z + wz + fz;
      SAMPLE_PT_X[2] = obs.x - wx + fx;
      SAMPLE_PT_Z[2] = obs.z - wz + fz;
      SAMPLE_PT_X[3] = obs.x + wx - fx;
      SAMPLE_PT_Z[3] = obs.z + wz - fz;
      SAMPLE_PT_X[4] = obs.x - wx - fx;
      SAMPLE_PT_Z[4] = obs.z - wz - fz;
      SAMPLE_PT_X[5] = obs.x + fx;
      SAMPLE_PT_Z[5] = obs.z + fz;
      SAMPLE_PT_X[6] = obs.x - fx;
      SAMPLE_PT_Z[6] = obs.z - fz;
      SAMPLE_PT_X[7] = obs.x + wx;
      SAMPLE_PT_Z[7] = obs.z + wz;
      SAMPLE_PT_X[8] = obs.x - wx;
      SAMPLE_PT_Z[8] = obs.z - wz;

      let bestLocalGap = Infinity;
      for (let i = 0; i < 9; i += 1) {
        const rx = SAMPLE_PT_X[i] - this.x;
        const rz = SAMPLE_PT_Z[i] - this.z;
        // 自車前方ベクトル (sinY, cosY) / 自車左ベクトル (cosY, -sinY)
        const forwardDist = rx * sinY + rz * cosY;
        const lateralDist = rx * cosY - rz * sinY;

        // 自車中心よりやや後方 (-halfL*0.4) まで許容し、バンパー接触・重なり直前を絶対に見落とさない
        if (Math.abs(lateralDist) <= corridorHalfW && forwardDist > -halfL * 0.4) {
          const bumperGap = forwardDist - halfL;
          if (bumperGap < bestLocalGap) {
            bestLocalGap = bumperGap;
          }
        }
      }

      if (bestLocalGap < DETECTION_RANGE_METERS && bestLocalGap < minGap) {
        minGap = bestLocalGap;
        minStopGap = isHuman ? HUMAN_STOP_GAP_METERS : VEHICLE_STOP_GAP_METERS;
        closestKind = obs.kind;
        closestPriority = obs.priority ?? Infinity;
      }
    }

    // 3. 信号サイクル連動（赤信号・黄信号のときは交差点手前の停止線 11.4m で完全停止）
    const remaining = this.currentSegment.totalLength - this.segmentDistance;
    const approachAxis =
      this.currentSegment.kind === 'straight'
        ? getApproachAxis(this.currentSegment.id)
        : null;

    if (approachAxis && trafficLights) {
      const signal = trafficLights.getVehicleSignal(approachAxis);
      if (signal === 'red' || signal === 'yellow') {
        // 前バンパー先端から停止線までの距離
        const bumperToStopLine =
          remaining - STOP_LINE_OFFSET_FROM_SEG_END - halfL;
        // まだ停止線を越えていない場合のみ停止線手前で停止（進入済みはそのまま通過）
        if (bumperToStopLine > -0.35 && bumperToStopLine < DETECTION_RANGE_METERS) {
          const gap = Math.max(0, bumperToStopLine);
          if (gap < minGap) {
            minGap = gap;
            minStopGap = STOP_LINE_BUFFER_METERS;
            closestKind = null;
            stoppedBySignal = true;
          }
        }
      }
    }

    // 4. 中央交差点への進入前譲り合い判定（青でも交差点内に交差車両・歩行者が残っていれば待機）
    if (approachAxis && remaining < 9.5) {
      const bumperToStopLine =
        remaining - STOP_LINE_OFFSET_FROM_SEG_END - halfL;
      if (bumperToStopLine > -0.25) {
        for (let idx = 0; idx < obstacles.length; idx += 1) {
          const obs = obstacles[idx];
          if (obs.id === this.config.id) continue;
          if (Math.abs(obs.x) < 7.2 && Math.abs(obs.z) < 7.2) {
            const stopLineGap = Math.max(0, bumperToStopLine);
            if (stopLineGap < minGap) {
              minGap = stopLineGap;
              minStopGap = STOP_LINE_BUFFER_METERS;
              closestKind = obs.kind;
              closestPriority = obs.priority ?? Infinity;
              stoppedBySignal = false;
            }
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
        // 二次カーブ寄りの滑らかな減速（近距離で早めに速度を落とす）
        const curved = ratio * (0.45 + 0.55 * ratio);
        targetSpeed = Math.min(targetSpeed, baseTargetSpeed * curved);
        if (minGap < minStopGap + 1.6) {
          emergencyStop = true;
        }
      }

      if (closestKind === 'traffic' && !stoppedBySignal) {
        blockedOnlyByTraffic = true;
        blockingTrafficHasHigherPriority = closestPriority < this.priorityIndex;
      }
    }

    // 5. 交差点等での AI 同士デッドロック防止
    //    ※ 信号停止中や、バンパー間が安全車間以下のときは絶対に前進させない（めり込み防止）
    if (
      targetSpeed < 0.3 &&
      blockedOnlyByTraffic &&
      !stoppedBySignal &&
      minGap > VEHICLE_STOP_GAP_METERS + 0.3
    ) {
      this.blockedTimer += dt;
      if (this.blockedTimer > 3.5 && !blockingTrafficHasHigherPriority) {
        targetSpeed = baseTargetSpeed * 0.4;
        emergencyStop = false;
      }
    } else {
      this.blockedTimer = 0;
    }

    // 6. 滑らかな加減速
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + ACCEL_RATE * dt);
    } else if (this.speed > targetSpeed) {
      const rate = emergencyStop ? EMERGENCY_BRAKE_RATE : DECEL_RATE;
      this.speed = Math.max(targetSpeed, this.speed - rate * dt);
    }

    // 7. 道路セグメント上を前進・次セグメントへ遷移
    const travel = this.speed * dt;
    if (travel > 1e-6) {
      this.advanceAlongNetwork(travel);
      // 走行中に分離オフセットを滑らかにレーン中心へ復帰
      const decay = Math.exp(-3.2 * dt);
      this.sepOffsetX *= decay;
      this.sepOffsetZ *= decay;
      if (Math.abs(this.sepOffsetX) < 0.005) this.sepOffsetX = 0;
      if (Math.abs(this.sepOffsetZ) < 0.005) this.sepOffsetZ = 0;
    }

    // 8. 現在位置・向き・先読みステアリング角を更新
    sampleRoadSegment(this.currentSegment, this.segmentDistance, this.sampleNow);
    this.x = this.sampleNow.x + this.sepOffsetX;
    this.z = this.sampleNow.z + this.sepOffsetZ;

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

    // 9. 4輪回転＆前輪ステアリング反映
    const spinDelta = travel / this.avgWheelRadius;
    for (const slot of WHEEL_SLOTS) {
      const w = this.wheels[slot];
      if (!w) continue;
      if (w.steerable) {
        w.steerPivot.rotation.y = this.currentSteerAngle;
      }
      w.spinPivot.rotation.x += spinDelta;
    }

    // 10. メッシュ Transform & OBB コライダー同期
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
