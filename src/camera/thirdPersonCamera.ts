import * as THREE from 'three';

export type CameraOcclusionRaycast = (
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  ignoreId?: string,
) => number | null;

export interface ThirdPersonCameraOptions {
  initialDistance?: number;
  minDistance?: number;
  maxDistance?: number;
  initialPitch?: number;
  minPitch?: number;
  maxPitch?: number;
  targetHeight?: number;
  lookSensitivity?: number;
  followSmoothing?: number;
  occlusionRaycast?: CameraOcclusionRaycast;
}

const CAMERA_WALL_MARGIN = 0.42; // 障害物表面から手前に確保する安全マージン (m)
const OCCLUSION_SHRINK_RATE = 26.0; // 遮蔽時は素早くカメラを引き寄せる
const OCCLUSION_EXPAND_RATE = 5.5; // 遮蔽解除後は滑らかに元の距離へ戻す

/**
 * 1-C / 2-B2 / 2-C: プレイヤー背後・運転車両背後からの三人称視点（TPS）追従カメラ。
 * 建物や壁が注視点とカメラの間に入った場合、障害物の手前まで自動でカメラ距離を縮めて視界遮蔽を防ぐ。
 */
export class ThirdPersonCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPitch: number;
  private readonly maxPitch: number;
  private readonly targetHeight: number;
  private readonly lookSensitivity: number;
  private readonly followSmoothing: number;
  private occlusionRaycast: CameraOcclusionRaycast | null;

  private yaw = 0; // 0 = プレイヤー背後(-Z)から前方(+Z)を見る
  private pitch: number;
  private distance: number;
  private currentActualDistance: number;

  private readonly currentTarget = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();
  private initialized = false;
  private manualLookIdleTime = 99;

  constructor(
    camera: THREE.PerspectiveCamera,
    options: ThirdPersonCameraOptions = {},
  ) {
    this.camera = camera;
    this.distance = options.initialDistance ?? 4.2;
    this.currentActualDistance = this.distance;
    this.minDistance = options.minDistance ?? 2.4;
    this.maxDistance = options.maxDistance ?? 7.5;
    this.pitch = options.initialPitch ?? 0.24;
    this.minPitch = options.minPitch ?? -0.18;
    this.maxPitch = options.maxPitch ?? 1.15;
    this.targetHeight = options.targetHeight ?? 1.42;
    this.lookSensitivity = options.lookSensitivity ?? 0.0052;
    this.followSmoothing = options.followSmoothing ?? 12.0;
    this.occlusionRaycast = options.occlusionRaycast ?? null;
  }

  /** カメラ遮蔽回避用レイキャスト関数を設定 */
  public setOcclusionRaycast(raycast: CameraOcclusionRaycast | null): void {
    this.occlusionRaycast = raycast;
  }

  /** 現在のカメラ水平角（移動方向の基準として使用） */
  public getYaw(): number {
    return this.yaw;
  }

  /** 乗車・降車時にカメラの向きを対象の背後へ合わせる */
  public alignBehind(targetYaw: number): void {
    this.yaw = targetYaw;
    this.pitch = 0.24;
    this.manualLookIdleTime = 99;
  }

  /** タッチドラッグ・マウス移動によるカメラ回転を適用 */
  public applyLookDelta(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) {
      this.manualLookIdleTime = 0;
    }
    if (dx !== 0) {
      this.yaw -= dx * this.lookSensitivity;
    }
    if (dy !== 0) {
      this.pitch = Math.max(
        this.minPitch,
        Math.min(this.maxPitch, this.pitch + dy * this.lookSensitivity),
      );
    }
  }

  /** ホイール等によるカメラ距離調整 */
  public applyZoomDelta(delta: number): void {
    if (delta === 0) return;
    this.distance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.distance + delta),
    );
  }

  /** 徒歩モード: プレイヤー位置に追従してカメラの姿勢を更新（建物遮蔽回避あり） */
  public update(
    dt: number,
    playerPosition: THREE.Vector3,
    groundHeight = 0,
  ): void {
    const clampedDt = Math.min(dt, 0.05);

    this.desiredTarget.set(
      playerPosition.x,
      playerPosition.y + this.targetHeight,
      playerPosition.z,
    );

    if (!this.initialized) {
      this.currentTarget.copy(this.desiredTarget);
      this.currentActualDistance = this.distance;
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-this.followSmoothing * clampedDt);
      this.currentTarget.lerp(this.desiredTarget, alpha);
    }

    const minCamY = groundHeight + 0.35;
    this.applyCameraWithOcclusion(
      clampedDt,
      this.distance,
      minCamY,
      0.75,
      undefined,
    );
  }

  /**
   * 2-B2 / 2-C: 運転専用三人称追従カメラ。
   * 車両の進行方向へ滑らかに追従しつつ、右画面スワイプ／マウスドラッグで周囲見回しが可能。
   * 建物・壁が間に入った場合は障害物の手前まで自動で距離を縮めて視界を確保する。
   */
  public updateDriving(
    dt: number,
    vehiclePosition: THREE.Vector3,
    vehicleYaw: number,
    vehicleSpeed: number,
    groundHeight = 0,
    ignoreColliderId?: string,
  ): void {
    const clampedDt = Math.min(dt, 0.05);
    this.manualLookIdleTime += clampedDt;

    // 手動見回しから一定時間経過し走行中であれば、車両の進行方向へ滑らかに追従
    if (this.manualLookIdleTime > 1.35 && Math.abs(vehicleSpeed) > 0.35) {
      const deltaYaw = normalizeAngle(vehicleYaw - this.yaw);
      const followRate = Math.min(6.5, 2.4 + Math.abs(vehicleSpeed) * 0.14);
      const yawAlpha = 1 - Math.exp(-followRate * clampedDt);
      this.yaw = normalizeAngle(this.yaw + deltaYaw * yawAlpha);

      const pitchAlpha = 1 - Math.exp(-2.5 * clampedDt);
      this.pitch += (0.24 - this.pitch) * pitchAlpha;
    }

    // 高速域では視界確保のためわずかにカメラを引く
    const speedPullback = Math.min(1.4, Math.abs(vehicleSpeed) * 0.032);
    const drivingDistance = Math.max(
      5.6,
      Math.min(9.6, this.distance + 2.0 + speedPullback),
    );
    this.desiredTarget.set(
      vehiclePosition.x,
      vehiclePosition.y + 1.55,
      vehiclePosition.z,
    );

    if (!this.initialized) {
      this.currentTarget.copy(this.desiredTarget);
      this.currentActualDistance = drivingDistance;
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-12.0 * clampedDt);
      this.currentTarget.lerp(this.desiredTarget, alpha);
    }

    const minCamY = groundHeight + 0.55;
    this.applyCameraWithOcclusion(
      clampedDt,
      drivingDistance,
      minCamY,
      1.85,
      ignoreColliderId,
    );
  }

  /**
   * 注視点から理想カメラ位置へ向けてレイキャストし、
   * 障害物がある場合は手前まで素早く縮め、離れたら滑らかに元の距離へ戻す。
   */
  private applyCameraWithOcclusion(
    dt: number,
    desiredDistance: number,
    minCamY: number,
    minAllowedDistance: number,
    ignoreColliderId?: string,
  ): void {
    const horizDist = desiredDistance * Math.cos(this.pitch);
    const camX = this.currentTarget.x - Math.sin(this.yaw) * horizDist;
    const camZ = this.currentTarget.z - Math.cos(this.yaw) * horizDist;
    const rawCamY =
      this.currentTarget.y + Math.sin(this.pitch) * desiredDistance;
    const clampedCamY = Math.max(minCamY, rawCamY);

    this.desiredPosition.set(camX, clampedCamY, camZ);
    this.rayDir.subVectors(this.desiredPosition, this.currentTarget);
    const idealLength = this.rayDir.length();

    let targetActualDist = idealLength;

    if (idealLength > 0.01) {
      this.rayDir.divideScalar(idealLength);

      if (this.occlusionRaycast) {
        const hitDist = this.occlusionRaycast(
          this.currentTarget.x,
          this.currentTarget.y,
          this.currentTarget.z,
          this.rayDir.x,
          this.rayDir.y,
          this.rayDir.z,
          idealLength,
          ignoreColliderId,
        );
        if (hitDist !== null) {
          targetActualDist = Math.max(
            minAllowedDistance,
            Math.min(idealLength, hitDist - CAMERA_WALL_MARGIN),
          );
        }
      }

      // 縮むときは素早く（視界遮蔽を即座に防ぐ）、戻るときは滑らかに補間
      const rate =
        targetActualDist < this.currentActualDistance
          ? OCCLUSION_SHRINK_RATE
          : OCCLUSION_EXPAND_RATE;
      const distAlpha = 1 - Math.exp(-rate * dt);
      this.currentActualDistance +=
        (targetActualDist - this.currentActualDistance) * distAlpha;

      // 遮蔽直後に壁の裏へ一瞬残らないよう、現在距離がヒット位置より遠い場合は即座に手前へ寄せる
      if (targetActualDist < idealLength && this.currentActualDistance > targetActualDist + 0.12) {
        this.currentActualDistance = targetActualDist;
      }

      this.desiredPosition
        .copy(this.currentTarget)
        .addScaledVector(this.rayDir, this.currentActualDistance);
      if (this.desiredPosition.y < minCamY) {
        this.desiredPosition.y = minCamY;
      }
    }

    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.currentTarget);
  }
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}
