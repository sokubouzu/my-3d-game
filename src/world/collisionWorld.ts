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

/** 街区レイアウトの道路・歩道定数 (160m x 160m 街区) */
export const CITY_METRICS = {
  /** 街区全体の半幅 (160m 四方 -> 80m) */
  cityHalfSize: 80,
  /** プレイヤーの移動可能半幅 */
  worldHalfExtent: 78,
  /** 車道の半幅 (全幅 12m: 片側2車線相当) */
  roadHalfWidth: 6.0,
  /** 歩道外側までの半幅 (歩道幅 4m -> 6m..10m) */
  sidewalkOuterHalf: 10.0,
  /** 歩道の高さ (m) */
  sidewalkHeight: 0.12,
  /** 歩道縁石の段差補間幅 (m) */
  curbSlopeWidth: 0.45,
} as const;

/**
 * 1-D: 建物・車両・小物・地面の簡略化当たり判定（2D OBB + 地面高さ）を管理するモジュール。
 */
export class CollisionWorld {
  private readonly colliders = new Map<string, ObbCollider>();
  public readonly worldHalfExtent: number;

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
   * 車道（|x| < 6 または |z| < 6）は Y = 0、街区・歩道は Y = 0.12。
   * 縁石付近は滑らかにスロープ補間して段差引っかかりを防ぐ。
   */
  public getGroundHeight(x: number, z: number): number {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const roadEdge = CITY_METRICS.roadHalfWidth;
    const slope = CITY_METRICS.curbSlopeWidth;
    const h = CITY_METRICS.sidewalkHeight;

    const minDistFromRoadAxis = Math.min(ax, az);
    if (minDistFromRoadAxis <= roadEdge) {
      return 0;
    }
    if (minDistFromRoadAxis >= roadEdge + slope) {
      return h;
    }
    const t = (minDistFromRoadAxis - roadEdge) / slope;
    return h * t;
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
}
