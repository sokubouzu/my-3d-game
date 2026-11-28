import type { VehicleLightLayout } from './vehicleLights';

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

export type VehicleType = 'car' | 'bike';

export interface VehicleLeanConfig {
  /** カーブ内側への最大バンク（ロール）角 (rad) */
  maxRollRad: number;
  /** 最大バンクに達する基準速度 (m/s) */
  speedRefMs: number;
  /** バンク角の追従・水平復帰速度 (1/s) */
  responseRate: number;
}

export interface BikeRiderMountConfig {
  /** バイク原点 (Y=0接地) からのシート跨がり Y オフセット (m) */
  offsetY: number;
  /** バイク原点からのシート前後 Z オフセット (m, +Z=前方) */
  offsetZ: number;
  /** 乗車時の軽度前傾角 (rad, +X 回転で前傾) */
  forwardLeanRad: number;
  /** 再生するアニメーションクリップ名（存在しない場合は Idle へフォールバック） */
  animationName: string;
}

export type VehicleAudioProfile = 'standard' | 'sports' | 'supercar' | 'bike';

export interface MergedWheelSplitConfig {
  /**
   * 5-Fix2: 4輪または片側2輪が1メッシュへ結合されている回転車輪ノード名（タイヤ・リム・ブレーキローター等）。
   * ロード時に車両ローカル空間の象限（FL/FR/RL/RR）で頂点コンパクト分割し、独立ピボットへ自動組み替えする。
   */
  spinMeshNames: readonly string[];
  /**
   * 5-Fix2: 4輪が1メッシュへ結合されているステアリング追従のみノード名（ブレーキキャリパー・バッジ等）。
   */
  steerOnlyMeshNames?: readonly string[];
}

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
 * - supercar: 20B 3ローター／レーシングスーパーカー向け（完全5度＆3倍音の鋭く高回転へ吹け上がる排気音）
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
  supercar: {
    // Mazda Furai (3ローター・プロトタイプレーシングカー) 向けの甲高く鋭い高回転スポーツ排気音
    osc1Type: 'sawtooth',
    osc2Type: 'sawtooth',
    harmonicOscType: 'sawtooth',
    osc1Gain: 0.48,
    osc2Gain: 0.46,
    harmonicGain: 0.34,
    idleFreq: 102,
    maxFreq: 388,
    harmonic2Ratio: 1.505,
    harmonic3Ratio: 3.015,
    revExponent: 0.72,
    throttleBoost: 0.22,
    maxRevNorm: 1.15,
    freqTau: 0.032,
    idlePulseBaseRate: 17,
    idlePulseSpeedScale: 28,
    idlePulseDepth: 0.06,
    highpassFreq: 118,
    filterMin: 780,
    filterMax: 3350,
    filterQ: 2.75,
    filterRevWeight: 0.88,
    filterThrottleWeight: 0.3,
    midBoostGainDb: 5.8,
    engineBaseGain: 0.31,
    engineThrottleGain: 0.16,
    engineSpeedGain: 0.12,
    roadSpeedRefKmh: 165,
    roadExponent: 1.9,
    roadGainScale: 0.25,
    roadFreqMin: 520,
    roadFreqMax: 1380,
  },
  bike: {
    // 単気筒〜Vツイン2気筒カスタムバイクらしい軽快で歯切れのよい排気音（明確なアイドリング鼓動感＋鋭い吹け上がり）
    osc1Type: 'sawtooth',
    osc2Type: 'square',
    harmonicOscType: 'triangle',
    osc1Gain: 0.56,
    osc2Gain: 0.3,
    harmonicGain: 0.28,
    idleFreq: 46,
    maxFreq: 215,
    harmonic2Ratio: 1.5,
    harmonic3Ratio: 2.02,
    revExponent: 0.72,
    throttleBoost: 0.24,
    maxRevNorm: 1.15,
    freqTau: 0.035,
    idlePulseBaseRate: 10.5,
    idlePulseSpeedScale: 26,
    idlePulseDepth: 0.13,
    highpassFreq: 95,
    filterMin: 460,
    filterMax: 2100,
    filterQ: 2.8,
    filterRevWeight: 0.82,
    filterThrottleWeight: 0.32,
    midBoostGainDb: 4.5,
    engineBaseGain: 0.27,
    engineThrottleGain: 0.16,
    engineSpeedGain: 0.09,
    roadSpeedRefKmh: 135,
    roadExponent: 1.8,
    roadGainScale: 0.18,
    roadFreqMin: 520,
    roadFreqMax: 1400,
  },
};

