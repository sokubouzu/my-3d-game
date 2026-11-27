import * as THREE from 'three';
import type { CollisionWorld } from '../world/collisionWorld';
import type {
  BikeRiderMountConfig,
  VehicleAudioProfile,
  VehicleType,
} from './vehicleConfig';
import type { LoadedHeroVehicle } from './vehicleModel';
import type { VehicleDamageEffects } from './vehicleDamageEffects';

export type VehicleGear = 'P' | 'N' | 'D' | 'R';

export type DriveSpeedMode = 'CITY' | 'CRUISE' | 'SPORT';

export type VehicleDamageState =
  | 'intact'
  | 'light'
  | 'heavy'
  | 'burning'
  | 'wrecked';

export interface VehicleImpactEvent {
  impactSpeed: number;
  normalSpeed: number;
  incidence: number;
  damage: number;
  intensity01: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  normalX: number;
  normalZ: number;
}

export interface VehicleDamageTickResult {
  impact: VehicleImpactEvent | null;
  fireBeep: boolean;
  fireBeepUrgency: number;
  explodedNow: boolean;
  wreckLandedNow: boolean;
  readyToRespawn: boolean;
  fireLightIntensity: number;
  fireLightX: number;
  fireLightY: number;
  fireLightZ: number;
}

export interface DriveSpeedModeConfig {
  mode: DriveSpeedMode;
  label: string;
  /** 上限速度 (km/h)。null の場合は車種本来の最高速度を使用 */
  limitKmh: number | null;
}

export const DRIVE_SPEED_MODE_ORDER: readonly DriveSpeedMode[] = [
  'CITY',
  'CRUISE',
  'SPORT',
];

export const DRIVE_SPEED_MODE_CONFIGS: Record<
  DriveSpeedMode,
  DriveSpeedModeConfig
> = {
  CITY: { mode: 'CITY', label: '街乗り', limitKmh: 45 },
  CRUISE: { mode: 'CRUISE', label: '巡航', limitKmh: 85 },
  SPORT: { mode: 'SPORT', label: '全開', limitKmh: null },
};

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
  speedMode: DriveSpeedMode;
  speedLimitKmh: number;
  steerAngleRad: number;
  canExit: boolean;
  hp: number;
  damageState: VehicleDamageState;
  burnRemainingSec: number;
  respawnRemainingSec: number;
  position: { x: number; y: number; z: number };
}

const REVERSE_HOLD_DELAY = 0.22; // 秒: 停車後のブレーキ長押しでバック移行
const EXIT_MAX_SPEED = 1.2; // m/s (~4.3 km/h 以下で降車可能)
const DOOR_INTERACT_MARGIN = 2.4; // m: 車体外面からの乗車可能距離（車体中心から約 2.5〜3.0m）
const LIGHT_DAMAGE_HP = 70; // HP 70% 以下: 軽傷（ボンネットから細い白煙）
const HEAVY_DAMAGE_HP = 45; // HP 45% 以下: 中傷（濃いグレー〜黒煙・オイル漏れ・火花）
const IGNITE_HP = 15; // HP 15% 以下〜0%: 炎上直前（ボンネットから赤い火柱＋2.5秒警告音）
const BURN_COUNTDOWN_SEC = 2.5; // 秒: 発火から大爆発までの緊急カウントダウン
const WRECK_FULL_FIRE_SEC = 7.6; // 秒: 爆発後の激しい炎上継続時間
const WRECK_EXTINGUISH_SEC = 9.5; // 秒: 鎮火完了時刻（7.6〜9.5秒で炎が徐々に縮小・鎮火）
const WRECK_RESPAWN_SEC = 10.5; // 秒: 鎮火フェードアウト完了〜近接道路自動リスポーン時刻
const IMPACT_DAMAGE_COOLDOWN_SEC = 0.26; // 秒: 連続衝突の多段ヒット防止

/**
 * 作業ID 2-B / 2-C / 5-B / 5-B2: 運転可能車両（乗用車・スポーツカー・バイク）の物理・車輪回転・ステアリング・
 * バイク車体バンク演出・OBB衝突解決・乗降位置計算・5段階ダメージ/発火/爆発跳ね上がり/炎上継続/自動リスポーンを管理するモジュール。
 */
export class VehicleController {
  private readonly vehicle: LoadedHeroVehicle;
  private readonly collisionWorld: CollisionWorld;
  private readonly wheelRadius: number;

  private yaw: number;
  private speed = 0; // + = 前進 (+Z方向), - = 後退 (-Z方向)
  private steerAngle = 0; // + = 左切れ, - = 右切れ
  private leanRoll = 0; // バイク用ロール角 (rad, 負 = 左傾き / 正 = 右傾き)
  private speedMode: DriveSpeedMode = 'CITY';
  private reverseHoldTimer = 0;
  private isOccupied = false;

  // 5-B / 5-B2: 耐久度・5段階ダメージ演出・爆発跳ね上がり物理＆自動リスポーン状態
  private hp = 100;
  private damageState: VehicleDamageState = 'intact';
  private burnTimer = 0;
  private burnStartHp = 0;
  private fireBeepTimer = 0;
  private respawnTimer = 0;
  private wreckElapsed = 0;
  private impactCooldown = 0;
  private misfireClock = 0;
  private smokeEmitTimer = 0;
  private fireEmitTimer = 0;
  private emberEmitTimer = 0;
  private damageSparkTimer = 0.6;
  private oilLeakDistanceAccum = 0;

  // 5-B2: 爆発瞬間の車体跳ね上がり＆傾き着地リアクション状態
  private blastHopY = 0;
  private blastHopVelY = 0;
  private blastPitch = 0;
  private blastPitchVel = 0;
  private blastRoll = 0;
  private blastRollVel = 0;
  private blastRestPitch = 0;
  private blastRestRoll = 0;
  private blastBounceCount = 0;
  private blastThudPending = false;

