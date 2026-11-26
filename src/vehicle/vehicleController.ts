import * as THREE from 'three';
import type { CollisionWorld } from '../world/collisionWorld';
import type { LoadedHeroVehicle } from './vehicleModel';

export type VehicleGear = 'P' | 'N' | 'D' | 'R';

export interface VehicleControlInput {
  /** ステアリング入力 (-1 = 左, +1 = 右) */
  steer: number;
  /** アクセル入力 (0..1) */
  throttle: number;
  /** ブレーキ / 停車後長押しでバック (0..1) */
  brake: number;
  /** 強ブレーキ / サイドブレーキ (Space 等) */
  handbrake: boolean;
}

export interface VehicleTelemetry {
  speedMs: number;
  speedKmh: number;
  gear: VehicleGear;
  steerAngleRad: number;
  canExit: boolean;
  position: { x: number; y: number; z: number };
}

const MAX_FORWARD_SPEED = 18.0; // m/s (~65 km/h)
const MAX_REVERSE_SPEED = 5.5; // m/s (~20 km/h)
const ACCEL_RATE = 8.5; // m/s^2
const REVERSE_ACCEL = 4.8; // m/s^2
const BRAKE_DECEL = 16.5; // m/s^2
const HANDBRAKE_DECEL = 24.0; // m/s^2
const COAST_DRAG = 2.4; // m/s^2
const REVERSE_HOLD_DELAY = 0.22; // 秒: 停車後のブレーキ長押しでバック移行
const MAX_STEER_ANGLE = 0.56; // rad (~32 deg)
const MIN_HIGH_SPEED_STEER = 0.24; // rad (~14 deg)
const STEER_RESPONSE_SPEED = 8.5; // rad/s
const WHEELBASE_METERS = 2.78; // Innova 実測前後軸間距離 (1.50 + 1.28)
const EXIT_MAX_SPEED = 1.2; // m/s (~4.3 km/h 以下で降車可能)

/**
 * 作業ID 2-B: 主役車両の運転物理・車輪回転・ステアリング・OBB衝突解決・乗降位置計算を管理するモジュール。
 */
export class VehicleController {
  private readonly vehicle: LoadedHeroVehicle;
  private readonly collisionWorld: CollisionWorld;
  private readonly wheelRadius: number;

  private yaw: number;
  private speed = 0; // + = 前進 (+Z方向), - = 後退 (-Z方向)
  private steerAngle = 0; // + = 左切れ, - = 右切れ
  private reverseHoldTimer = 0;
  private isOccupied = false;

  constructor(vehicle: LoadedHeroVehicle, collisionWorld: CollisionWorld) {
    this.vehicle = vehicle;
    this.collisionWorld = collisionWorld;
    this.yaw = vehicle.root.rotation.y;

    const fl = vehicle.rig.wheels.frontLeft;
    this.wheelRadius = fl ? fl.radiusMeters : 0.32;
    this.syncCollider();
  }

  public setOccupied(occupied: boolean): void {
    this.isOccupied = occupied;
    if (!occupied) {
      this.reverseHoldTimer = 0;
    }
  }