export interface HeroVehicleConfig {
  /** コライダー・シーン識別子 */
  id: string;
  /** 車両種別（'car' = 四輪車 / 'bike' = 二輪バイク） */
  type: VehicleType;
  /** docs/ASSET_MANIFEST.json の assetId */
  assetId: string;
  /** 表示用名称 */
  displayName: string;
  /** public/ からの相対 URL */
  url: string;
  /** 目標全長 (m) — 乗用車の現実的スケール (4.3〜4.8m) / バイク (2.3m) */
  targetLengthMeters: number;
  /**
   * 元モデルの前方方向を車両標準ローカル前方 (+Z) へ揃えるための Y 軸補正角 (rad)。
   * Toyota Kijang Innova GLB および Harley Custom Bike GLB は元データが -Z 前方のため Math.PI で +Z 正面へ正規化する。
   */
  modelForwardCorrectionY: number;
  /** 初期配置座標 (m) — Y は常に 0 厳密接地 */
  initialPosition: { x: number; z: number };
  /** 初期向き (rad, 0 = +Z 正面向き) */
  initialRotationY: number;
  /** コリジョンボックス縮小率（ミラー・ハンドル端の引っかかり緩和） */
  colliderShrink: number;
  /** ロード完了前の暫定コリジョン寸法 (m) */
  placeholderDimensions: { width: number; height: number; length: number };
  /** リアルタイムシャドウ投影の有無 */
  castShadow: boolean;
  /** 3-D / 5-Fix2: エンジン音プロファイル（standard / sports / supercar / bike） */
  audioProfile: VehicleAudioProfile;
  /** 走行・操舵スペック */
  handling: VehicleHandlingSpec;
  /** バイク用バンク（ロール角傾き）設定 */
  lean?: VehicleLeanConfig;
  /** バイク乗車時のプレイヤー跨がり姿勢設定 */
  riderMount?: BikeRiderMountConfig;
  /** 4輪の独立ノード定義 */
  wheels: Record<WheelSlot, WheelNodeBinding>;
  /** 5-Fix2: マテリアル単位で結合された4輪メッシュの自動象限分割設定 */
  splitMergedWheelMeshes?: MergedWheelSplitConfig;
  /** ステアリングホイール独立ノード名（未分離の場合は空文字） */
  steeringWheelNodeName: string;
  /** ステアリングホイールの最大回転角倍率（前輪ステア角に対する比） */
  steeringWheelRatio: number;
  /**
   * 5-B2: 正規化・バウンディングボックス計測前にモデルから除外・破棄する不要ノード名一覧
   * （例: GLB 内蔵の平面ベイク影プレーン等）。
   */
  excludeNodeNames?: readonly string[];
  /**
   * 5-B2: 細いアンテナ等で BBox 高さが実車体より高く膨らむ場合の車体ルーフ実効高さ (m)。
   * エンジン煙・炎上位置・擦り傷パッチ・前方 SpotLight 高さの基準に使用する。
   */
  bodyHeightOverrideMeters?: number;
  /** 5-B2: 車種固有のヘッドライト・テールランプ精密配置レイアウト */
  lightLayout?: VehicleLightLayout;
}

/**
 * 作業ID 2-A / 2-C: 1台目の運転可能車両（主役車両: Toyota Kijang Innova 2.0 G）。
 * - 2-C にて最高速を約 110 km/h (30.6 m/s) へ引き上げ、加速・制動・高速ステア安定性を調整。
 */
export const HERO_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'hero_vehicle_innova',
  type: 'car',
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
    coastDrag: 0.72,
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
 * 作業ID 2-C / 5-B2: 2台目の運転可能車両（スポーツカー: 1975 Porsche 911 930 Turbo）。
 * - 既存の静的配置（x: -4.2, z: -22, rotationY: Math.PI, 全長 4.3m）を多重配置せずそのまま運転車両化。
 * - 最高速 約 160 km/h (44.5 m/s)・加速強化仕様・4輪独立回転＆前輪ステアリング対応。
 * - 元モデルの前輪ノードは初期状態で約 -18.5° (-0.3236 rad) ステアしているため、直進補正角 (+0.3236 rad) を適用。
 * - 5-B2 修正: GLB 内蔵の平面ベイク影プレーン（Plane.015_62 / Object_140）が全長 BBox を 22% 膨らませ、
 *   車体前後へ不自然な影シートとライト用箱メッシュが飛び出していた不具合を解消。
 *   あわせて丸型フロントレンズ・曲面リアテール位置へ精密配置（昼消灯時は GLB 本来のレンズを表示）。
 */
