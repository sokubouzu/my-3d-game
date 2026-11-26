import * as THREE from 'three';
import type { CollisionWorld } from '../world/collisionWorld';

export type CoinZone = 'city' | 'park' | 'plaza' | 'ring';

export interface CoinPlacement {
  id: string;
  zone: CoinZone;
  x: number;
  z: number;
}

export interface CoinMinimapPoint {
  x: number;
  z: number;
}

export interface CoinStatusSnapshot {
  /** 累計獲得枚数（localStorage 永続化） */
  totalCollected: number;
  /** 現在マップ上で取得済みの枚数 */
  fieldCollectedCount: number;
  /** マップ上の総コイン枚数 */
  totalFieldCoins: number;
  /** 直近獲得演出用タイムスタンプ (ms) */
  lastCollectTimeMs: number;
}

const STORAGE_KEY_TOTAL_COINS = 'my3dgame.coins.totalCollected';
const COIN_RESPAWN_SECONDS = 60.0;
const COIN_COLLECT_ANIM_SECONDS = 0.26;
const COIN_BASE_Y = 1.05;
const COIN_BOB_AMPLITUDE = 0.14;
const COIN_SPIN_SPEED = 2.3;

/**
 * 市街地・都市公園・駅前広場・外周道路にバランスよく配置した全38枚のゴールドコイン座標。
 * すべての座標は建物・駐車車両・街路樹・ベンチ・噴水・ボラード・街灯から十分離して選定している。
 */
export const COIN_PLACEMENTS: readonly CoinPlacement[] = [
  // --- 1. 市街地（中央十字路・幹線道路・歩道: 10枚） ---
  { id: 'coin_city_n1', zone: 'city', x: 0, z: -28 },
  { id: 'coin_city_n2', zone: 'city', x: 0, z: -56 },
  { id: 'coin_city_s1', zone: 'city', x: 0, z: 32 },
  { id: 'coin_city_s2', zone: 'city', x: 0, z: 60 },
  { id: 'coin_city_w1', zone: 'city', x: -32, z: 0 },
  { id: 'coin_city_w2', zone: 'city', x: -60, z: 0 },
  { id: 'coin_city_e1', zone: 'city', x: 32, z: 0 },
  { id: 'coin_city_e2', zone: 'city', x: 60, z: 0 },
  { id: 'coin_city_sw_nw', zone: 'city', x: -8.0, z: -10.0 },
  { id: 'coin_city_sw_se', zone: 'city', x: 8.0, z: 26.0 },

  // --- 2. 都市公園「さくら中央公園」（8枚） ---
  { id: 'coin_park_w1', zone: 'park', x: 22, z: -102 },
  { id: 'coin_park_w2', zone: 'park', x: 36, z: -102 },
  { id: 'coin_park_e1', zone: 'park', x: 74, z: -102 },
  { id: 'coin_park_e2', zone: 'park', x: 88, z: -102 },
  { id: 'coin_park_n1', zone: 'park', x: 55, z: -116 },
  { id: 'coin_park_s1', zone: 'park', x: 55, z: -88 },
  { id: 'coin_park_loop_nw', zone: 'park', x: 44, z: -114.5 },
  { id: 'coin_park_loop_se', zone: 'park', x: 66, z: -89.5 },

  // --- 3. 駅前ロータリー広場「中央駅南口」（6枚） ---
  { id: 'coin_plaza_rot_n', zone: 'plaza', x: 0, z: 88.5 },
  { id: 'coin_plaza_rot_e', zone: 'plaza', x: 15.5, z: 104 },
  { id: 'coin_plaza_rot_s', zone: 'plaza', x: 0, z: 119.5 },
  { id: 'coin_plaza_rot_w', zone: 'plaza', x: -15.5, z: 104 },
  { id: 'coin_plaza_west', zone: 'plaza', x: -24.5, z: 104 },
  { id: 'coin_plaza_east', zone: 'plaza', x: 24.5, z: 104 },

  // --- 4. 外周道路ループ（14枚） ---
  { id: 'coin_ring_n_w', zone: 'ring', x: -60, z: -134 },
  { id: 'coin_ring_n_c', zone: 'ring', x: 0, z: -134 },
  { id: 'coin_ring_n_e', zone: 'ring', x: 60, z: -134 },
  { id: 'coin_ring_c_ne', zone: 'ring', x: 121.7, z: -121.7 },
  { id: 'coin_ring_e_n', zone: 'ring', x: 134, z: -48 },
  { id: 'coin_ring_e_c', zone: 'ring', x: 134, z: 0 },
  { id: 'coin_ring_e_s', zone: 'ring', x: 134, z: 48 },
  { id: 'coin_ring_c_se', zone: 'ring', x: 121.7, z: 121.7 },
  { id: 'coin_ring_s_e', zone: 'ring', x: 60, z: 134 },
  { id: 'coin_ring_s_w', zone: 'ring', x: -60, z: 134 },
  { id: 'coin_ring_c_sw', zone: 'ring', x: -121.7, z: 121.7 },
  { id: 'coin_ring_w_c', zone: 'ring', x: -134, z: 0 },
  { id: 'coin_ring_w_n', zone: 'ring', x: -134, z: -48 },
  { id: 'coin_ring_c_nw', zone: 'ring', x: -121.7, z: -121.7 },
];

