import * as THREE from 'three';

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
}

/**
 * 1-C: プレイヤー背後からの三人称視点（TPS）追従カメラ。
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

  private yaw = 0; // 0 = プレイヤー背後(-Z)から前方(+Z)を見る
  private pitch: number;
  private distance: number;

  private readonly currentTarget = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private initialized = false;
  private manualLookIdleTime = 99;

  constructor(
    camera: THREE.PerspectiveCamera,
    options: ThirdPersonCameraOptions = {},
  ) {
    this.camera = camera;
    this.distance = options.initialDistance ?? 4.2;
    this.minDistance = options.minDistance ?? 2.4;
    this.maxDistance = options.maxDistance ?? 7.5;
    this.pitch = options.initialPitch ?? 0.24;
    this.minPitch = options.minPitch ?? -0.18;
    this.maxPitch = options.maxPitch ?? 1.15;
    this.targetHeight = options.targetHeight ?? 1.42;
    this.lookSensitivity = options.lookSensitivity ?? 0.0052;
    this.followSmoothing = options.followSmoothing ?? 12.0;
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

  /** 徒歩モード: プレイヤー位置に追従してカメラの姿勢を更新 */
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
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-this.followSmoothing * clampedDt);
      this.currentTarget.lerp(this.desiredTarget, alpha);
    }

    const horizDist = this.distance * Math.cos(this.pitch);
    const camX = this.currentTarget.x - Math.sin(this.yaw) * horizDist;
    const camZ = this.currentTarget.z - Math.cos(this.yaw) * horizDist;
    const rawCamY = this.currentTarget.y + Math.sin(this.pitch) * this.distance;

    // 地面へのめり込みを防止
    const minCamY = groundHeight + 0.35;
    const camY = Math.max(minCamY, rawCamY);

    this.desiredPosition.set(camX, camY, camZ);
    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.currentTarget);
  }

  /**
   * 2-B2: 運転専用三人称追従カメラ。
   * 車両の進行方向へ滑らかに追従しつつ、右画面スワイプ／マウスドラッグで周囲見回しが可能。
   */
  public updateDriving(
    dt: number,
    vehiclePosition: THREE.Vector3,
    vehicleYaw: number,
    vehicleSpeed: number,
    groundHeight = 0,
  ): void {
    const clampedDt = Math.min(dt, 0.05);
    this.manualLookIdleTime += clampedDt;

    // 手動見回しから一定時間経過し走行中であれば、車両の進行方向へ滑らかに追従
    if (this.manualLookIdleTime > 1.35 && Math.abs(vehicleSpeed) > 0.35) {
      const deltaYaw = normalizeAngle(vehicleYaw - this.yaw);
      const followRate = Math.min(5.5, 2.2 + Math.abs(vehicleSpeed) * 0.18);
      const yawAlpha = 1 - Math.exp(-followRate * clampedDt);
      this.yaw = normalizeAngle(this.yaw + deltaYaw * yawAlpha);

      const pitchAlpha = 1 - Math.exp(-2.5 * clampedDt);
      this.pitch += (0.24 - this.pitch) * pitchAlpha;
    }

    const drivingDistance = Math.max(5.6, Math.min(8.5, this.distance + 2.0));
    this.desiredTarget.set(
      vehiclePosition.x,
      vehiclePosition.y + 1.55,
      vehiclePosition.z,
    );

    if (!this.initialized) {
      this.currentTarget.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-10.0 * clampedDt);
      this.currentTarget.lerp(this.desiredTarget, alpha);
    }

    const horizDist = drivingDistance * Math.cos(this.pitch);
    const camX = this.currentTarget.x - Math.sin(this.yaw) * horizDist;
    const camZ = this.currentTarget.z - Math.cos(this.yaw) * horizDist;
    const rawCamY =
      this.currentTarget.y + Math.sin(this.pitch) * drivingDistance;

    const minCamY = groundHeight + 0.55;
    const camY = Math.max(minCamY, rawCamY);

    this.desiredPosition.set(camX, camY, camZ);
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
