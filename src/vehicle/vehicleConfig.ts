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

export type VehicleAudioProfile = 'standard' | 'sports';

export interface VehicleEngineAudioProfileParams {
  /** 基音オシレーター波形 */
  osc1Type: OscillatorType;
  /** 2倍音オシレーター波形 */
  osc2Type: OscillatorType;
  /** 3倍音（補助倍音）オシレーター波形 */
  harmonicOscType: OscillatorType;
  /** 各オシレーターのミックス音量 */
  osc1Gain: number;
  osc2Gain: number;
  harmonicGain: number;
  /** アイドリング〜最高速の基本周波数 (Hz) */
  idleFreq: number;
  maxFreq: number;
  /** 2倍音・3倍音の周波数比 */
  harmonic2Ratio: number;
  harmonic3Ratio: number;
  /** 回転数カーブの指数・アクセル踏み込みブースト・上限・追従時定数 */
  revExponent: number;
  throttleBoost: number;
  maxRevNorm: number;
  freqTau: number;
  /** アイドリング脈動 LFO パラメータ */
  idlePulseBaseRate: number;
  idlePulseSpeedScale: number;
  idlePulseDepth: number;
  /** フィルター設定（ハイパス・ローパスカットオフ・Q・中音域ピーキング） */
  highpassFreq: number;
  filterMin: number;
  filterMax: number;
  filterQ: number;
  filterRevWeight: number;
  filterThrottleWeight: number;
  midBoostGainDb: number;
  /** エンジン音量バランス */
  engineBaseGain: number;
  engineThrottleGain: number;
  engineSpeedGain: number;
  /** ロードノイズ（タイヤ転がり音・風切り音）バランス */
  roadSpeedRefKmh: number;
  roadExponent: number;
  roadGainScale: number;
  roadFreqMin: number;
  roadFreqMax: number;
}

/**
 * 車種別エンジン音・ロードノイズチューニング定義。
 * - standard: 静かな実用車・ミニバン向け（triangle/sine 中心、カットオフ 220Hz〜420Hz、低いエンジン音＋ロードノイズ主体）
 * - sports: 高回転まで伸びるスポーツカー向け（sawtooth 倍音＋680Hz〜2600Hz フィルター開度で差別化）
 */
export const VEHICLE_ENGINE_AUDIO_PROFILES: Record<
  VehicleAudioProfile,
  VehicleEngineAudioProfileParams
> = {
  standard: {
    osc1Type: 'triangle',
    osc2Type: 'sine',
    harmonicOscType: 'sine',
    osc1Gain: 0.62,
    osc2Gain: 0.34,
    harmonicGain: 0.1,
    idleFreq: 54,
    maxFreq: 128,
    harmonic2Ratio: 2.0,
    harmonic3Ratio: 3.0,
    revExponent: 0.9,
    throttleBoost: 0.07,
    maxRevNorm: 1.04,
    freqTau: 0.095,
    idlePulseBaseRate: 8.5,
    idlePulseSpeedScale: 10,
    idlePulseDepth: 0.025,
    highpassFreq: 72,
    filterMin: 220,
    filterMax: 420,
    filterQ: 0.85,
    filterRevWeight: 0.78,
    filterThrottleWeight: 0.22,
    midBoostGainDb: 0.5,
    engineBaseGain: 0.17,
    engineThrottleGain: 0.055,
    engineSpeedGain: 0.045,
    roadSpeedRefKmh: 110,
    roadExponent: 1.35,
    roadGainScale: 0.32,
    roadFreqMin: 380,
    roadFreqMax: 920,
  },
  sports: {
    osc1Type: 'sawtooth',
    osc2Type: 'sawtooth',
    harmonicOscType: 'triangle',
    osc1Gain: 0.5,
    osc2Gain: 0.48,
    harmonicGain: 0.36,
    idleFreq: 86,
    maxFreq: 295,
    harmonic2Ratio: 2.02,
    harmonic3Ratio: 3.03,
    revExponent: 0.78,
    throttleBoost: 0.18,
    maxRevNorm: 1.12,
    freqTau: 0.045,
    idlePulseBaseRate: 14,
    idlePulseSpeedScale: 22,
    idlePulseDepth: 0.055,
    highpassFreq: 105,
    filterMin: 680,
    filterMax: 2600,
    filterQ: 2.4,
    filterRevWeight: 0.85,
    filterThrottleWeight: 0.28,
    midBoostGainDb: 5.0,
    engineBaseGain: 0.3,
    engineThrottleGain: 0.15,
    engineSpeedGain: 0.11,
    roadSpeedRefKmh: 120,
    roadExponent: 2.0,
    roadGainScale: 0.24,
    roadFreqMin: 480,
    roadFreqMax: 1160,
  },
};

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
  /** 3-D: エンジン音プロファイル（standard = 静かな実用車 / sports = スポーツカー） */
  audioProfile: VehicleAudioProfile;
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
  audioProfile: 'standard',
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
  audioProfile: 'sports',
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