const COIN_STATE_ACTIVE = 0;
const COIN_STATE_COLLECTING = 1;
const COIN_STATE_RESPAWNING = 2;
type CoinState =
  | typeof COIN_STATE_ACTIVE
  | typeof COIN_STATE_COLLECTING
  | typeof COIN_STATE_RESPAWNING;

interface CoinRuntime {
  x: number;
  baseY: number;
  z: number;
  phase: number;
  state: CoinState;
  timer: number;
  spawnAnim: number;
  angleOffset: number;
}

function loadSavedTotalCoins(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TOTAL_COINS);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveTotalCoins(count: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_TOTAL_COINS, String(count));
  } catch {
    // プライベートブラウズ等で保存不可の場合は無視
  }
}

/**
 * 線分 (ax, az)-(bx, bz) と点 (px, pz) の最小二乗距離を計算（高速走行時のすり抜け防止、ゼロアロケーション）。
 */
function distSqPointToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) {
    return wx * wx + wz * wz;
  }
  let t = (wx * vx + wz * vz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + t * vx);
  const dz = pz - (az + t * vz);
  return dx * dx + dz * dz;
}

/**
 * 16要素の列優先 4x4 アフィン行列（Y軸回転 + 均一スケール + 平行移動）を直接書き込む（ゼロアロケーション）。
 */
function writeCoinMatrix(
  array: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
): void {
  const offset = index * 16;
  if (scale <= 0.0005) {
    array[offset] = 0;
    array[offset + 1] = 0;
    array[offset + 2] = 0;
    array[offset + 3] = 0;
    array[offset + 4] = 0;
    array[offset + 5] = 0;
    array[offset + 6] = 0;
    array[offset + 7] = 0;
    array[offset + 8] = 0;
    array[offset + 9] = 0;
    array[offset + 10] = 0;
    array[offset + 11] = 0;
    array[offset + 12] = x;
    array[offset + 13] = -10;
    array[offset + 14] = z;
    array[offset + 15] = 1;
    return;
  }

  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;

  array[offset] = c;
  array[offset + 1] = 0;
  array[offset + 2] = -s;
  array[offset + 3] = 0;

  array[offset + 4] = 0;
  array[offset + 5] = scale;
  array[offset + 6] = 0;
  array[offset + 7] = 0;

  array[offset + 8] = s;
  array[offset + 9] = 0;
  array[offset + 10] = c;
  array[offset + 11] = 0;

  array[offset + 12] = x;
  array[offset + 13] = y;
  array[offset + 14] = z;
  array[offset + 15] = 1;
}

/**
 * PHASE 4-B: 街中・公園・駅前広場・外周道路のゴールドコイン収集システム。
 * - 全38枚を2つの InstancedMesh（本体ディスク＋立体リム）のみで描画し、M1 iPad Air 60FPS を維持。
 * - 毎フレームの行列更新は Float32Array 直接書き込みでゼロアロケーション。
 * - 徒歩・乗用車・スポーツカー・バイクのすべてで獲得可能（線分距離判定で 160km/h でも取りこぼしなし）。
 * - 一定時間（60秒）または再配置ボタンで再出現し、累計獲得枚数は localStorage に自動保存。
 */
export class CoinCollectibleSystem {
  private readonly scene: THREE.Scene;
  private readonly root: THREE.Group;
  private readonly discMesh: THREE.InstancedMesh;
  private readonly rimMesh: THREE.InstancedMesh;
  private readonly discGeo: THREE.BufferGeometry;
  private readonly rimGeo: THREE.BufferGeometry;
  private readonly discMat: THREE.MeshStandardMaterial;
  private readonly rimMat: THREE.MeshStandardMaterial;

