import type { WheelNodeBinding, WheelSlot } from '../vehicle/vehicleConfig';

export interface TrafficVehicleConfig {
  /** コライダー・識別用固有 ID */
  id: string;
  /** docs/ASSET_MANIFEST.json の assetId */
  assetId: string;
  /** 表示用名称 */
  displayName: string;
  /** public/ からの相対 URL */
  url: string;
  /** 目標全長 (m) */
  targetLengthMeters: number;
  /** 元モデルの前方を +Z へ揃えるための Y 軸補正角 (rad) */
  modelForwardCorrectionY: number;
  /** 巡航速度 (m/s) — 約 30〜40 km/h (8.3〜11.1 m/s) */
  cruiseSpeedMs: number;
  /** 初期配置セグメント ID */
  startSegmentId: string;
  /** 初期セグメント上の開始距離 (m) */
  startDistance: number;
  /** 交差点での進行方向選択パターン (0=直進, 1=左折, 2=右折) */
  turnPattern: readonly number[];
  /** コリジョンボックス縮小率 */
  colliderShrink: number;
  /** ロード完了前の暫定寸法 (m) */
  placeholderDimensions: { width: number; height: number; length: number };
  /** リアルタイムシャドウ投影の有無 (M1 iPad Air 最適化: AI車両は false で軽量化) */
  castShadow: boolean;
  /** 4輪の独立ノード定義 */
  wheels: Record<WheelSlot, WheelNodeBinding>;
}

const INNOVA_WHEELS: Record<WheelSlot, WheelNodeBinding> = {
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
};

const THUNDERBOLT_WHEELS: Record<WheelSlot, WheelNodeBinding> = {
  frontLeft: {
    spinNodeNames: ['Thunderbolt96_WheelStock_FL'],
    steerOnlyNodeNames: ['Thunderbolt96_CaliperStock_FL'],
    steerable: true,
  },
  frontRight: {
    spinNodeNames: ['Thunderbolt96_WheelStock_FR'],
    steerOnlyNodeNames: ['Thunderbolt96_CaliperStock_FR'],
    steerable: true,
  },
  rearLeft: {
    spinNodeNames: ['Thunderbolt96_WheelStock_RL'],
    steerOnlyNodeNames: [],
    steerable: false,
  },
  rearRight: {
    spinNodeNames: ['Thunderbolt96_WheelStock_RR'],
    steerOnlyNodeNames: [],
    steerable: false,
  },
};

/**
 * 3-A: 承認済み実車 GLB を用いた 4 台の一般 AI 交通車両定義。
 * - Toyota Kijang Innova 2.0 G × 2台 + Thunderbolt 96 Interceptor × 2台
 * - 全車 4 輪独立回転＆前輪ステアリング対応、約 32〜38 km/h で左側通行自動走行。
 * - 同一 GLB はテンプレートキャッシュからクローンし、M1 iPad Air のメモリ消費を抑制。
 */
export const TRAFFIC_VEHICLE_CONFIGS: readonly TrafficVehicleConfig[] = [
  {
    id: 'traffic_ai_innova_north',
    assetId: '2011_-_13_toyota_kijang_innova_2.0_g_tgn40',
    displayName: 'Traffic Innova #1',
    url: './assets/vehicles/2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb',
    targetLengthMeters: 4.6,
    modelForwardCorrectionY: Math.PI,
    cruiseSpeedMs: 9.4, // ~34 km/h
    startSegmentId: 'N_IN',
    startDistance: 28.0,
    turnPattern: [0, 1, 0, 2],
    colliderShrink: 0.92,
    placeholderDimensions: { width: 1.89, height: 1.74, length: 4.6 },
    castShadow: false,
    wheels: INNOVA_WHEELS,
  },
  {
    id: 'traffic_ai_sedan_south',
    assetId: 'thunderbolt_96_interceptor_-_low_poly_model',
    displayName: 'Traffic Sedan #1',
    url: './assets/vehicles/thunderbolt_96_interceptor_-_low_poly_model.glb',
    targetLengthMeters: 4.7,
    modelForwardCorrectionY: -Math.PI / 2,
    cruiseSpeedMs: 10.0, // ~36 km/h
    startSegmentId: 'S_IN',
    startDistance: 26.0,
    turnPattern: [1, 0, 2, 0],
    colliderShrink: 0.92,
    placeholderDimensions: { width: 1.95, height: 1.5, length: 4.7 },
    castShadow: false,
    wheels: THUNDERBOLT_WHEELS,
  },
  {
    id: 'traffic_ai_innova_west',
    assetId: '2011_-_13_toyota_kijang_innova_2.0_g_tgn40',
    displayName: 'Traffic Innova #2',
    url: './assets/vehicles/2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb',
    targetLengthMeters: 4.6,
    modelForwardCorrectionY: Math.PI,
    cruiseSpeedMs: 8.9, // ~32 km/h
    startSegmentId: 'W_IN',
    startDistance: 20.0,
    turnPattern: [2, 0, 1, 0],
    colliderShrink: 0.92,
    placeholderDimensions: { width: 1.89, height: 1.74, length: 4.6 },
    castShadow: false,
    wheels: INNOVA_WHEELS,
  },
  {
    id: 'traffic_ai_sedan_east',
    assetId: 'thunderbolt_96_interceptor_-_low_poly_model',
    displayName: 'Traffic Sedan #2',
    url: './assets/vehicles/thunderbolt_96_interceptor_-_low_poly_model.glb',
    targetLengthMeters: 4.7,
    modelForwardCorrectionY: -Math.PI / 2,
    cruiseSpeedMs: 10.5, // ~38 km/h
    startSegmentId: 'E_IN',
    startDistance: 18.0,
    turnPattern: [0, 2, 1, 0],
    colliderShrink: 0.92,
    placeholderDimensions: { width: 1.95, height: 1.5, length: 4.7 },
    castShadow: false,
    wheels: THUNDERBOLT_WHEELS,
  },
];