export const SPORTS_CAR_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'veh_porsche_north',
  type: 'car',
  assetId: 'free_1975_porsche_911_930_turbo',
  displayName: 'Porsche 911 Turbo',
  url: './assets/vehicles/free_1975_porsche_911_930_turbo.glb',
  targetLengthMeters: 4.3,
  modelForwardCorrectionY: 0,
  initialPosition: { x: -4.2, z: -22.0 },
  initialRotationY: Math.PI,
  colliderShrink: 0.92,
  placeholderDimensions: { width: 1.91, height: 1.27, length: 4.3 },
  castShadow: false,
  audioProfile: 'sports',
  excludeNodeNames: ['Plane.015_62', 'Object_140'],
  bodyHeightOverrideMeters: 1.27,
  lightLayout: {
    frontShape: 'round',
    frontOffset: { x: 0.639, y: 0.633, z: 1.855 },
    frontSize: { width: 0.176, height: 0.176, depth: 0.024 },
    frontTiltX: -0.32,
    frontHaloOffsetZ: 0.09,
    frontHaloScale: [0.88, 0.78],
    rearOffset: { x: 0.49, y: 0.53, z: -1.964 },
    rearSize: { width: 0.28, height: 0.068, depth: 0.024 },
    rearYaw: 0.12,
    rearHaloOffsetZ: -0.07,
    rearHaloScale: [0.72, 0.44],
    hideMeshWhenOff: true,
  },
  handling: {
    maxForwardSpeed: 44.5, // ~160 km/h
    maxReverseSpeed: 8.5, // ~30 km/h
    accelRate: 20.0,
    reverseAccel: 7.5,
    brakeDecel: 32.0,
    handbrakeDecel: 44.0,
    coastDrag: 0.88,
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

/**
 * 3台目の運転可能車両（街区南側路肩に配置済みだったオートバイ: Harley Custom Bike v1.2）。
 * - 既存の静的配置（x: 4.75, z: 14, rotationY: Math.PI / 6, 全長 2.3m）を多重配置せずそのまま運転車両化。
 * - 元モデルは -Z がフロント/ハンドル側のため modelForwardCorrectionY = Math.PI で +Z 正面へ正規化し、
 *   initialRotationY = -5 * Math.PI / 6（Math.PI / 6 + Math.PI）で元配置と同一の見た目の向きを維持。
 * - GLB 内部はテクスチャアトラス単位（5メッシュ）で結合されておりホイール・ハンドルの独立ノードはないため、
 *   車体バンク（カーブ内側へのロール傾き）演出と搭乗プレイヤーの跨がり姿勢連動でバイク走行を表現。
 */
export const BIKE_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'veh_harley_bike',
  type: 'bike',
  assetId: 'harley_custom_bike_v1.2',
  displayName: 'Harley Custom Bike',
  url: './assets/vehicles/harley_custom_bike_v1.2.glb',
  targetLengthMeters: 2.3,
  modelForwardCorrectionY: Math.PI,
  initialPosition: { x: 4.75, z: 14.0 },
  initialRotationY: (-5 * Math.PI) / 6,
  colliderShrink: 0.76,
  placeholderDimensions: { width: 0.95, height: 1.18, length: 2.3 },
  castShadow: true,
  audioProfile: 'bike',
  handling: {
    maxForwardSpeed: 37.5, // ~135 km/h
    maxReverseSpeed: 3.5, // ~12.6 km/h（足漕ぎ後退）
    accelRate: 17.5,
    reverseAccel: 4.5,
    brakeDecel: 28.0,
    handbrakeDecel: 38.0,
    coastDrag: 0.78,
    maxSteerAngle: 0.64,
    minHighSpeedSteer: 0.16,
    steerResponseSpeed: 11.5,
    wheelbaseMeters: 1.67,
  },
  lean: {
    maxRollRad: 0.45, // 約 26° カーブ内側へバンク
    speedRefMs: 14.0, // 約 50 km/h でフルバンク域へ到達
    responseRate: 7.5,
  },
  riderMount: {
    offsetY: 0.34, // Driving 姿勢の Hips(0.46m) をバイクシート座面(~0.74m)へ自然に合わせる高さ
    offsetZ: -0.34, // シート中心位置（+Z が前方、ハンドルは Z≈+0.35m）
    forwardLeanRad: 0.14, // 約 8° の軽度前傾姿勢
    animationName: 'Driving',
  },
  wheels: {
    frontLeft: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: true },
    frontRight: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: true },
    rearLeft: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: false },
    rearRight: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: false },
  },
  steeringWheelNodeName: '',
  steeringWheelRatio: 0,
};

