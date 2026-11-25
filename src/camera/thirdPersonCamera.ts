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

  /** タッチドラッグ・マウス移動によるカメラ回転を適用 */
  public applyLookDelta(dx: number, dy: number): void {
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

  /** プレイヤー位置に追従してカメラの姿勢を更新 */
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
}
