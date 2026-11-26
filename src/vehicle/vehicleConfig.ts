export type WheelSlot = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export interface WheelNodeBinding {
  /** 車輪の回転（spin）および前輪ステアリングに追従するノード名（タイヤ・リム・ブレーキディスク等） */
  spinNodeNames: readonly string[];
  /** 前輪ステアリングのみに追従し回転しないノード名（ブレーキキャリパー等） */
  steerOnlyNodeNames: readonly string[];
  /** ステアリング対象か（前輪のみ true） */
  steerable: boolean;
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
  /** 目標全長 (m) — 乗用車の現実的スケール (4.4〜4.8m) */
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
  /** 4輪の独立ノード定義 */
  wheels: Record<WheelSlot, WheelNodeBinding>;
  /** ステアリングホイール独立ノード名 */
  steeringWheelNodeName: string;
  /** ステアリングホイールの最大回転角倍率（前輪ステア角に対する比） */
  steeringWheelRatio: number;
}

/**
 * 作業ID 2-A: 運転可能な主役車両（1台）の定義。
 * - 選定理由: 承認済み(CC-BY-4.0)の実車乗用車の中で、日本の街並みに合うトヨタ製右ハンドル車であり、
 *   90,503 tri / 6.5MB と M1 iPad Air 向けに品質と軽量性を両立。
 *   さらに4輪すべて（タイヤ・リム・ブレーキディスク/キャリパー）およびステアリング(stir)が
 *   独立ノードとして分離されており、2-B の車輪回転・ステアリングにそのまま利用可能。
 * - 配置位置: プレイヤー初期スポーン (0, 0, 0) / 正面 +Z から見やすい前方車道上、
 *   日本の左側通行車線（+Z 進行時の左車線 = X = +3.0m, Z = +8.5m）へ正面向き(+Z)・Y=0接地で配置。
 */
export const HERO_VEHICLE_CONFIG: HeroVehicleConfig = {
  id: 'hero_vehicle_innova',
  assetId: '2011_-_13_toyota_kijang_innova_2.0_g_tgn40',
  displayName: 'Toyota Kijang Innova 2.0 G',
  url: './assets/vehicles/2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb',
  targetLengthMeters: 4.6,
  modelForwardCorrectionY: Math.PI,
  initialPosition: { x: 3.0, z: 8.5 },
  initialRotationY: 0,
  colliderShrink: 0.92,
  placeholderDimensions: { width: 1.89, height: 1.74, length: 4.6 },
  castShadow: true,
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