  private pendingImpact: VehicleImpactEvent | null = null;
  private readonly impactEventScratch: VehicleImpactEvent = {
    impactSpeed: 0,
    normalSpeed: 0,
    incidence: 0,
    damage: 0,
    intensity01: 0,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    normalX: 0,
    normalZ: 0,
  };
  private readonly enginePosScratch = new THREE.Vector3();
  private readonly oilPosScratch = new THREE.Vector3();
  private readonly wreckSpotScratch = new THREE.Vector3();

  constructor(vehicle: LoadedHeroVehicle, collisionWorld: CollisionWorld) {
    this.vehicle = vehicle;
    this.collisionWorld = collisionWorld;
    this.yaw = vehicle.root.rotation.y;

    const fl = vehicle.rig.wheels.frontLeft;
    this.wheelRadius = fl ? fl.radiusMeters : 0.32;
    this.syncCollider();
  }

  public getId(): string {
    return this.vehicle.config.id;
  }

  public getType(): VehicleType {
    return this.vehicle.config.type;
  }

  public getDisplayName(): string {
    return this.vehicle.config.displayName;
  }

  public getAudioProfile(): VehicleAudioProfile {
    return this.vehicle.config.audioProfile;
  }

  public getRiderAnchor(): THREE.Group {
    return this.vehicle.riderAnchor;
  }

  public getBodyGroup(): THREE.Group {
    return this.vehicle.bodyGroup;
  }

  public setLightsIntensity(factor: number): void {
    this.vehicle.setLightsIntensity(factor);
  }

  public getHeadlightSpotMultiplier(): number {
    return this.vehicle.damageVisuals.getHeadlightSpotMultiplier();
  }

  public getHp(): number {
    return this.hp;
  }

  public getDamageState(): VehicleDamageState {
    return this.damageState;
  }

  public getBurnRemainingSec(): number {
    return this.damageState === 'burning' ? this.burnTimer : 0;
  }

  public getRespawnRemainingSec(): number {
    return this.damageState === 'wrecked' ? this.respawnTimer : 0;
  }

  /** 乗車可能（発火・黒焦げ残骸ではない）かどうか */
  public isDrivable(): boolean {
    return this.damageState !== 'wrecked' && this.damageState !== 'burning';
  }

  public isWrecked(): boolean {
    return this.damageState === 'wrecked';
  }

  public isBurning(): boolean {
    return this.damageState === 'burning';
  }

  public getRiderMount(): BikeRiderMountConfig | null {
    return this.vehicle.config.riderMount ?? null;
  }

  public getLeanRoll(): number {
    return this.leanRoll;
  }

  public getMaxForwardSpeedKmh(): number {
    return this.vehicle.config.handling.maxForwardSpeed * 3.6;
  }

  public getSpeedMode(): DriveSpeedMode {
    return this.speedMode;
  }

  public setSpeedMode(mode: DriveSpeedMode): void {
    this.speedMode = mode;
  }

  /** 走行モードを CITY -> CRUISE -> SPORT -> CITY の順で循環切替 */
  public cycleSpeedMode(): DriveSpeedMode {
    const idx = DRIVE_SPEED_MODE_ORDER.indexOf(this.speedMode);
    const next =
      DRIVE_SPEED_MODE_ORDER[(idx + 1) % DRIVE_SPEED_MODE_ORDER.length];
    this.speedMode = next;
    return next;
  }

  /** 現在の走行モードおよび損傷状態（HP30%以下の不調）に応じた実効最高速度 (m/s) */
  public getEffectiveMaxForwardSpeedMs(): number {
    const nativeMax = this.vehicle.config.handling.maxForwardSpeed;
    const limitKmh = DRIVE_SPEED_MODE_CONFIGS[this.speedMode].limitKmh;
    const modeMax =
      limitKmh === null ? nativeMax : Math.min(nativeMax, limitKmh / 3.6);
    if (this.hp <= 30 && this.damageState === 'heavy') {
      const severity = Math.max(0, Math.min(1, (30 - this.hp) / 30));
      return modeMax * (1 - 0.18 * severity);
    }
    return modeMax;
  }

  /** 現在の走行モードに応じた実効最高速度 (km/h) */
  public getEffectiveMaxSpeedKmh(): number {
    return this.getEffectiveMaxForwardSpeedMs() * 3.6;
  }

