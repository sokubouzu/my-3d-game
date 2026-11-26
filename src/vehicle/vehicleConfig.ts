export type WheelSlot = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export interface WheelNodeBinding {
  /** 車輪の回転（spin）および前輪ステアリングに追従するノード名（タイヤ・リム・ブレーキディスク等） */
  spinNodeNames: readonly string[];
  /** 前輪ステアリングのみに追従し回転しないノード名（ブレーキキャリパー等） */
  steerOnlyNodeNames: readonly string[];
  /** ステアリング対象か（前輪のみ true） */
  steerable: boolean;
  /** 元モデルで前輪が初期ステア角を持っている場合の Y 軸直進補正角 (rad) */
  initialYawCorrection?: number;
}

export interface VehicleHandlingSpec {
  /** 最高前進速度 (m/s) */
  maxForwardSpeed: number;
  /** 最高後退速度 (m/s) */
  maxReverseSpeed: number;
  /** ベース前進加速度 (m/s^2) */
  accelRate: number;
  /** 後退加速度 (m/s^2) */
  reverseAccel: number;
  /** 通常ブレーキ減速度 (m/s^2) */
  brakeDecel: number;
  /** 強ブレーキ / ハンドブレーキ減速度 (m/s^2) */
  handbrakeDecel: number;
  /** ペダルオフ時の慣性減速 (m/s^2) */
  coastDrag: number;
  /** 低速時の最大ステアリング角 (rad) */
  maxSteerAngle: number;
  /** 最高速付近の最小ステアリング角 (rad) */
  minHighSpeedSteer: number;
  /** ステアリング応答速度 (rad/s) */
  steerResponseSpeed: number;
  /** ホイールベース (m) */
  wheelbaseMeters: number;
}

export interface HeroVehicleConfig {
  /** コライダー・シーン識別子 */
  id: string;
  /** docs/ASSET_MANIFEST.json の assetId */
  assetId: string;
  /** 表示用名称 */
  displayName: string;
  /** public/ からの相対 URL */
  url: string;
  /** 目標全長 (m) — 乗用車の現実的スケール (4.3〜4.8m) */
  targetLengthMeters: number;
  /**
   * 元モデルの前方方向を車両標準ローカル前方 (+Z) へ揃えるための Y 軸補正角 (rad)。
   * Toyota Kijang Innova GLB は元データが -Z 前方のため Math.PI で +Z 正面へ正規化する。
   */
  modelForwardCorrectionY: number;
  /** 初期配置座標 (m) — Y は常に 0 厳密接地 */
  initialPosition: { x: number; z: number };
  /** 初期向き (rad, 0 = +Z 正面向き) */
  initialRotationY: number;
  /** コリジョンボックス縮小率（ミラー等の引っかかり緩和） */
  colliderShrink: number;
  /** ロード完了前の暫定コリジョン寸法 (m) */
  placeholderDimensions: { width: number; height: number; length: number };
  /** リアルタイムシャドウ投影の有無 */
  castShadow: boolean;
  /** 走行・操舵スペック */
  handling: VehicleHandlingSpec;
  /** 4輪の独立ノード定義 */
  wheels: Record<WheelSlot, WheelNodeBinding>;
  /** ステアリングホイール独立ノード名（未分離の場合は空文字） */
  steeringWheelNodeName: string;
  /** ステアリングホイールの最大回転角倍率（前輪ステア角に対する比） */
  steeringWheelRatio: number;
}

/**
 * 作業ID 2-A / 2-C: 1台目の運転可能車両（主役車両: Toyota Kijang Innova 2.0 G）。
 * - 2-C にて最高速を約 110 km/h (30.6 m/s) へ引き上げ、加速・制動・高速ステア安定性を調整。
 */
