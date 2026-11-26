export interface ObbCollider {
  id: string;
  /** 中心 X (m) */
  cx: number;
  /** 中心 Z (m) */
  cz: number;
  /** ローカル X 方向の半幅 (m) */
  halfW: number;
  /** ローカル Z 方向の半奥行 (m) */
  halfD: number;
  /** cos(rotationY) */
  cos: number;
  /** sin(rotationY) */
  sin: number;
  /** 下端 Y (m) */
  minY: number;
  /** 上端 Y (m) */
  maxY: number;
}

export interface HorizontalCollisionResult {
  x: number;
  z: number;
  collided: boolean;
}

export interface VehicleCollisionResult {
  x: number;
  z: number;
  collided: boolean;
  /** 衝突押し出し方向（正規化法線 X） */
  normalX: number;
  /** 衝突押し出し方向（正規化法線 Z） */
  normalZ: number;
  /** 衝突が発生したワールド座標 X (m) */
  contactX: number;
  /** 衝突が発生したワールド座標 Z (m) */
  contactZ: number;
  /** 最も強く衝突したコライダー ID（外周壁の場合は 'world_boundary'、未衝突時は null） */
  hitColliderId: string | null;
}

export interface ObbBox2D {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  cos: number;
  sin: number;
}

export interface ObbSeparationResult {
  overlapped: boolean;
  /** boxA を boxB から引き離す最小押し出しベクトル X */
  pushX: number;
  /** boxA を boxB から引き離す最小押し出しベクトル Z */
  pushZ: number;
  /** 最小侵入深度 (m) */
  penetration: number;
}

/**
 * 2D OBB 同士の分離軸定理 (SAT) による最小侵入深度 (MTV) 計算（ゼロアロケーション）。
 * 重なっている場合、boxA を boxB から引き離す最小押し出しベクトル (pushX, pushZ) を out へ書き込む。
 */
export function computeObbObbSeparation(
  a: ObbBox2D,
  b: ObbBox2D,
  out: ObbSeparationResult,
  extraMargin = 0,
): boolean {
  out.overlapped = false;
  out.pushX = 0;
  out.pushZ = 0;
  out.penetration = 0;

  // ブロードフェーズ（外接円半径チェック）
  const aRad = Math.hypot(a.halfW, a.halfD) + extraMargin;
  const bRad = Math.hypot(b.halfW, b.halfD);
  const dx = a.cx - b.cx;
  const dz = a.cz - b.cz;
  const maxDist = aRad + bRad;
  if (dx * dx + dz * dz >= maxDist * maxDist) {
    return false;
  }

  // ローカル軸ベクトル: +X = (cos, -sin), +Z = (sin, cos)
  const ax0 = a.cos;
  const az0 = -a.sin;
  const ax1 = a.sin;
  const az1 = a.cos;

  const bx0 = b.cos;
  const bz0 = -b.sin;
  const bx1 = b.sin;
  const bz1 = b.cos;

  const aHW = a.halfW + extraMargin;
  const aHD = a.halfD + extraMargin;
  const bHW = b.halfW;
  const bHD = b.halfD;

  let minOverlap = Infinity;
  let bestAxisX = 0;
  let bestAxisZ = 0;

  // 4本の分離軸を検証（配列確保なし）
  for (let i = 0; i < 4; i += 1) {
    let axisX: number;
    let axisZ: number;
    if (i === 0) {
      axisX = ax0;
      axisZ = az0;
    } else if (i === 1) {
      axisX = ax1;
      axisZ = az1;
    } else if (i === 2) {
      axisX = bx0;
      axisZ = bz0;
    } else {
      axisX = bx1;
      axisZ = bz1;
    }

    const projA =
      aHW * Math.abs(ax0 * axisX + az0 * axisZ) +
      aHD * Math.abs(ax1 * axisX + az1 * axisZ);
    const projB =
      bHW * Math.abs(bx0 * axisX + bz0 * axisZ) +
      bHD * Math.abs(bx1 * axisX + bz1 * axisZ);
    const centerDist = dx * axisX + dz * axisZ;
    const overlap = projA + projB - Math.abs(centerDist);

    if (overlap <= 0) {
      return false;
    }

    if (overlap < minOverlap) {
      minOverlap = overlap;
      // boxB -> boxA 方向へ押し出す向きに揃える
      if (centerDist < 0) {
        bestAxisX = -axisX;
        bestAxisZ = -axisZ;
      } else {
        bestAxisX = axisX;
        bestAxisZ = axisZ;
      }
    }
  }

  out.overlapped = true;
  out.penetration = minOverlap;
  out.pushX = bestAxisX * minOverlap;
  out.pushZ = bestAxisZ * minOverlap;
  return true;
}