  public setOccupied(occupied: boolean): void {
    this.isOccupied = occupied;
    if (occupied) {
      // 乗車時の初期状態は街中で扱いやすい CITY (45km/h) に設定
      this.speedMode = 'CITY';
    } else {
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

  public getDimensions(): { width: number; height: number; length: number } {
    return this.vehicle.dimensions;
  }

  /** 降車可能なほぼ停止状態かどうか（発火カウントダウン中は速度に関わらず緊急降車可能） */
  public canExit(): boolean {
    if (this.damageState === 'burning') return true;
    return Math.abs(this.speed) <= EXIT_MAX_SPEED;
  }

  /** 車体外面からプレイヤーまでの水平距離 (m) を返す */
  public getDoorDistance(playerPos: THREE.Vector3): number {
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
    return Math.hypot(distOutsideX, distOutsideZ);
  }

  /** プレイヤーがドア付近（約 3.0m 以内）にいるか判定 */
  public isPlayerNearDoor(playerPos: THREE.Vector3): boolean {
    if (!this.isDrivable()) return false;
    return this.getDoorDistance(playerPos) <= DOOR_INTERACT_MARGIN;
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

    const sideOffset = this.vehicle.config.type === 'bike' ? 0.72 : 0.95;
    const candidates: Array<{ x: number; z: number }> = [
      // 1. 車両の左側（歩道側）横
      {
        x: pos.x + leftX * (halfW + sideOffset) + fwdX * 0.15,
        z: pos.z + leftZ * (halfW + sideOffset) + fwdZ * 0.15,
      },
      // 2. 車両の左側やや後方
      {
        x: pos.x + leftX * (halfW + sideOffset + 0.15) - fwdX * 0.85,
        z: pos.z + leftZ * (halfW + sideOffset + 0.15) - fwdZ * 0.85,
      },
      // 3. 車両の右側
      {
        x: pos.x - leftX * (halfW + sideOffset) + fwdX * 0.15,
        z: pos.z - leftZ * (halfW + sideOffset) + fwdZ * 0.15,
      },
      // 4. 車両の後方
      {
        x: pos.x - fwdX * (halfL + 1.05),
        z: pos.z - fwdZ * (halfL + 1.05),
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

  /**
   * 5-B: 爆発瞬間の自動緊急脱出用スポーン座標と爆風ノックバック方向を計算する。
   */
  public computeEmergencyEjectTransform(): {
    x: number;
    y: number;
    z: number;
    yaw: number;
    dirX: number;
    dirZ: number;
  } {
    const pos = this.vehicle.root.position;
    const halfW = this.vehicle.dimensions.width * 0.5;
    const halfL = this.vehicle.dimensions.length * 0.5;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const leftX = Math.cos(this.yaw);
    const leftZ = -Math.sin(this.yaw);

    const candidates: Array<{ x: number; z: number; dx: number; dz: number }> = [
      {
        x: pos.x + leftX * (halfW + 1.9),
        z: pos.z + leftZ * (halfW + 1.9),
        dx: leftX,
        dz: leftZ,
      },
      {
        x: pos.x - leftX * (halfW + 1.9),
        z: pos.z - leftZ * (halfW + 1.9),
        dx: -leftX,
        dz: -leftZ,
      },
      {
        x: pos.x - fwdX * (halfL + 2.0),
        z: pos.z - fwdZ * (halfL + 2.0),
        dx: -fwdX,
        dz: -fwdZ,
      },
      {
        x: pos.x + fwdX * (halfL + 2.0),
        z: pos.z + fwdZ * (halfL + 2.0),
        dx: fwdX,
        dz: fwdZ,
      },
    ];

    const playerRadius = 0.44;
    for (const c of candidates) {
      if (this.collisionWorld.isPointClear(c.x, c.z, playerRadius, this.vehicle.config.id)) {
        const groundY = this.collisionWorld.getGroundHeight(c.x, c.z);
        return {
          x: c.x,
          y: groundY,
          z: c.z,
          yaw: Math.atan2(c.dx, c.dz),
          dirX: c.dx,
          dirZ: c.dz,
        };
      }
    }

    const fb = this.computeExitTransform();
    return {
      ...fb,
      dirX: leftX,
      dirZ: leftZ,
    };
  }

  /**
   * 4-B: 車両・バイクを安全な車道座標・正しい向きへ瞬時にリスポーンさせる（スタック脱出用）。
   */
  public respawnAt(x: number, y: number, z: number, yaw: number): void {
    this.speed = 0;
    this.steerAngle = 0;
    this.leanRoll = 0;
    this.reverseHoldTimer = 0;
    this.pendingImpact = null;
    this.resetBlastTransform();
    this.yaw = normalizeAngle(yaw);

    this.vehicle.root.position.set(x, Math.max(0, y), z);
    this.vehicle.root.rotation.y = this.yaw;
    this.vehicle.setSteerAngle(0);
    if (this.vehicle.config.lean) {
      this.vehicle.setLeanRoll(0);
    }
    this.syncCollider();
  }

  private resetBlastTransform(): void {
    this.blastHopY = 0;
    this.blastHopVelY = 0;
    this.blastPitch = 0;
    this.blastPitchVel = 0;
    this.blastRoll = 0;
    this.blastRollVel = 0;
    this.blastRestPitch = 0;
    this.blastRestRoll = 0;
    this.blastBounceCount = 0;
    this.blastThudPending = false;
    this.vehicle.bodyGroup.position.y = 0;
    this.vehicle.bodyGroup.rotation.set(0, 0, 0);
  }

  /**
   * 5-B / 5-B2: 耐久度 100%・凹み頂点・擦り傷/煤・ライト破損・爆発姿勢を新品状態へ完全復元し、安全車道へスポーンさせる。
   */
  public repairAndRespawn(
    x: number,
    y: number,
    z: number,
    yaw: number,
    rainAmount = 0,
  ): void {
    this.hp = 100;
    this.damageState = 'intact';
    this.burnTimer = 0;
    this.burnStartHp = 0;
    this.fireBeepTimer = 0;
    this.respawnTimer = 0;
    this.wreckElapsed = 0;
    this.impactCooldown = 0;
    this.oilLeakDistanceAccum = 0;
    this.pendingImpact = null;
    this.resetBlastTransform();
    this.vehicle.damageVisuals.reset(rainAmount);
    this.respawnAt(x, y, z, yaw);
  }

  public getTelemetry(): VehicleTelemetry {
    const pos = this.vehicle.root.position;
    let gear: VehicleGear = 'N';
    if ((!this.isOccupied || this.damageState === 'wrecked') && Math.abs(this.speed) < 0.05) {
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
      speedMode: this.speedMode,
      speedLimitKmh: Math.round(this.getEffectiveMaxSpeedKmh()),
      steerAngleRad: this.steerAngle,
      canExit: this.canExit(),
      hp: Math.round(this.hp),
      damageState: this.damageState,
      burnRemainingSec: this.getBurnRemainingSec(),
      respawnRemainingSec: this.getRespawnRemainingSec(),
      position: { x: pos.x, y: pos.y, z: pos.z },
    };
  }

  /** 毎フレームの車両物理・車輪回転・ステアリング・衝突解決・ダメージ判定を更新 */
  public update(dt: number, input: VehicleControlInput | null): void {
    const clampedDt = Math.min(dt, 0.05);
    if (this.impactCooldown > 0) {
      this.impactCooldown = Math.max(0, this.impactCooldown - clampedDt);
    }
    this.misfireClock += clampedDt;

    // 5-B2: 全損残骸は走行不可だが、爆発瞬間の跳ね上がり＆傾き落下バウンド物理を再生する
    if (this.damageState === 'wrecked') {
      this.speed = 0;
      this.steerAngle = 0;
      this.reverseHoldTimer = 0;
      this.leanRoll = 0;

      if (this.blastHopY > 0 || Math.abs(this.blastHopVelY) > 0.01) {
        this.blastHopVelY -= 15.8 * clampedDt;
        this.blastHopY += this.blastHopVelY * clampedDt;
        if (this.blastHopY <= 0) {
          this.blastHopY = 0;
          if (Math.abs(this.blastHopVelY) > 1.3 && this.blastBounceCount < 2) {
            if (this.blastBounceCount === 0) {
              this.blastThudPending = true;
            }
            this.blastBounceCount += 1;
            this.blastHopVelY = Math.abs(this.blastHopVelY) * 0.24;
            this.blastPitchVel *= -0.35;
            this.blastRollVel *= 0.45;
          } else {
            this.blastHopVelY = 0;
          }
        }
      }

      // ピッチ・ロールを爆発傾き→破損着地姿勢へ減衰収束
      const springK = this.blastHopY > 0.01 ? 6.5 : 18.0;
      const damp = this.blastHopY > 0.01 ? 2.4 : 6.2;
      this.blastPitchVel +=
        ((this.blastRestPitch - this.blastPitch) * springK -
          this.blastPitchVel * damp) *
        clampedDt;
      this.blastRollVel +=
        ((this.blastRestRoll - this.blastRoll) * springK -
          this.blastRollVel * damp) *
        clampedDt;
      this.blastPitch = Math.max(-0.42, Math.min(0.36, this.blastPitch + this.blastPitchVel * clampedDt));
      this.blastRoll = Math.max(-0.78, Math.min(0.78, this.blastRoll + this.blastRollVel * clampedDt));

      this.vehicle.bodyGroup.position.y = this.blastHopY;
      this.vehicle.bodyGroup.rotation.x = this.blastPitch;
      this.vehicle.bodyGroup.rotation.z = this.blastRoll;
      this.syncCollider();
      return;
    }

    const h = this.vehicle.config.handling;
    const isBurning = this.damageState === 'burning';
    const activeInput: VehicleControlInput =
      this.isOccupied && input && !isBurning
        ? input
        : { steer: 0, throttle: 0, brake: isBurning ? 0.65 : 0, handbrake: !isBurning };

    const throttle = Math.max(0, Math.min(1, activeInput.throttle));
    const brake = Math.max(0, Math.min(1, activeInput.brake));
    const steerInput = Math.max(-1, Math.min(1, activeInput.steer));
    const effectiveMaxSpeed = this.getEffectiveMaxForwardSpeedMs();

    // 耐久 30% 以下のエンジン不調（わずかな加速息継ぎ & ステアリングブレ）
    const isEngineFailing = this.hp <= 30 && this.damageState === 'heavy';
    const failSeverity = isEngineFailing
      ? Math.max(0, Math.min(1, (30 - this.hp) / 30))
      : 0;
    const misfireAccelMul = isEngineFailing
      ? 1 - failSeverity * (0.14 + 0.14 * Math.max(0, Math.sin(this.misfireClock * 11.5)))
      : 1;

    // 1. 縦方向（加減速・速度リミッター・ブレーキ・停車後長押しバック・自然な惰性走行）
    if (activeInput.handbrake) {
      this.reverseHoldTimer = 0;
      this.applyDeceleration(h.handbrakeDecel * clampedDt);
    } else if (throttle > 0.05 && brake <= 0.05) {
      this.reverseHoldTimer = 0;
      if (this.speed < -0.15) {
        // バック中のアクセルはブレーキとして減速
        this.applyDeceleration(h.brakeDecel * clampedDt);
      } else if (this.speed > effectiveMaxSpeed + 0.05) {
        // 高速走行中に下位リミッター（CITY / CRUISE）へ切り替えた際は、急停止せず滑らかに上限速度へ減速
        const limiterDecel = Math.max(3.6, h.coastDrag * 4.0);
        this.speed = Math.max(
          effectiveMaxSpeed,
          this.speed - limiterDecel * clampedDt,
        );
      } else {
        // 低中速域は力強く、高速域へ向かって自然に伸びる加速カーブ（リミッター上限で安定巡航）
        const speedNorm = Math.min(1, Math.max(0, this.speed) / h.maxForwardSpeed);
        const accelFactor = 1.0 - 0.42 * speedNorm;
        this.speed = Math.min(
          effectiveMaxSpeed,
          this.speed + h.accelRate * accelFactor * misfireAccelMul * throttle * clampedDt,
        );
      }
    } else if (brake > 0.05) {
      if (this.speed > 0.15) {
        // 前進中はブレーキ減速
        this.reverseHoldTimer = 0;
        this.applyDeceleration(h.brakeDecel * brake * clampedDt);
      } else if (this.speed < -0.05) {
        // 既にバック中ならそのまま後退加速
        this.speed = Math.max(
          -h.maxReverseSpeed,
          this.speed - h.reverseAccel * brake * clampedDt,
        );
      } else if (!isBurning) {
        // 停車状態での長押しでバックギアへ移行
        this.speed = 0;
        this.reverseHoldTimer += clampedDt;
        if (this.reverseHoldTimer >= REVERSE_HOLD_DELAY) {
          this.speed = Math.max(
            -h.maxReverseSpeed,
            this.speed - h.reverseAccel * brake * clampedDt,
          );
        }
      } else {
        this.speed = 0;
      }
    } else {
      // ペダルオフ時の実車に近い緩やかな惰性走行（転がり抵抗＋緩やかな空気抵抗）
      this.reverseHoldTimer = 0;
      const absSpeed = Math.abs(this.speed);
      const aeroExtra = absSpeed * 0.018 + absSpeed * absSpeed * 0.0005;
      this.applyDeceleration((h.coastDrag + aeroExtra) * clampedDt);
    }

    // 2. ステアリング角補間（高速域では最大切れ角を滑らかに絞って直進安定性を確保）
    const speedRatio = Math.min(1, Math.abs(this.speed) / h.maxForwardSpeed);
    const steerCurve = Math.pow(speedRatio, 0.75);
    const maxSteerNow =
      h.maxSteerAngle - (h.maxSteerAngle - h.minHighSpeedSteer) * steerCurve;
    // 左入力(-1) -> +Y回転（左旋回）、右入力(+1) -> -Y回転（右旋回）
    const wobbleOffset =
      isEngineFailing && Math.abs(this.speed) > 1.2
        ? (Math.sin(this.misfireClock * 6.4) * 0.65 +
            Math.sin(this.misfireClock * 13.7) * 0.35) *
          0.052 *
          failSeverity *
          Math.min(1, Math.abs(this.speed) / 8)
        : 0;
    const targetSteerAngle = -steerInput * maxSteerNow + wobbleOffset;
    const steerDelta = targetSteerAngle - this.steerAngle;
    const maxSteerStep = h.steerResponseSpeed * clampedDt;
    if (Math.abs(steerDelta) <= maxSteerStep) {
      this.steerAngle = targetSteerAngle;
    } else {
      this.steerAngle += Math.sign(steerDelta) * maxSteerStep;
    }

    // 3. 自転車モデルによる旋回と移動
    if (Math.abs(this.speed) > 0.02) {
      const angularVelocity =
        (this.speed / h.wheelbaseMeters) * Math.tan(this.steerAngle);
      this.yaw = normalizeAngle(this.yaw + angularVelocity * clampedDt);
    }

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const pos = this.vehicle.root.position;
    const prevX = pos.x;
    const prevZ = pos.z;
    const nextX = pos.x + fwdX * this.speed * clampedDt;
    const nextZ = pos.z + fwdZ * this.speed * clampedDt;

    // 4. 建物・ガードレール・街灯・他車両・外周壁との衝突解決
    const isBike = this.vehicle.config.type === 'bike';
    const colWidth = isBike
      ? Math.max(0.45, this.vehicle.dimensions.width * this.vehicle.config.colliderShrink)
      : this.vehicle.dimensions.width;
    const colLength = isBike
      ? Math.max(1.2, this.vehicle.dimensions.length * 0.92)
      : this.vehicle.dimensions.length;

    const col = this.collisionWorld.resolveVehicleCollision(
      nextX,
      nextZ,
      this.yaw,
      colWidth,
      colLength,
      this.vehicle.config.id,
    );

    pos.x = col.x;
    pos.z = col.z;

    if (col.collided) {
      const preSpeed = this.speed;
      const absPreSpeed = Math.abs(preSpeed);
      const vx = fwdX * preSpeed;
      const vz = fwdZ * preSpeed;
      const vn = vx * col.normalX + vz * col.normalZ;
      if (vn < 0) {
        const normalSpeed = -vn;
        const incidence = Math.max(
          0,
          Math.min(1, normalSpeed / Math.max(0.01, absPreSpeed)),
        );

        // 5-B: 衝突速度と入射角から衝撃エネルギー・ダメージを算出
        if (normalSpeed > 1.2 && this.impactCooldown <= 0) {
          this.handleCollisionImpact(
            absPreSpeed,
            normalSpeed,
            incidence,
            col.contactX,
            col.contactZ,
            col.normalX,
            col.normalZ,
          );
        }

        // 衝突方向への突っ込み成分を打ち消し、高速時は軽く反発・低速時は停止
        if (normalSpeed > 3.0) {
          this.speed = -Math.sign(preSpeed) * Math.min(2.4, normalSpeed * 0.25);
        } else {
          this.speed *= 0.15;
          if (Math.abs(this.speed) < 0.25) {
            this.speed = 0;
          }
        }
      }
    }

    // 走行距離をオイル漏れトラッキング用に積算（中傷 HP 45% 以下）
    const movedDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
    if (this.hp <= HEAVY_DAMAGE_HP && movedDist > 0.001) {
      this.oilLeakDistanceAccum += movedDist;
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

    // 6. バイク専用車体バンク（ロール角）演出：速度と舵角に応じてカーブ内側へ傾き、直進で水平復帰
    const lean = this.vehicle.config.lean;
    if (lean) {
      const forwardSpeed = Math.max(0, this.speed);
      const speedFactor = Math.min(1, forwardSpeed / lean.speedRefMs);
      const normalizedSteer = maxSteerNow > 0.001 ? this.steerAngle / maxSteerNow : 0;
      const targetRoll = -normalizedSteer * speedFactor * lean.maxRollRad;
      const rollBlend = 1 - Math.exp(-lean.responseRate * clampedDt);
      this.leanRoll += (targetRoll - this.leanRoll) * rollBlend;
      if (Math.abs(this.leanRoll) < 0.0005 && Math.abs(targetRoll) < 0.0005) {
        this.leanRoll = 0;
      }
      this.vehicle.setLeanRoll(this.leanRoll);
    }

    // 7. 車輪回転・前輪ステアリング・車内ハンドルのビジュアル反映
    this.vehicle.setSteerAngle(this.steerAngle);
    if (Math.abs(this.speed) > 0.005) {
      const deltaSpin = (this.speed * clampedDt) / this.wheelRadius;
      this.vehicle.addWheelSpin(deltaSpin);
    }

    // 8. 車両自身の OBB コライダーを最新位置へ同期
    this.syncCollider();
  }

  private handleCollisionImpact(
    impactSpeed: number,
    normalSpeed: number,
    incidence: number,
    contactX: number,
    contactZ: number,
    normalX: number,
    normalZ: number,
  ): void {
    this.impactCooldown = IMPACT_DAMAGE_COOLDOWN_SEC;

    const pos = this.vehicle.root.position;
    const dims = this.vehicle.dimensions;
    const contactY = pos.y + dims.height * (this.vehicle.config.type === 'bike' ? 0.52 : 0.42);

    let damage = 0;
    if (normalSpeed >= 2.1 && this.damageState !== 'burning' && this.damageState !== 'wrecked') {
      const energy =
        (normalSpeed - 1.65) *
        (0.42 + 0.58 * incidence) *
        (1 + normalSpeed * 0.044);
      const profileScale =
        this.vehicle.config.audioProfile === 'bike'
          ? 1.22
          : this.vehicle.config.audioProfile === 'sports'
            ? 1.05
            : 0.92;
      damage = Math.min(68, Math.max(2, energy * profileScale * 0.92));
      this.hp = Math.max(0, this.hp - damage);

      // 5-B2: 5段階ダメージ進行（HP70%軽傷 -> HP45%中傷 -> HP15%以下炎上直前2.5秒カウントダウン）
      if (this.hp <= IGNITE_HP) {
        this.damageState = 'burning';
        this.burnTimer = BURN_COUNTDOWN_SEC;
        this.burnStartHp = this.hp;
        this.fireBeepTimer = 0;
      } else if (this.hp <= HEAVY_DAMAGE_HP) {
        this.damageState = 'heavy';
      } else if (this.hp <= LIGHT_DAMAGE_HP) {
        this.damageState = 'light';
      }
    }

    const intensity01 = Math.max(
      0.12,
      Math.min(1, (normalSpeed - 1.0) / 22.0 * (0.55 + 0.45 * incidence)),
    );

    // 衝突ポイントおよび押し込み方向を車体ローカル空間 (+X=左, +Z=前) へ変換してボディを凹ませる
    if (damage >= 2.5) {
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const dx = contactX - pos.x;
      const dz = contactZ - pos.z;
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      const localY = Math.max(0.28, contactY - pos.y);
      // 押し出し法線 (normalX, normalZ) が障害物 -> 車両内部への押し込み方向と一致
      const localPushX = normalX * cos - normalZ * sin;
      const localPushZ = normalX * sin + normalZ * cos;

      this.vehicle.damageVisuals.applyImpactDent(
        localX,
        localY,
        localZ,
        localPushX,
        localPushZ,
        Math.min(1, intensity01 * 0.85 + Math.min(0.4, damage / 65)),
      );
    }

    const ev = this.impactEventScratch;
    ev.impactSpeed = impactSpeed;
    ev.normalSpeed = normalSpeed;
    ev.incidence = incidence;
    ev.damage = damage;
    ev.intensity01 = intensity01;
    ev.worldX = contactX;
    ev.worldY = contactY;
    ev.worldZ = contactZ;
    ev.normalX = normalX;
    ev.normalZ = normalZ;
    this.pendingImpact = ev;
  }

  /**
   * 5-B / 5-B2: 毎フレームの5段階リアルダメージ演出
   * （軽傷白煙 -> 中傷黒煙＆オイル漏れ＆火花 -> 炎上直前2.5秒火柱＆警告音 -> 大爆発＆車体跳ね上がり＆破片飛散 -> 8〜10秒炎上継続＆鎮火フェードアウト＆自動リスポーン）
   */
  public updateDamageLifecycle(
    dt: number,
    effects: VehicleDamageEffects,
    rainAmount: number,
    out: VehicleDamageTickResult,
  ): void {
    const clampedDt = Math.min(dt, 0.05);
    out.impact = this.pendingImpact;
    this.pendingImpact = null;
    out.fireBeep = false;
    out.fireBeepUrgency = 0;
    out.explodedNow = false;
    out.wreckLandedNow = false;
    out.readyToRespawn = false;
    out.fireLightIntensity = 0;

    const isBurning = this.damageState === 'burning';
    const isWrecked = this.damageState === 'wrecked';
    const isBike = this.vehicle.config.type === 'bike';

    // 炎上強度および残骸フェードアウト透過度を算出
    let visualFireIntensity = 0;
    let wreckFadeOpacity = 1;
    if (isBurning) {
      visualFireIntensity = 0.35 + (1 - this.burnTimer / BURN_COUNTDOWN_SEC) * 0.65;
    } else if (isWrecked) {
      if (this.wreckElapsed <= WRECK_FULL_FIRE_SEC) {
        visualFireIntensity = 1.0;
      } else if (this.wreckElapsed < WRECK_EXTINGUISH_SEC) {
        visualFireIntensity = Math.max(
          0,
          1 -
            (this.wreckElapsed - WRECK_FULL_FIRE_SEC) /
              (WRECK_EXTINGUISH_SEC - WRECK_FULL_FIRE_SEC),
        );
      } else {
        visualFireIntensity = 0;
        const fadeSpan = Math.max(0.1, WRECK_RESPAWN_SEC - WRECK_EXTINGUISH_SEC);
        wreckFadeOpacity = Math.max(
          0,
          1 - (this.wreckElapsed - WRECK_EXTINGUISH_SEC) / fadeSpan,
        );
      }
    }

    // 1. ボディ表面（傷/煤/黒焦げ/赤熱/鎮火フェードアウト＋雨濡れ合成）および破損ヘッドライト点滅の更新
    this.vehicle.damageVisuals.update(
      clampedDt,
      this.hp / 100,
      isBurning,
      isWrecked,
      rainAmount,
      visualFireIntensity,
      wreckFadeOpacity,
    );

    // 2. 衝突瞬間の金属火花パーティクル放出
    if (out.impact && out.impact.normalSpeed > 1.8) {
      effects.emitImpactSparks(
        out.impact.worldX,
        out.impact.worldY,
        out.impact.worldZ,
        out.impact.normalX,
        out.impact.normalZ,
        out.impact.intensity01,
      );
    }

    // エンジンワールド座標を計算（煙・火花・炎の発生源、爆発跳ね上がり高さにも追従）
    const eng = this.computeEngineWorldPosition(this.enginePosScratch);
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const vx = fwdX * this.speed;
    const vz = fwdZ * this.speed;

    // 3. 耐久度別の5段階エフェクト
    if (this.damageState === 'light') {
      // 【段階1: 軽傷（HP 70% 以下）】ボンネット／エンジン部から細い白煙が風に流されながら上昇
      this.smokeEmitTimer -= clampedDt;
      if (this.smokeEmitTimer <= 0) {
        const ratio = Math.max(
          0,
          Math.min(1, (LIGHT_DAMAGE_HP - this.hp) / (LIGHT_DAMAGE_HP - HEAVY_DAMAGE_HP)),
        );
        this.smokeEmitTimer = 0.16 - ratio * 0.05;
        effects.emitEngineSmoke(
          eng.x,
          eng.y,
          eng.z,
          0.06 + ratio * 0.14,
          0.62 + ratio * 0.24,
          vx,
          vz,
          1.35,
          0.95,
        );
      }
    } else if (this.damageState === 'heavy') {
      // 【段階2: 中傷（HP 45% 以下）】濃いグレー〜黒煙へ変化し量が増える＋路面オイル漏れ痕＋時折パチパチ火花
      this.smokeEmitTimer -= clampedDt;
      if (this.smokeEmitTimer <= 0) {
        const ratio = Math.max(
          0,
          Math.min(1, (HEAVY_DAMAGE_HP - this.hp) / (HEAVY_DAMAGE_HP - IGNITE_HP)),
        );
        this.smokeEmitTimer = 0.088 - ratio * 0.032;
        effects.emitEngineSmoke(
          eng.x,
          eng.y,
          eng.z,
          0.62 + ratio * 0.28,
          0.92 + ratio * 0.42,
          vx,
          vz,
          1.15,
          1.1,
        );
      }

      this.damageSparkTimer -= clampedDt;
      if (this.damageSparkTimer <= 0) {
        this.damageSparkTimer = 0.42 + Math.random() * 0.72;
        effects.emitDamageSparks(eng.x, eng.y - 0.1, eng.z);
      }

      // 走行中の路面上に光沢のある黒いオイル漏れ痕を点々と残す（リングバッファ）
      if (this.oilLeakDistanceAccum >= 1.25) {
        this.oilLeakDistanceAccum = 0;
        const oilPos = this.computeOilLeakWorldPosition(this.oilPosScratch);
        const groundY = Math.max(
          0,
          this.collisionWorld.getGroundHeight(oilPos.x, oilPos.z),
        );
        const dropScale = isBike ? 0.46 : 0.7;
        effects.stampOilDrop(oilPos.x, groundY, oilPos.z, dropScale, false);
      }
    } else if (isBurning) {
      // 【段階3: 炎上直前（HP 15% 以下〜0%）】ボンネットから赤い火柱と黒煙が急拡大＋約2.5秒間の緊急警告音
      this.burnTimer = Math.max(0, this.burnTimer - clampedDt);
      const urgency = 1 - this.burnTimer / BURN_COUNTDOWN_SEC;
      // 残りHPを2.5秒かけて0%へ滑らかに低下させる
      this.hp = Math.max(0, this.burnStartHp * (1 - urgency));

      this.fireBeepTimer -= clampedDt;
      if (this.fireBeepTimer <= 0) {
        out.fireBeep = true;
        out.fireBeepUrgency = urgency;
        this.fireBeepTimer = Math.max(0.11, 0.34 - urgency * 0.22);
      }

      // 火勢が急激に強まる多層赤い火柱
      this.fireEmitTimer -= clampedDt;
      if (this.fireEmitTimer <= 0) {
        this.fireEmitTimer = Math.max(0.024, 0.052 - urgency * 0.026);
        const pillarScale = (isBike ? 0.72 : 0.95) + urgency * 0.75;
        effects.emitFireFlame(eng.x, eng.y - 0.06, eng.z, pillarScale, 0.35 + urgency * 0.5);
        if (urgency > 0.45) {
          effects.emitFireFlame(
            eng.x + (Math.random() - 0.5) * 0.35,
            eng.y + 0.12,
            eng.z + (Math.random() - 0.5) * 0.35,
            pillarScale * 0.82,
            0.75,
          );
        }
      }

      this.smokeEmitTimer -= clampedDt;
      if (this.smokeEmitTimer <= 0) {
        this.smokeEmitTimer = Math.max(0.042, 0.068 - urgency * 0.022);
        effects.emitEngineSmoke(
          eng.x,
          eng.y + 0.24,
          eng.z,
          0.92,
          1.25 + urgency * 0.55,
          vx * 0.3,
          vz * 0.3,
          1.0,
          1.3,
        );
      }

      this.damageSparkTimer -= clampedDt;
      if (this.damageSparkTimer <= 0) {
        this.damageSparkTimer = Math.max(0.14, 0.32 - urgency * 0.16) + Math.random() * 0.18;
        effects.emitDamageSparks(eng.x, eng.y, eng.z);
      }

      // ボンネット炎上の路面照り返しライト
      out.fireLightIntensity = 0.28 + urgency * 0.45;
      out.fireLightX = eng.x;
      out.fireLightY = eng.y + 0.65;
      out.fireLightZ = eng.z;

      if (this.burnTimer <= 0) {
        // 【段階4: 大爆発の瞬間】閃光・衝撃波・破片飛散バウンド・車体跳ね上がり＆傾き落下
        const pos = this.vehicle.root.position;
        const groundY = Math.max(
          0,
          this.collisionWorld.getGroundHeight(pos.x, pos.z),
        );
        this.hp = 0;
        this.damageState = 'wrecked';
        this.respawnTimer = WRECK_RESPAWN_SEC;
        this.wreckElapsed = 0;
        this.speed = 0;

        // 爆発の衝撃で車体自体が宙に跳ね上がって傾き、ドスンと地面に落ちる物理リアクション
        const leanSign = Math.random() < 0.5 ? -1 : 1;
        this.blastHopY = 0.03;
        this.blastHopVelY = isBike ? 5.5 : 4.7;
        this.blastPitch = 0;
        this.blastPitchVel = isBike ? -2.2 : -1.75;
        this.blastRoll = 0;
        this.blastRollVel = leanSign * (isBike ? 3.2 : 1.85);
        this.blastRestPitch = isBike ? -0.04 : -0.028;
        this.blastRestRoll = leanSign * (isBike ? 0.58 : 0.055);
        this.blastBounceCount = 0;
        this.blastThudPending = false;

        this.vehicle.damageVisuals.applyExplosionWreckDeformation();
        effects.triggerExplosion(pos.x, groundY, pos.z, isBike);
        out.explodedNow = true;
      }
    } else if (isWrecked) {
      // 【段階5: 炎上継続（約8〜10秒）〜鎮火＆フェードアウト＆自動リスポーン】
      this.wreckElapsed += clampedDt;
      this.respawnTimer = Math.max(0, this.respawnTimer - clampedDt);

      const pos = this.vehicle.root.position;
      const dims = this.vehicle.dimensions;

      // 跳ね上がった車体が地面へドスンと落下した瞬間の着地インパクト通知＋火花
      if (this.blastThudPending) {
        this.blastThudPending = false;
        out.wreckLandedNow = true;
        effects.emitImpactSparks(pos.x, pos.y + 0.15, pos.z, 0, 1, 0.55);
      }

      // 多層の炎＋高く立ち上る黒煙＋揺らぐ赤オレンジ PointLight
      if (visualFireIntensity > 0.04) {
        this.fireEmitTimer -= clampedDt;
        if (this.fireEmitTimer <= 0) {
          this.fireEmitTimer = 0.034 + (1 - visualFireIntensity) * 0.07;
          // ボンネット（エンジン部）のメイン火柱
          const mainScale = (isBike ? 0.72 : 1.15) * (0.45 + 0.65 * visualFireIntensity);
          effects.emitFireFlame(eng.x, eng.y - 0.06, eng.z, mainScale, 0.6);

          // キャビン中央・後方にも炎を広げて車体全体が激しく燃える多層表現
          if (!isBike && visualFireIntensity > 0.28) {
            const spotOffset =
              (Math.random() < 0.65 ? 0.04 : -0.26) * dims.length;
            this.wreckSpotScratch.set(
              pos.x + fwdX * spotOffset + (Math.random() - 0.5) * dims.width * 0.36,
              pos.y + this.blastHopY + dims.height * (0.45 + Math.random() * 0.25),
              pos.z + fwdZ * spotOffset + (Math.random() - 0.5) * dims.width * 0.36,
            );
            effects.emitFireFlame(
              this.wreckSpotScratch.x,
              this.wreckSpotScratch.y,
              this.wreckSpotScratch.z,
              mainScale * 0.9,
              0.42,
            );
          }
        }

        // 高く立ち昇る濃い黒煙柱
        this.smokeEmitTimer -= clampedDt;
        if (this.smokeEmitTimer <= 0) {
          this.smokeEmitTimer = 0.055 + (1 - visualFireIntensity) * 0.095;
          const smokeZ = (Math.random() - 0.25) * dims.length * 0.45;
          effects.emitEngineSmoke(
            pos.x + fwdX * smokeZ,
            pos.y + this.blastHopY + dims.height * 0.68,
            pos.z + fwdZ * smokeZ,
            0.93,
            (isBike ? 0.95 : 1.38) * (0.55 + 0.55 * visualFireIntensity),
            0,
            0,
            1.1,
            1.55,
          );
        }

        // 立ち昇る火の粉
        this.emberEmitTimer -= clampedDt;
        if (this.emberEmitTimer <= 0) {
          this.emberEmitTimer = 0.16 + (1 - visualFireIntensity) * 0.22;
          effects.emitBurningEmbers(
            pos.x + fwdX * dims.length * 0.12,
            pos.y + this.blastHopY + dims.height * 0.6,
            pos.z + fwdZ * dims.length * 0.12,
            isBike ? 0.45 : 1.0,
            visualFireIntensity > 0.6 ? 3 : 2,
          );
        }

        // 揺らぐ赤オレンジの路面・周囲照り返し PointLight 情報
        out.fireLightIntensity = visualFireIntensity;
        out.fireLightX = pos.x + fwdX * dims.length * 0.12;
        out.fireLightY = pos.y + this.blastHopY + dims.height + 0.55;
        out.fireLightZ = pos.z + fwdZ * dims.length * 0.12;
      } else if (wreckFadeOpacity > 0.2) {
        // 鎮火直後のくすぶり薄煙
        this.smokeEmitTimer -= clampedDt;
        if (this.smokeEmitTimer <= 0) {
          this.smokeEmitTimer = 0.2;
          effects.emitEngineSmoke(eng.x, eng.y, eng.z, 0.68, 0.55 * wreckFadeOpacity, 0, 0, 1.2, 0.85);
        }
      }

      if (this.respawnTimer <= 0) {
        out.readyToRespawn = true;
      }
    }
  }

  private computeEngineWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.vehicle.root.position;
    const dims = this.vehicle.dimensions;
    const isBike = this.vehicle.config.type === 'bike';
    const localZ = isBike ? dims.length * 0.05 : dims.length * 0.34;
    const localY = isBike ? dims.height * 0.46 : dims.height * 0.56;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    out.set(
      pos.x + fwdX * localZ,
      pos.y + this.blastHopY + localY,
      pos.z + fwdZ * localZ,
    );
    return out;
  }

  private computeOilLeakWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const pos = this.vehicle.root.position;
    const dims = this.vehicle.dimensions;
    const isBike = this.vehicle.config.type === 'bike';
    const localZ = isBike ? -dims.length * 0.04 : dims.length * 0.24;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    out.set(pos.x + fwdX * localZ, pos.y, pos.z + fwdZ * localZ);
    return out;
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