  public getPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.vehicle.root.position);
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getSpeed(): number {
    return this.speed;
  }

  /** 降車可能なほぼ停止状態かどうか */
  public canExit(): boolean {
    return Math.abs(this.speed) <= EXIT_MAX_SPEED;
  }

  /** プレイヤーがドア付近（約 3.0m 以内）にいるか判定 */
  public isPlayerNearDoor(playerPos: THREE.Vector3): boolean {
    const pos = this.vehicle.root.position;
    const dx = playerPos.x - pos.x;
    const dz = playerPos.z - pos.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // ワールド差分 -> 車両ローカル座標 (+X=左, +Z=前)
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const halfW = this.vehicle.dimensions.width * 0.5;
    const halfL = this.vehicle.dimensions.length * 0.5;
    const distOutsideX = Math.max(0, Math.abs(localX) - halfW);
    const distOutsideZ = Math.max(0, Math.abs(localZ) - halfL);
    return Math.hypot(distOutsideX, distOutsideZ) <= 2.4;
  }

  /**
   * 降車時の安全なスポーン座標を返す。
   * 日本の歩道側（車の左側 = ローカル +X）を最優先し、塞がっている場合は右側・後方へフォールバック。
   */
  public computeExitTransform(): { x: number; y: number; z: number; yaw: number } {
    const pos = this.vehicle.root.position;
    const halfW = this.vehicle.dimensions.width * 0.5;
    const halfL = this.vehicle.dimensions.length * 0.5;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const leftX = Math.cos(this.yaw);
    const leftZ = -Math.sin(this.yaw);

    const candidates: Array<{ x: number; z: number }> = [
      // 1. 車の左側（歩道側）ドア横
      {
        x: pos.x + leftX * (halfW + 0.95) + fwdX * 0.15,
        z: pos.z + leftZ * (halfW + 0.95) + fwdZ * 0.15,
      },
      // 2. 車の左側やや後方
      {
        x: pos.x + leftX * (halfW + 1.1) - fwdX * 0.9,
        z: pos.z + leftZ * (halfW + 1.1) - fwdZ * 0.9,
      },
      // 3. 車の右側（運転席側）
      {
        x: pos.x - leftX * (halfW + 0.95) + fwdX * 0.15,
        z: pos.z - leftZ * (halfW + 0.95) + fwdZ * 0.15,
      },
      // 4. 車の後方
      {
        x: pos.x - fwdX * (halfL + 1.1),
        z: pos.z - fwdZ * (halfL + 1.1),
      },
    ];

    const playerRadius = 0.42;
    for (const c of candidates) {
      if (this.collisionWorld.isPointClear(c.x, c.z, playerRadius, this.vehicle.config.id)) {
        const groundY = this.collisionWorld.getGroundHeight(c.x, c.z);
        return { x: c.x, y: groundY, z: c.z, yaw: this.yaw };
      }
    }

    const fallback = candidates[0];
    const groundY = this.collisionWorld.getGroundHeight(fallback.x, fallback.z);
    return { x: fallback.x, y: groundY, z: fallback.z, yaw: this.yaw };
  }

  public getTelemetry(): VehicleTelemetry {
    const pos = this.vehicle.root.position;
    let gear: VehicleGear = 'N';
    if (!this.isOccupied && Math.abs(this.speed) < 0.05) {
      gear = 'P';
    } else if (this.speed > 0.1) {
      gear = 'D';
    } else if (this.speed < -0.1) {
      gear = 'R';
    } else if (this.reverseHoldTimer >= REVERSE_HOLD_DELAY) {
      gear = 'R';
    }

    return {
      speedMs: this.speed,
      speedKmh: Math.round(Math.abs(this.speed) * 3.6),
      gear,
      steerAngleRad: this.steerAngle,
      canExit: this.canExit(),
      position: { x: pos.x, y: pos.y, z: pos.z },
    };
  }

  /** 毎フレームの車両物理・車輪回転・ステアリング・衝突解決を更新 */
  public update(dt: number, input: VehicleControlInput | null): void {
    const clampedDt = Math.min(dt, 0.05);
    const activeInput: VehicleControlInput =
      this.isOccupied && input
        ? input
        : { steer: 0, throttle: 0, brake: 0, handbrake: true };

    const throttle = Math.max(0, Math.min(1, activeInput.throttle));
    const brake = Math.max(0, Math.min(1, activeInput.brake));
    const steerInput = Math.max(-1, Math.min(1, activeInput.steer));

    // 1. 縦方向（加減速・ブレーキ・停車後長押しバック）
    if (activeInput.handbrake) {
      this.reverseHoldTimer = 0;
      this.applyDeceleration(HANDBRAKE_DECEL * clampedDt);
    } else if (throttle > 0.05 && brake <= 0.05) {
      this.reverseHoldTimer = 0;
      if (this.speed < -0.15) {
        // バック中のアクセルはブレーキとして減速
        this.applyDeceleration(BRAKE_DECEL * clampedDt);
      } else {
        this.speed = Math.min(
          MAX_FORWARD_SPEED,
          this.speed + ACCEL_RATE * throttle * clampedDt,
        );
      }
    } else if (brake > 0.05) {
      if (this.speed > 0.15) {
        // 前進中はブレーキ減速
        this.reverseHoldTimer = 0;
        this.applyDeceleration(BRAKE_DECEL * brake * clampedDt);
      } else if (this.speed < -0.05) {
        // 既にバック中ならそのまま後退加速
        this.speed = Math.max(
          -MAX_REVERSE_SPEED,
          this.speed - REVERSE_ACCEL * brake * clampedDt,
        );
      } else {
        // 停車状態での長押しでバックギアへ移行
        this.speed = 0;
        this.reverseHoldTimer += clampedDt;
        if (this.reverseHoldTimer >= REVERSE_HOLD_DELAY) {
          this.speed = Math.max(
            -MAX_REVERSE_SPEED,
            this.speed - REVERSE_ACCEL * brake * clampedDt,
          );
        }
      }
    } else {
      // ペダルオフ時の自然な慣性減速（エンジンブレーキ＋転がり抵抗）
      this.reverseHoldTimer = 0;
      this.applyDeceleration(COAST_DRAG * clampedDt);
    }

    // 2. ステアリング角補間（高速時は最大切れ角を穏やかに制限）
    const speedRatio = Math.min(1, Math.abs(this.speed) / MAX_FORWARD_SPEED);
    const maxSteerNow =
      MAX_STEER_ANGLE - (MAX_STEER_ANGLE - MIN_HIGH_SPEED_STEER) * speedRatio * 0.75;
    // 左入力(-1) -> +Y回転（左旋回）、右入力(+1) -> -Y回転（右旋回）
    const targetSteerAngle = -steerInput * maxSteerNow;
    const steerDelta = targetSteerAngle - this.steerAngle;
    const maxSteerStep = STEER_RESPONSE_SPEED * clampedDt;
    if (Math.abs(steerDelta) <= maxSteerStep) {
      this.steerAngle = targetSteerAngle;
    } else {
      this.steerAngle += Math.sign(steerDelta) * maxSteerStep;
    }

    // 3. 自転車モデルによる旋回と移動
    if (Math.abs(this.speed) > 0.02) {
      const angularVelocity =
        (this.speed / WHEELBASE_METERS) * Math.tan(this.steerAngle);
      this.yaw = normalizeAngle(this.yaw + angularVelocity * clampedDt);
    }

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const pos = this.vehicle.root.position;
    const nextX = pos.x + fwdX * this.speed * clampedDt;
    const nextZ = pos.z + fwdZ * this.speed * clampedDt;

    // 4. 建物・他車両・外周壁との衝突解決（すり抜け防止＋停止・反発）
    const col = this.collisionWorld.resolveVehicleCollision(
      nextX,
      nextZ,
      this.yaw,
      this.vehicle.dimensions.width,
      this.vehicle.dimensions.length,
      this.vehicle.config.id,
    );

    pos.x = col.x;
    pos.z = col.z;

    if (col.collided) {
      const vx = fwdX * this.speed;
      const vz = fwdZ * this.speed;
      const vn = vx * col.normalX + vz * col.normalZ;
      if (vn < 0) {
        // 衝突方向への突っ込み成分を打ち消し、高速時は軽く反発・低速時は停止
        const impactSpeed = -vn;
        if (impactSpeed > 3.0) {
          this.speed = -Math.sign(this.speed) * Math.min(2.2, impactSpeed * 0.25);
        } else {
          this.speed *= 0.15;
          if (Math.abs(this.speed) < 0.25) {
            this.speed = 0;
          }
        }
      }
    }

    // 5. 地面接地（車道 Y = 0 基準、歩道乗り上げ時も埋まり防止で滑らか追従）
    const targetGroundY = Math.max(
      0,
      this.collisionWorld.getGroundHeight(pos.x, pos.z),
    );
    const yBlend = 1 - Math.exp(-14 * clampedDt);
    pos.y += (targetGroundY - pos.y) * yBlend;
    if (Math.abs(pos.y - targetGroundY) < 0.002) {
      pos.y = targetGroundY;
    }

    this.vehicle.root.rotation.y = this.yaw;

    // 6. 車輪回転・前輪ステアリング・車内ハンドルのビジュアル反映
    this.vehicle.setSteerAngle(this.steerAngle);
    if (Math.abs(this.speed) > 0.005) {
      const deltaSpin = (this.speed * clampedDt) / this.wheelRadius;
      this.vehicle.addWheelSpin(deltaSpin);
    }

    // 7. 主役車両自身の OBB コライダーを最新位置へ同期
    this.syncCollider();
  }

  private applyDeceleration(amount: number): void {
    if (Math.abs(this.speed) <= amount) {
      this.speed = 0;
    } else {
      this.speed -= Math.sign(this.speed) * amount;
    }
  }

  private syncCollider(): void {
    const pos = this.vehicle.root.position;
    const shrink = this.vehicle.config.colliderShrink;
    this.collisionWorld.upsertCollider(
      this.vehicle.config.id,
      pos.x,
      pos.z,
      Math.max(0.4, this.vehicle.dimensions.width * shrink),
      Math.max(0.4, this.vehicle.dimensions.length * shrink),
      this.yaw,
      pos.y,
      pos.y + Math.max(0.5, this.vehicle.dimensions.height),
    );
  }
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}