export const HERO_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'hero_vehicle_innova',
  assetId: '2011_-_13_toyota_kijang_innova_2.0_g_tgn40',
  displayName: 'Toyota Kijang Innova',
  url: './assets/vehicles/2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb',
  targetLengthMeters: 4.6,
  modelForwardCorrectionY: Math.PI,
  initialPosition: { x: 4.1, z: 8.5 },
  initialRotationY: 0,
  colliderShrink: 0.92,
  placeholderDimensions: { width: 1.89, height: 1.74, length: 4.6 },
  castShadow: true,
  handling: {
    maxForwardSpeed: 30.6, // ~110 km/h
    maxReverseSpeed: 7.0, // ~25 km/h
    accelRate: 13.0,
    reverseAccel: 6.0,
    brakeDecel: 24.5,
    handbrakeDecel: 34.0,
    coastDrag: 2.8,
    maxSteerAngle: 0.56,
    minHighSpeedSteer: 0.15,
    steerResponseSpeed: 8.5,
    wheelbaseMeters: 2.78,
  },
  wheels: {
    frontLeft: {
      spinNodeNames: ['paint.044', 'paint.041', 'paint.045', 'Cylinder.039'],
      steerOnlyNodeNames: ['Cylinder.045'],
      steerable: true,
    },
    frontRight: {
      spinNodeNames: ['paint.042', 'paint.040', 'paint.043', 'Cylinder.040'],
      steerOnlyNodeNames: ['Cylinder.041'],
      steerable: true,
    },
    rearLeft: {
      spinNodeNames: ['paint.038', 'paint.035', 'paint.039'],
      steerOnlyNodeNames: [],
      steerable: false,
    },
    rearRight: {
      spinNodeNames: ['paint.036', 'paint.027', 'paint.037', 'Cylinder.044'],
      steerOnlyNodeNames: [],
      steerable: false,
    },
  },
  steeringWheelNodeName: 'stir',
  steeringWheelRatio: 8.0,
};

/**
 * 作業ID 2-C: 2台目の運転可能車両（街区北側車道に配置済みだったスポーツカー: 1975 Porsche 911 930 Turbo）。
 * - 既存の静的配置（x: -3.6, z: -22, rotationY: Math.PI, 全長 4.3m）を多重配置せずそのまま運転車両化。
 * - 最高速 約 160 km/h (44.5 m/s)・加速強化仕様・4輪独立回転＆前輪ステアリング対応。
 * - 元モデルの前輪ノードは初期状態で約 -18.5° (-0.3236 rad) ステアしているため、直進補正角 (+0.3236 rad) を適用。
 */
export const SPORTS_CAR_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'veh_porsche_north',
  assetId: 'free_1975_porsche_911_930_turbo',
  displayName: 'Porsche 911 Turbo',
  url: './assets/vehicles/free_1975_porsche_911_930_turbo.glb',
  targetLengthMeters: 4.3,
  modelForwardCorrectionY: 0,
  initialPosition: { x: -4.2, z: -22.0 },
  initialRotationY: Math.PI,
  colliderShrink: 0.92,
  placeholderDimensions: { width: 1.8, height: 1.35, length: 4.3 },
  castShadow: false,
  handling: {
    maxForwardSpeed: 44.5, // ~160 km/h
    maxReverseSpeed: 8.5, // ~30 km/h
    accelRate: 20.0,
    reverseAccel: 7.5,
    brakeDecel: 32.0,
    handbrakeDecel: 44.0,
    coastDrag: 3.0,
    maxSteerAngle: 0.54,
    minHighSpeedSteer: 0.11,
    steerResponseSpeed: 10.0,
    wheelbaseMeters: 2.33,
  },
  wheels: {
    frontLeft: {
      spinNodeNames: ['Circle.051_37', 'Circle.048_52'],
      steerOnlyNodeNames: [],
      steerable: true,
      initialYawCorrection: 0.3236,
    },
    frontRight: {
      spinNodeNames: ['Circle.037_2'],
      steerOnlyNodeNames: [],
      steerable: true,
      initialYawCorrection: 0.3236,
    },
    rearLeft: {
      spinNodeNames: ['Circle.050_51'],
      steerOnlyNodeNames: [],
      steerable: false,
    },
    rearRight: {
      spinNodeNames: ['Circle.038_1'],
      steerOnlyNodeNames: [],
      steerable: false,
    },
  },
  steeringWheelNodeName: '',
  steeringWheelRatio: 0,
};

/** 運転可能な全車両リスト */
export const DRIVABLE_VEHICLES: readonly HeroVehicleConfig[] = [
  HERO_VEHICLE_CONFIG,
  SPORTS_CAR_VEHICLE_CONFIG,
];