  private readonly coins: CoinRuntime[];
  private totalCollected: number;
  private fieldCollectedCount = 0;
  private lastCollectTimeMs = 0;
  private elapsedSec = 0;
  private prevActorX = 0;
  private prevActorZ = 0;
  private hasPrevActor = false;
  private lastNightFactor = -1;

  constructor(scene: THREE.Scene, collisionWorld: CollisionWorld) {
    this.scene = scene;
    this.totalCollected = loadSavedTotalCoins();

    this.root = new THREE.Group();
    this.root.name = 'CoinCollectiblesRoot';

    // コイン本体（直立させた厚みのある円盤）
    this.discGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.1, 24);
    this.discGeo.rotateX(Math.PI * 0.5);

    // 立体感のある外周リム
    this.rimGeo = new THREE.TorusGeometry(0.45, 0.065, 10, 24);

    this.discMat = new THREE.MeshStandardMaterial({
      color: 0xffcf33,
      metalness: 0.86,
      roughness: 0.22,
      emissive: new THREE.Color(0xff9f0a),
      emissiveIntensity: 0.34,
    });

    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xffe885,
      metalness: 0.92,
      roughness: 0.16,
      emissive: new THREE.Color(0xffb703),
      emissiveIntensity: 0.44,
    });

    const count = COIN_PLACEMENTS.length;
    this.discMesh = new THREE.InstancedMesh(this.discGeo, this.discMat, count);
    this.rimMesh = new THREE.InstancedMesh(this.rimGeo, this.rimMat, count);

    this.discMesh.castShadow = false;
    this.discMesh.receiveShadow = false;
    this.discMesh.frustumCulled = false;

    this.rimMesh.castShadow = false;
    this.rimMesh.receiveShadow = false;
    this.rimMesh.frustumCulled = false;

    this.root.add(this.discMesh, this.rimMesh);
    this.scene.add(this.root);

    this.coins = new Array<CoinRuntime>(count);
    for (let i = 0; i < count; i += 1) {
      const p = COIN_PLACEMENTS[i];
      const groundY = collisionWorld.getGroundHeight(p.x, p.z);
      this.coins[i] = {
        x: p.x,
        baseY: groundY + COIN_BASE_Y,
        z: p.z,
        phase: i * 0.55,
        state: COIN_STATE_ACTIVE,
        timer: 0,
        spawnAnim: 1,
        angleOffset: 0,
      };
    }

    this.syncMatrices();
  }

  /** 時間帯に応じてコインの視認性・輝きを微調整 */
  public setNightFactor(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - this.lastNightFactor) < 0.01) return;
    this.lastNightFactor = clamped;
    this.discMat.emissiveIntensity = 0.32 + clamped * 0.52;
    this.rimMat.emissiveIntensity = 0.42 + clamped * 0.62;
  }

  /**
   * 毎フレーム更新（回転アニメーション・取得判定・自動リスポーン）。
   * 戻り値: このフレームで新たに獲得したコイン枚数。
   */
  public update(
    dt: number,
    actorX: number,
    actorZ: number,
    isDriving: boolean,
  ): number {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedSec += clampedDt;

    if (!this.hasPrevActor) {
      this.prevActorX = actorX;
      this.prevActorZ = actorZ;
      this.hasPrevActor = true;
    }

    // 瞬間移動（リスポーン等）時は線分判定を使わず現在位置のみ判定する
    const moveDx = actorX - this.prevActorX;
    const moveDz = actorZ - this.prevActorZ;
    const isTeleport = moveDx * moveDx + moveDz * moveDz > 400; // 20m以上ジャンプ
    const segAx = isTeleport ? actorX : this.prevActorX;
    const segAz = isTeleport ? actorZ : this.prevActorZ;

    const pickupRadius = isDriving ? 2.45 : 1.55;
    const pickupRadiusSq = pickupRadius * pickupRadius;

    let newlyCollected = 0;
    const coins = this.coins;
    const len = coins.length;

    for (let i = 0; i < len; i += 1) {
      const c = coins[i];

      if (c.state === COIN_STATE_ACTIVE) {
        if (c.spawnAnim < 1) {
          c.spawnAnim = Math.min(1, c.spawnAnim + clampedDt * 3.6);
        }

        const dSq = distSqPointToSegment2D(
          c.x,
          c.z,
          segAx,
          segAz,
          actorX,
          actorZ,
        );
        if (dSq <= pickupRadiusSq) {
          c.state = COIN_STATE_COLLECTING;
          c.timer = 0;
          c.angleOffset = 0;
          newlyCollected += 1;
          this.totalCollected += 1;
          this.fieldCollectedCount += 1;
          this.lastCollectTimeMs = performance.now();
        }
      } else if (c.state === COIN_STATE_COLLECTING) {
        c.timer += clampedDt;
        c.angleOffset += clampedDt * 14.0;
        if (c.timer >= COIN_COLLECT_ANIM_SECONDS) {
          c.state = COIN_STATE_RESPAWNING;
          c.timer = COIN_RESPAWN_SECONDS;
        }
      } else {
        // Respawning
        c.timer -= clampedDt;
        if (c.timer <= 0) {
          c.state = COIN_STATE_ACTIVE;
          c.timer = 0;
          c.spawnAnim = 0.05;
          c.angleOffset = 0;
          this.fieldCollectedCount = Math.max(0, this.fieldCollectedCount - 1);
        }
      }
    }

    if (newlyCollected > 0) {
      saveTotalCoins(this.totalCollected);
    }

    this.prevActorX = actorX;
    this.prevActorZ = actorZ;

    this.syncMatrices();
    return newlyCollected;
  }

  /** 取得済みの全コインを即座に再配置する（累計獲得枚数は保持） */
  public respawnAll(): boolean {
    let changed = false;
    for (let i = 0; i < this.coins.length; i += 1) {
      const c = this.coins[i];
      if (c.state !== COIN_STATE_ACTIVE) {
        c.state = COIN_STATE_ACTIVE;
        c.timer = 0;
        c.spawnAnim = 0.08;
        c.angleOffset = 0;
        changed = true;
      }
    }
    this.fieldCollectedCount = 0;
    if (changed) {
      this.syncMatrices();
    }
    return changed;
  }

  /** ミニマップ用に現在未取得のコイン座標を書き込む（ゼロアロケーション） */
  public fillMinimapCoins(out: CoinMinimapPoint[], maxCount: number): number {
    let written = 0;
    const limit = Math.min(maxCount, out.length);
    for (let i = 0; i < this.coins.length && written < limit; i += 1) {
      const c = this.coins[i];
      if (c.state !== COIN_STATE_ACTIVE) continue;
      out[written].x = c.x;
      out[written].z = c.z;
      written += 1;
    }
    return written;
  }

  public getStatus(): CoinStatusSnapshot {
    return {
      totalCollected: this.totalCollected,
      fieldCollectedCount: this.fieldCollectedCount,
      totalFieldCoins: this.coins.length,
      lastCollectTimeMs: this.lastCollectTimeMs,
    };
  }

  public dispose(): void {
    this.scene.remove(this.root);
    this.discGeo.dispose();
    this.rimGeo.dispose();
    this.discMat.dispose();
    this.rimMat.dispose();
  }

  private syncMatrices(): void {
    const discArr = this.discMesh.instanceMatrix.array as Float32Array;
    const rimArr = this.rimMesh.instanceMatrix.array as Float32Array;
    const t = this.elapsedSec;
    const coins = this.coins;

    for (let i = 0; i < coins.length; i += 1) {
      const c = coins[i];
      if (c.state === COIN_STATE_RESPAWNING) {
        writeCoinMatrix(discArr, i, c.x, -10, c.z, 0, 0);
        writeCoinMatrix(rimArr, i, c.x, -10, c.z, 0, 0);
        continue;
      }

      let y = c.baseY + Math.sin(t * 2.6 + c.phase) * COIN_BOB_AMPLITUDE;
      let yaw = t * COIN_SPIN_SPEED + c.phase + c.angleOffset;
      let scale = c.spawnAnim;

      if (c.state === COIN_STATE_COLLECTING) {
        const p = Math.min(1, c.timer / COIN_COLLECT_ANIM_SECONDS);
        y += p * 1.35;
        scale = Math.max(0, (1 - p) * (1 + p * 0.35));
      } else if (scale < 1) {
        // 滑らかなポップイン
        const easeOut = 1 - (1 - scale) * (1 - scale);
        scale = easeOut;
      }

      writeCoinMatrix(discArr, i, c.x, y, c.z, yaw, scale);
      writeCoinMatrix(rimArr, i, c.x, y, c.z, yaw, scale);
    }

    this.discMesh.instanceMatrix.needsUpdate = true;
    this.rimMesh.instanceMatrix.needsUpdate = true;
  }
}