/** 街区レイアウトの道路・歩道・拡張エリア定数 (360m x 360m 拡張マップ / 内側160mコア街区) */
export const CITY_METRICS = {
  /** 内側コア市街地の半幅 (既存 160m 四方 -> 80m) */
  innerCityHalfSize: 80,
  /** 拡張マップ全体の半幅 (360m 四方 -> 180m) */
  cityHalfSize: 180,
  /** プレイヤー・車両の移動可能半幅 */
  worldHalfExtent: 174,
  /** 幹線車道の半幅 (全幅 12m: 片側2車線相当) */
  roadHalfWidth: 6.0,
  /** 歩道外側までの半幅 (歩道幅 4m -> 6m..10m) */
  sidewalkOuterHalf: 10.0,
  /** 内側コア街区歩道の高さ (m) — 拡張道路・公園・広場は Y = 0 統一 */
  sidewalkHeight: 0.12,
  /** 歩道縁石の段差補間幅 (m) */
  curbSlopeWidth: 0.45,
  /** 外周道路ループの中心線半幅 (±134m) */
  outerRingHalfSpan: 134,
  /** 外周道路ループの四隅コーナー中心線半径 (m, 直線区間は -92..+92 = 184m、高速走行対応の緩やかカーブ) */
  outerRingCornerRadius: 42,
  /** 外周道路ループの車道半幅 (全幅 16m: 片側2車線 4.0m×2 のゆとりある幅員) */
  outerRingHalfWidth: 8.0,
  /** 外周道路ループの内側歩道幅 (m) */
  outerRingInnerSidewalkWidth: 3.5,
  /** 外周道路ループの外側歩道幅 (m) */
  outerRingOuterSidewalkWidth: 4.0,
  /** 北東拡張エリアの都市公園（さくら中央公園）矩形範囲 (Y = 0) */
  parkBounds: {
    minX: 14,
    maxX: 96,
    minZ: -120,
    maxZ: -84,
  },
  /** 南側拡張エリアの駅前ロータリー広場（中央駅南口ロータリー）設定 (Y = 0) */
  rotaryCenter: { x: 0, z: 104 },
  rotaryIslandRadius: 10.5,
  rotaryOuterRoadRadius: 20.5,
  plazaBounds: {
    minX: -44,
    maxX: 44,
    minZ: 80,
    maxZ: 122.5,
  },
} as const;

/**
 * 1-D: 建物・車両・小物・地面の簡略化当たり判定（2D OBB + 地面高さ）を管理するモジュール。
 */
export class CollisionWorld {
  private readonly colliders = new Map<string, ObbCollider>();
  public readonly worldHalfExtent: number;
  private readonly scratchVehicleObb: ObbBox2D = {
    cx: 0,
    cz: 0,
    halfW: 0.9,
    halfD: 2.2,
    cos: 1,
    sin: 0,
  };
  private readonly scratchSep: ObbSeparationResult = {
    overlapped: false,
    pushX: 0,
    pushZ: 0,
    penetration: 0,
  };

  constructor(worldHalfExtent: number = CITY_METRICS.worldHalfExtent) {
    this.worldHalfExtent = worldHalfExtent;
  }

  /** OBB コライダーを登録または更新 */
  public upsertCollider(
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ): void {
    const halfW = Math.max(0.1, width * 0.5);
    const halfD = Math.max(0.1, depth * 0.5);
    this.colliders.set(id, {
      id,
      cx,
      cz,
      halfW,
      halfD,
      cos: Math.cos(rotationY),
      sin: Math.sin(rotationY),
      minY,
      maxY,
    });
  }

