import { CITY_METRICS, type CollisionWorld } from '../world/collisionWorld';

export interface SafeRoadPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface RoadProjection {
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  distSq: number;
  laneOffset: number;
  forceDirection: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function projectToSegment(
  x: number,
  z: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  laneOffset: number,
): RoadProjection {
  const vx = x1 - x0;
  const vz = z1 - z0;
  const len = Math.hypot(vx, vz);
  const tx = len > 1e-6 ? vx / len : 0;
  const tz = len > 1e-6 ? vz / len : 1;
  const t = len > 1e-6 ? clamp(((x - x0) * vx + (z - z0) * vz) / (len * len), 0, 1) : 0;
  const cx = x0 + vx * t;
  const cz = z0 + vz * t;
  const dx = x - cx;
  const dz = z - cz;
  return {
    cx,
    cz,
    tx,
    tz,
    distSq: dx * dx + dz * dz,
    laneOffset,
    forceDirection: false,
  };
}

function projectToArc(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radius: number,
  minAngle: number,
  maxAngle: number,
  laneOffset: number,
  fullCircle: boolean,
  forceClockwise: boolean,
): RoadProjection {
  let angle = Math.atan2(z - centerZ, x - centerX);
  if (!fullCircle) {
    // 角度範囲 [minAngle, maxAngle] へ最も近い角度にクランプ
    while (angle < minAngle - Math.PI) angle += Math.PI * 2;
    while (angle > maxAngle + Math.PI) angle -= Math.PI * 2;
    angle = clamp(angle, minAngle, maxAngle);
  }
  const rx = Math.cos(angle);
  const rz = Math.sin(angle);
  const cx = centerX + rx * radius;
  const cz = centerZ + rz * radius;
  const dx = x - cx;
  const dz = z - cz;
  // X-Z 平面での時計回り接線ベクトル = (-sin(a), cos(a))
  const tx = -rz;
  const tz = rx;
  return {
    cx,
    cz,
    tx,
    tz,
    distSq: dx * dx + dz * dz,
    laneOffset,
    forceDirection: forceClockwise,
  };
}

/**
 * PHASE 4-B: 車両・バイクのスタック脱出（車体復帰）用。
 * 現在位置 (x, z) から最も近い車道（中央幹線・外周道路ループ・駅前ロータリー）上の
 * 安全かつ正しい進行方向（日本の左側通行基準）のリスポーン位置を計算して返す。
 */
export function findNearestSafeRoadPose(
  x: number,
  z: number,
  currentYaw: number,
  vehicleWidth: number,
  vehicleLength: number,
  ignoreId: string,
  collisionWorld: CollisionWorld,
): SafeRoadPose {
  const ringSpan = CITY_METRICS.outerRingHalfSpan; // 134
  const cornerR = CITY_METRICS.outerRingCornerRadius; // 42
  const straightLim = ringSpan - cornerR; // 92
  const armEnd = ringSpan - CITY_METRICS.outerRingHalfWidth - 2; // 124
  const rotC = CITY_METRICS.rotaryCenter; // (0, 104)
  const rotMidR =
    (CITY_METRICS.rotaryIslandRadius + CITY_METRICS.rotaryOuterRoadRadius) * 0.5; // 15.5

  const arterialLane = 2.0;
  const outerLane = 3.2;

  const candidates: RoadProjection[] = [
    // 1. 南北幹線（北側 -124..+78）
    projectToSegment(x, z, 0, -armEnd, 0, 78, arterialLane),
    // 2. 東西幹線（-124..+124）
    projectToSegment(x, z, -armEnd, 0, armEnd, 0, arterialLane),
    // 3. 外周道路ループ直線4本
    projectToSegment(x, z, -straightLim, -ringSpan, straightLim, -ringSpan, outerLane),
    projectToSegment(x, z, -straightLim, ringSpan, straightLim, ringSpan, outerLane),
    projectToSegment(x, z, ringSpan, -straightLim, ringSpan, straightLim, outerLane),
    projectToSegment(x, z, -ringSpan, -straightLim, -ringSpan, straightLim, outerLane),
    // 4. 外周道路ループ4コーナー（R = 42m）
    // 北東 (center: +92, -92, angle: -PI/2 .. 0)
    projectToArc(x, z, straightLim, -straightLim, cornerR, -Math.PI * 0.5, 0, outerLane, false, false),
    // 南東 (center: +92, +92, angle: 0 .. +PI/2)
    projectToArc(x, z, straightLim, straightLim, cornerR, 0, Math.PI * 0.5, outerLane, false, false),
    // 南西 (center: -92, +92, angle: +PI/2 .. +PI)
    projectToArc(x, z, -straightLim, straightLim, cornerR, Math.PI * 0.5, Math.PI, outerLane, false, false),
    // 北西 (center: -92, -92, angle: -PI .. -PI/2)
    projectToArc(x, z, -straightLim, -straightLim, cornerR, -Math.PI, -Math.PI * 0.5, outerLane, false, false),
    // 5. 駅前ロータリー環状車道（日本の左側通行＝時計回り）
    projectToArc(x, z, rotC.x, rotC.z, rotMidR, 0, Math.PI * 2, 0, true, true),
  ];

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].distSq < best.distSq) {
      best = candidates[i];
    }
  }

  // 車両の現在向きに合わせて進行方向を選択（ロータリーは時計回り固定）
  let tx = best.tx;
  let tz = best.tz;
  if (!best.forceDirection) {
    const curFwdX = Math.sin(currentYaw);
    const curFwdZ = Math.cos(currentYaw);
    if (curFwdX * tx + curFwdZ * tz < 0) {
      tx = -tx;
      tz = -tz;
    }
  }

  const yaw = Math.atan2(tx, tz);
  // 左側通行オフセット（進行方向に対して左ベクトル = (tz, -tx)）
  const leftX = tz;
  const leftZ = -tx;

  const baseX = best.cx + leftX * best.laneOffset;
  const baseZ = best.cz + leftZ * best.laneOffset;

  // 障害物（AI交通車両・駐車車両・街灯等）と重ならない安全な空き位置を検証
  const clearRadius = Math.max(1.3, Math.min(2.4, Math.max(vehicleWidth, vehicleLength) * 0.45));
  const probeSteps: ReadonlyArray<[number, number]> = [
    [0, 0],
    [5, 0],
    [-5, 0],
    [10, 0],
    [-10, 0],
    [0, -best.laneOffset], // 車道中央
    [6, -best.laneOffset],
    [-6, -best.laneOffset],
    [15, 0],
    [-15, 0],
  ];

  for (const [along, lateral] of probeSteps) {
    const px = baseX + tx * along + leftX * lateral;
    const pz = baseZ + tz * along + leftZ * lateral;
    if (collisionWorld.isPointClear(px, pz, clearRadius, ignoreId)) {
      const groundY = Math.max(0, collisionWorld.getGroundHeight(px, pz));
      return { x: px, y: groundY, z: pz, yaw };
    }
  }

  // 万一すべて塞がっていた場合は最終衝突解決を通して安全復帰
  const resolved = collisionWorld.resolveVehicleCollision(
    baseX,
    baseZ,
    yaw,
    vehicleWidth,
    vehicleLength,
    ignoreId,
  );
  return {
    x: resolved.x,
    y: Math.max(0, collisionWorld.getGroundHeight(resolved.x, resolved.z)),
    z: resolved.z,
    yaw,
  };
}