/**
 * 作業ID 5-Fix2: 4台目の運転可能車両（レーシング・スーパーカー: 2008 Mazda Furai）。
 * - 東側車道路肩に静的配置されていた veh_mazda_furai_east（x: 18, z: 4.35, rotationY: -Math.PI/2, 全長 4.6m）を
 *   同一位置・同一向きのまま運転可能スーパーカーとして統合（castShadow: false でシャドウ負荷増ゼロ）。
 * - GLB バイナリ精密検査の結果、不要な地面ベイク影プレーンはなく +Z 正面・実寸 1.95m×1.07m×4.60m・Y=0 厳密接地。
 * - GLB 内はマテリアル単位で4輪（タイヤ・リム・スポーク・ローター・キャリパー）が結合されていたため、
 *   splitMergedWheelMeshes によるロード時象限コンパクト分割で4輪独立回転＋前輪ステア＆キャリパー追従を実現。
 * - ポルシェ911を上回る最高速 約 178 km/h (49.5 m/s)・鋭い加速/ブレーキング・レーシングステア応答・
 *   3ローター系高回転エンジン音（audioProfile: 'supercar'）・GLB 内蔵 LED レンズ同期ライト（hideMeshWhenOff）を搭載。
 */
export const SUPERCAR_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'veh_mazda_furai_east',
  type: 'car',
  assetId: '2008__mazda_furai',
  displayName: 'Mazda Furai',
  url: './assets/vehicles/2008__mazda_furai.glb',
  targetLengthMeters: 4.6,
  modelForwardCorrectionY: 0,
  initialPosition: { x: 18.0, z: 4.35 },
  initialRotationY: -Math.PI / 2,
  colliderShrink: 0.92,
  placeholderDimensions: { width: 1.95, height: 1.07, length: 4.6 },
  castShadow: false,
  audioProfile: 'supercar',
  lightLayout: {
    frontShape: 'box',
    // Object_34 (detail_glass_clear) 実測レンズポッド中心 (±0.774, 0.553, 1.691) に合わせて傾斜フィット
    frontOffset: { x: 0.76, y: 0.545, z: 1.715 },
    frontSize: { width: 0.14, height: 0.055, depth: 0.02 },
    frontTiltX: -0.58,
    frontYaw: 0.34,
    frontHaloOffsetZ: 0.12,
    frontHaloScale: [0.96, 0.72],
    // Object_53 (tail_light_lod0) 実測テールブレード帯 (±0.19..±0.78, y=0.45..0.55, z=-2.08..-1.91) に密着
    rearOffset: { x: 0.5, y: 0.485, z: -2.015 },
    rearSize: { width: 0.36, height: 0.048, depth: 0.02 },
    rearYaw: 0.16,
    rearHaloOffsetZ: -0.09,
    rearHaloScale: [0.92, 0.48],
    hideMeshWhenOff: true,
    nativeFrontMaterialNames: ['head_light'],
    nativeRearMaterialNames: ['tail_light_lod0', 'reflector'],
  },
  handling: {
    maxForwardSpeed: 49.5, // ~178 km/h
    maxReverseSpeed: 9.5, // ~34 km/h
    accelRate: 24.5,
    reverseAccel: 8.5,
    brakeDecel: 37.0,
    handbrakeDecel: 50.0,
    coastDrag: 0.95,
    maxSteerAngle: 0.58,
    minHighSpeedSteer: 0.105,
    steerResponseSpeed: 12.5,
    wheelbaseMeters: 2.77,
  },
  wheels: {
    frontLeft: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: true },
    frontRight: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: true },
    rearLeft: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: false },
    rearRight: { spinNodeNames: [], steerOnlyNodeNames: [], steerable: false },
  },
  splitMergedWheelMeshes: {
    spinMeshNames: [
      'Object_52', // tyre_fx (4輪タイヤ)
      'Object_41', // inner_rim (4輪インナーリム)
      'Object_43', // outer_rim (4輪アウターリム)
      'Object_50', // material_42 (左側スポーク FL/RL)
      'Object_51', // material_42 (右側スポーク FR/RR)
      'Object_54', // wheel_black (4輪ホイールトリム)
      'Object_55', // rotor (4輪ブレーキローター)
      'Object_37', // material (ローターセンターハット FL/RR)
    ],
    steerOnlyMeshNames: [
      'Object_31', // caliper (4輪ブレーキキャリパー: 前輪はステア追従・非回転)
      'Object_28', // badge (4輪キャリパーロゴ)
    ],
  },
  steeringWheelNodeName: '',
  steeringWheelRatio: 0,
};

/** 運転可能な全車両リスト（乗用車・ポルシェ911・バイク・マツダ風籟の計4台） */
export const DRIVABLE_VEHICLES: readonly HeroVehicleConfig[] = [
  HERO_VEHICLE_CONFIG,
  SPORTS_CAR_VEHICLE_CONFIG,
  BIKE_VEHICLE_CONFIG,
  SUPERCAR_VEHICLE_CONFIG,
];