  /** コライダーを削除 */
  public removeCollider(id: string): void {
    this.colliders.delete(id);
  }

  /** 登録済みコライダー数 */
  public getColliderCount(): number {
    return this.colliders.size;
  }

  /**
   * 指定 (x, z) における地面の高さを返す。
   * - 車道（|x| <= 6 または |z| <= 6）および拡張エリア（|x| >= 80 または |z| >= 80 の外周道路・公園・広場）はすべて Y = 0 に統一。
   * - 内側コア市街地の4街区（6 < |x| < 80 かつ 6 < |z| < 80）のみ Y = 0.12 の歩道高とし、縁石付近を滑らかに補間する。
   */
  public getGroundHeight(x: number, z: number): number {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const roadEdge = CITY_METRICS.roadHalfWidth;
    const innerOuterEdge = CITY_METRICS.innerCityHalfSize;
    const slope = CITY_METRICS.curbSlopeWidth;
    const h = CITY_METRICS.sidewalkHeight;

    if (
      ax <= roadEdge ||
      az <= roadEdge ||
      ax >= innerOuterEdge ||
      az >= innerOuterEdge
    ) {
      return 0;
    }

    const distFromRoad = Math.min(ax - roadEdge, az - roadEdge);
    const distFromOuter = Math.min(innerOuterEdge - ax, innerOuterEdge - az);
    const edgeDist = Math.min(distFromRoad, distFromOuter);
    if (edgeDist >= slope) {
      return h;
    }
    return h * (edgeDist / slope);
  }

  /**
   * プレイヤー円柱（半径 radius）と登録済み OBB コライダーの水平押し出し衝突解決。
   * 壁ずり移動が滑らかになるよう最大 3 回反復解決する。
   */
  public resolveHorizontalCollision(
    x: number,
    y: number,
    z: number,
    radius: number,
    playerHeight: number,
  ): HorizontalCollisionResult {
    let px = x;
    let pz = z;
    let collided = false;

    const playerTop = y + playerHeight;
    const stepAllowance = 0.28; // 低い縁石や段差は乗り越え可能

    for (let iter = 0; iter < 3; iter += 1) {
      let movedThisIter = false;

      for (const col of this.colliders.values()) {
        // 垂直方向の重なり判定
        if (playerTop <= col.minY + 0.05 || y >= col.maxY - stepAllowance) {
          continue;
        }

        // ワールド -> OBB ローカル座標へ変換 (rotationY の逆回転)
        const dx = px - col.cx;
        const dz = pz - col.cz;
        const localX = dx * col.cos - dz * col.sin;
        const localZ = dx * col.sin + dz * col.cos;

        // ブロードフェーズ (半径込み AABB 判定)
        if (
          Math.abs(localX) >= col.halfW + radius ||
          Math.abs(localZ) >= col.halfD + radius
        ) {
          continue;
        }

        // OBB 上の最近接点
        const clampedX = Math.max(-col.halfW, Math.min(col.halfW, localX));
        const clampedZ = Math.max(-col.halfD, Math.min(col.halfD, localZ));

        const diffX = localX - clampedX;
        const diffZ = localZ - clampedZ;
        const distSq = diffX * diffX + diffZ * diffZ;

        if (distSq >= radius * radius) {
          continue;
        }

        let pushLocalX = 0;
        let pushLocalZ = 0;

        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          pushLocalX = (diffX / dist) * overlap;
          pushLocalZ = (diffZ / dist) * overlap;
        } else {
          // プレイヤー中心が OBB 内部に入り込んだ場合は最も近い辺へ押し出す
          const penX = col.halfW - Math.abs(localX) + radius;
          const penZ = col.halfD - Math.abs(localZ) + radius;
          if (penX < penZ) {
            pushLocalX = localX >= 0 ? penX : -penX;
          } else {
            pushLocalZ = localZ >= 0 ? penZ : -penZ;
          }
        }

        // ローカル押し出しベクトル -> ワールド空間へ戻す
        const pushWorldX = pushLocalX * col.cos + pushLocalZ * col.sin;
        const pushWorldZ = -pushLocalX * col.sin + pushLocalZ * col.cos;

        px += pushWorldX;
        pz += pushWorldZ;
        collided = true;
        movedThisIter = true;
      }

      if (!movedThisIter) {
        break;
      }
    }

    // ワールド外周境界クランプ
    const limit = this.worldHalfExtent - radius;
    if (px < -limit) {
      px = -limit;
      collided = true;
    } else if (px > limit) {
      px = limit;
      collided = true;
    }
    if (pz < -limit) {
      pz = -limit;
      collided = true;
    } else if (pz > limit) {
      pz = limit;
      collided = true;
    }

    return { x: px, z: pz, collided };
  }

  /**
   * 2-B: 車両用の3円（前・中・後）vs OBB 衝突解決。
   * 建物・他車両・小物・街区外周壁とのすり抜けを防ぎ、押し出し法線を返す。
   */
  public resolveVehicleCollision(
    x: number,
    z: number,
    yaw: number,
    width: number,
    length: number,
    ignoreId?: string,
  ): VehicleCollisionResult {
    let cx = x;
    let cz = z;
    let collided = false;
    let totalPushX = 0;
    let totalPushZ = 0;
    let bestHitWeight = 0;
    let contactX = x;
    let contactZ = z;
    let hitColliderId: string | null = null;

    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const radius = Math.max(0.45, width * 0.46);
    const longitudinalOffset = Math.max(0, length * 0.5 - radius);
    const offsets = [-longitudinalOffset, 0, longitudinalOffset];
    const limit = this.worldHalfExtent - radius;

    for (let iter = 0; iter < 3; iter += 1) {
      let movedThisIter = false;

      for (const offset of offsets) {
        let sx = cx + fwdX * offset;
        let sz = cz + fwdZ * offset;
        let spherePushX = 0;
        let spherePushZ = 0;

        for (const col of this.colliders.values()) {
          if (ignoreId && col.id === ignoreId) continue;
          if (col.maxY < 0.25) continue;

          const dx = sx - col.cx;
          const dz = sz - col.cz;
          const localX = dx * col.cos - dz * col.sin;
          const localZ = dx * col.sin + dz * col.cos;

          if (
            Math.abs(localX) >= col.halfW + radius ||
            Math.abs(localZ) >= col.halfD + radius
          ) {
            continue;
          }

          const clampedX = Math.max(-col.halfW, Math.min(col.halfW, localX));
          const clampedZ = Math.max(-col.halfD, Math.min(col.halfD, localZ));

          const diffX = localX - clampedX;
          const diffZ = localZ - clampedZ;
          const distSq = diffX * diffX + diffZ * diffZ;
          if (distSq >= radius * radius) continue;

          let pushLocalX = 0;
          let pushLocalZ = 0;
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            pushLocalX = (diffX / dist) * overlap;
            pushLocalZ = (diffZ / dist) * overlap;
          } else {
            const penX = col.halfW - Math.abs(localX) + radius;
            const penZ = col.halfD - Math.abs(localZ) + radius;
            if (penX < penZ) {
              pushLocalX = localX >= 0 ? penX : -penX;
            } else {
              pushLocalZ = localZ >= 0 ? penZ : -penZ;
            }
          }

          const pushWorldX = pushLocalX * col.cos + pushLocalZ * col.sin;
          const pushWorldZ = -pushLocalX * col.sin + pushLocalZ * col.cos;
          const pushMag = Math.hypot(pushWorldX, pushWorldZ);
          if (pushMag > bestHitWeight) {
            bestHitWeight = pushMag;
            // OBB 上の最近接点をワールド座標へ変換して衝突ポイントとする
            contactX = col.cx + clampedX * col.cos + clampedZ * col.sin;
            contactZ = col.cz - clampedX * col.sin + clampedZ * col.cos;
            hitColliderId = col.id;
          }

          sx += pushWorldX;
          sz += pushWorldZ;
          spherePushX += pushWorldX;
          spherePushZ += pushWorldZ;
        }

        // 街区外周壁クランプ
        if (sx < -limit) {
          const pen = -limit - sx;
          if (pen > bestHitWeight) {
            bestHitWeight = pen;
            contactX = -this.worldHalfExtent;
            contactZ = sz;
            hitColliderId = 'world_boundary';
          }
          spherePushX += pen;
          sx = -limit;
        } else if (sx > limit) {
          const pen = sx - limit;
          if (pen > bestHitWeight) {
            bestHitWeight = pen;
            contactX = this.worldHalfExtent;
            contactZ = sz;
            hitColliderId = 'world_boundary';
          }
          spherePushX -= pen;
          sx = limit;
        }
        if (sz < -limit) {
          const pen = -limit - sz;
          if (pen > bestHitWeight) {
            bestHitWeight = pen;
            contactX = sx;
            contactZ = -this.worldHalfExtent;
            hitColliderId = 'world_boundary';
          }
          spherePushZ += pen;
          sz = -limit;
        } else if (sz > limit) {
          const pen = sz - limit;
          if (pen > bestHitWeight) {
            bestHitWeight = pen;
            contactX = sx;
            contactZ = this.worldHalfExtent;
            hitColliderId = 'world_boundary';
          }
          spherePushZ -= pen;
          sz = limit;
        }

        if (Math.abs(spherePushX) > 1e-6 || Math.abs(spherePushZ) > 1e-6) {
          cx += spherePushX;
          cz += spherePushZ;
          totalPushX += spherePushX;
          totalPushZ += spherePushZ;
          collided = true;
          movedThisIter = true;
        }
      }

      if (!movedThisIter) break;
    }

    // 3-B: 車体 OBB 同士（自車 vs AI車両・駐車車両・建物）の角めり込みを防ぐ SAT 最小侵入深度分離パス
    const vehObb = this.scratchVehicleObb;
    vehObb.halfW = Math.max(0.4, width * 0.48);
    vehObb.halfD = Math.max(0.4, length * 0.49);
    vehObb.cos = fwdZ;
    vehObb.sin = fwdX;
    const sep = this.scratchSep;

    for (let iter = 0; iter < 3; iter += 1) {
      let separated = false;
      vehObb.cx = cx;
      vehObb.cz = cz;

      for (const col of this.colliders.values()) {
        if (ignoreId && col.id === ignoreId) continue;
        if (col.maxY < 0.25) continue;

        if (computeObbObbSeparation(vehObb, col, sep, 0.02)) {
          cx += sep.pushX;
          cz += sep.pushZ;
          vehObb.cx = cx;
          vehObb.cz = cz;
          totalPushX += sep.pushX;
          totalPushZ += sep.pushZ;
          collided = true;
          separated = true;
          if (sep.penetration > bestHitWeight) {
            bestHitWeight = sep.penetration;
            // 押し出し法線の逆向きにある車体表面近傍を衝突点として近似
            const pLen = Math.hypot(sep.pushX, sep.pushZ);
            if (pLen > 1e-6) {
              const nx = sep.pushX / pLen;
              const nz = sep.pushZ / pLen;
              const localNX = nx * vehObb.cos - nz * vehObb.sin;
              const localNZ = nx * vehObb.sin + nz * vehObb.cos;
              const surfLocalX = -Math.sign(localNX) * Math.min(vehObb.halfW, Math.abs(localNX) * vehObb.halfW * 1.35);
              const surfLocalZ = -Math.sign(localNZ) * Math.min(vehObb.halfD, Math.abs(localNZ) * vehObb.halfD * 1.35);
              contactX = cx + surfLocalX * vehObb.cos + surfLocalZ * vehObb.sin;
              contactZ = cz - surfLocalX * vehObb.sin + surfLocalZ * vehObb.cos;
            }
            hitColliderId = col.id;
          }
        }
      }

      if (!separated) break;
    }

    const pushLen = Math.hypot(totalPushX, totalPushZ);
    const normalX = pushLen > 1e-6 ? totalPushX / pushLen : 0;
    const normalZ = pushLen > 1e-6 ? totalPushZ / pushLen : 0;

    return {
      x: cx,
      z: cz,
      collided,
      normalX,
      normalZ,
      contactX,
      contactZ,
      hitColliderId,
    };
  }

  /**
   * 指定座標 (x, z) が障害物および街区境界から安全に空いているか判定する（降車位置検証用）。
   */
  public isPointClear(
    x: number,
    z: number,
    radius: number,
    ignoreId?: string,
  ): boolean {
    const limit = this.worldHalfExtent - radius;
    if (x < -limit || x > limit || z < -limit || z > limit) {
      return false;
    }

    for (const col of this.colliders.values()) {
      if (ignoreId && col.id === ignoreId) continue;
      if (col.maxY < 0.28) continue;

      const dx = x - col.cx;
      const dz = z - col.cz;
      const localX = dx * col.cos - dz * col.sin;
      const localZ = dx * col.sin + dz * col.cos;

      if (
        Math.abs(localX) >= col.halfW + radius ||
        Math.abs(localZ) >= col.halfD + radius
      ) {
        continue;
      }

      const clampedX = Math.max(-col.halfW, Math.min(col.halfW, localX));
      const clampedZ = Math.max(-col.halfD, Math.min(col.halfD, localZ));
      const diffX = localX - clampedX;
      const diffZ = localZ - clampedZ;
      if (diffX * diffX + diffZ * diffZ < radius * radius) {
        return false;
      }
    }
    return true;
  }

  /**
   * 2-C: カメラ遮蔽回避用の 3D Ray vs OBB スラブ法レイキャスト。
   * 注視点 (origin) からカメラ方向 (dir, 正規化済み) へ距離 maxDistance のレイを飛ばし、
   * 建物・壁・駐車車両・街区外周壁に遮られる場合は最も近いヒット距離 (m) を返す（遮蔽なしは null）。
   */
  public raycastCameraOcclusion(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDistance: number,
    ignoreId?: string,
    minObstacleHeight = 1.2,
  ): number | null {
    if (maxDistance <= 0.01) return null;

    let closestHit = maxDistance;
    let hasHit = false;
    const eps = 1e-6;

    // 1. 登録済み OBB コライダー（建物・駐車車両・自販機等）との 3D スラブ交差判定
    for (const col of this.colliders.values()) {
      if (ignoreId && col.id === ignoreId) continue;
      if (col.maxY < minObstacleHeight) continue;

      const relX = originX - col.cx;
      const relZ = originZ - col.cz;
      const ox = relX * col.cos - relZ * col.sin;
      const oz = relX * col.sin + relZ * col.cos;
      const dx = dirX * col.cos - dirZ * col.sin;
      const dz = dirX * col.sin + dirZ * col.cos;

      let tMin = 0;
      let tMax = closestHit;

      // X スラブ [-halfW, +halfW]
      if (Math.abs(dx) < eps) {
        if (ox < -col.halfW || ox > col.halfW) continue;
      } else {
        const invDx = 1 / dx;
        let t1 = (-col.halfW - ox) * invDx;
        let t2 = (col.halfW - ox) * invDx;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Y スラブ [minY, maxY]
      if (Math.abs(dirY) < eps) {
        if (originY < col.minY || originY > col.maxY) continue;
      } else {
        const invDy = 1 / dirY;
        let t1 = (col.minY - originY) * invDy;
        let t2 = (col.maxY - originY) * invDy;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Z スラブ [-halfD, +halfD]
      if (Math.abs(dz) < eps) {
        if (oz < -col.halfD || oz > col.halfD) continue;
      } else {
        const invDz = 1 / dz;
        let t1 = (-col.halfD - oz) * invDz;
        let t2 = (col.halfD - oz) * invDz;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // 注視点が外部にあり、レイ前方でヒットした場合のみ採用
      if (tMin > 0.02 && tMin < closestHit) {
        closestHit = tMin;
        hasHit = true;
      }
    }

    // 2. 街区外周境界壁との交差判定（カメラの街区外はみ出し防止）
    const boundary = this.worldHalfExtent;
    if (Math.abs(dirX) >= eps) {
      const boundX = dirX > 0 ? boundary : -boundary;
      const t = (boundX - originX) / dirX;
      if (t > 0.02 && t < closestHit) {
        closestHit = t;
        hasHit = true;
      }
    }
    if (Math.abs(dirZ) >= eps) {
      const boundZ = dirZ > 0 ? boundary : -boundary;
      const t = (boundZ - originZ) / dirZ;
      if (t > 0.02 && t < closestHit) {
        closestHit = t;
        hasHit = true;
      }
    }

    return hasHit ? closestHit : null;
  }
}
