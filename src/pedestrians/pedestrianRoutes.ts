import type { TrafficAxis } from '../traffic/trafficLights';

export interface PedestrianWaypoint {
  x: number;
  z: number;
  /** このウェイポイントから次のウェイポイントへ向かう区間が横断歩道の場合、連動する信号軸 */
  nextCrosswalkAxis?: TrafficAxis;
}

export interface PedestrianAppearance {
  /** スタイル識別名 */
  label: string;
  /** トップス（上着・シャツ）カラー */
  topHex: number;
  /** ボトムス（ズボン）カラー */
  bottomHex: number;
  /** 髪色トーン */
  hairHex: number;
  /** 上着のカラー適用強度 (0..1) */
  topStrength: number;
  /** ボトムスのカラー適用強度 (0..1) */
  bottomStrength: number;
  /** 髪色のカラー適用強度 (0..1) */
  hairStrength: number;
}

export const PEDESTRIAN_MIN_HEIGHT_METERS = 1.55;
export const PEDESTRIAN_MAX_HEIGHT_METERS = 1.8;

/** 歩行者ごとの身長を 1.55m〜1.80m の範囲でランダム生成 */
export function pickRandomPedestrianHeight(): number {
  const raw =
    PEDESTRIAN_MIN_HEIGHT_METERS +
    Math.random() * (PEDESTRIAN_MAX_HEIGHT_METERS - PEDESTRIAN_MIN_HEIGHT_METERS);
  return Math.round(raw * 100) / 100;
}

/**
 * 3-C: クローン感を解消するための服装・髪色バリエーションパレット。
 * ビジネス風（紺・グレー系）およびカジュアル（白・青・ベージュ・赤系）＋髪色トーン変化。
 */
export const PEDESTRIAN_APPEARANCES: readonly PedestrianAppearance[] = [
  {
    label: 'business_navy',
    topHex: 0x1e3557, // ビジネス風ネイビー
    bottomHex: 0x1b2432, // ダークスラックス
    hairHex: 0x181412, // 黒髪
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.85,
  },
  {
    label: 'business_gray',
    topHex: 0x5c6470, // ビジネス風チャコールグレー
    bottomHex: 0x2d333d, // チャコールパンツ
    hairHex: 0x3b2a20, // ダークブラウン
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'casual_white',
    topHex: 0xebe8e1, // カジュアル白（オフホワイト）
    bottomHex: 0x2d4a6e, // インディゴデニム
    hairHex: 0x5a3b26, // 栗色ブラウン
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'casual_blue',
    topHex: 0x2e6ba8, // カジュアルブルー
    bottomHex: 0xb7a082, // チノベージュ
    hairHex: 0x241d18, // 暗めナチュラルブラック
    topStrength: 0.92,
    bottomStrength: 0.88,
    hairStrength: 0.84,
  },
  {
    label: 'casual_beige',
    topHex: 0xcab393, // カジュアルベージュ
    bottomHex: 0x2a313c, // ダークネイビーパンツ
    hairHex: 0x6b4b32, // 明るめブラウン
    topStrength: 0.9,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'casual_red',
    topHex: 0xa83232, // カジュアル赤（落ち着いたワイン/ブリックレッド）
    bottomHex: 0x2c3038, // チャコールデニム
    hairHex: 0x45342a, // アッシュブラウン
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
];

export interface PedestrianConfig {
  id: string;
  /** 巡航歩行速度 (m/s) — 約 4.1〜4.9 km/h (1.15〜1.36 m/s) */
  walkSpeedMs: number;
  /** 基準身長 (m) — 実際はスポーン時に 1.55m〜1.80m でランダム決定 */
  heightMeters: number;
  /** 衣装の基本乗算ティント RGB（フォールバック用） */
  tintHex: number;
  /** 初期ウェイポイントインデックス */
  startWaypointIndex: number;
  /** アニメーション初期位相オフセット (秒) */
  animPhaseOffsetSec: number;
  /** 歩道・横断歩道の巡回ループウェイポイント */
  waypoints: readonly PedestrianWaypoint[];
}

/**
 * 3-B / 4-B: 街区の歩道（±7.2m〜±9.5m）および 4 方向横断歩道（±8.4m）を往来・周回する 8 人の AI 歩行者定義。
 * - 信号支柱 (±6.7, ±6.7) や歩道小物（自販機・犬・ガードレール）を避けた安全な歩道レーンを通行。
 * - 横断歩道の進入手前ウェイポイントに nextCrosswalkAxis を設定し、青信号のときのみ横断開始。
 * - 4-B では 8 種の CC0 人物モデル（男女・スーツ・カジュアル・シニア・作業着）＋大人/子供体型・3Dパーツを全員へ割り当て。
 */
export const PEDESTRIAN_CONFIGS: readonly PedestrianConfig[] = [
  {
    // 1. 交差点4辺の横断歩道を時計回りに周回（NW -> NE -> SE -> SW）
    id: 'ped_loop_cw',
    walkSpeedMs: 1.28, // ~4.6 km/h
    heightMeters: 1.7,
    tintHex: 0xffffff,
    startWaypointIndex: 0,
    animPhaseOffsetSec: 0.0,
    waypoints: [
      { x: -9.3, z: -9.3 },
      { x: -7.1, z: -8.4, nextCrosswalkAxis: 'EW' }, // 北側横断歩道・西端
      { x: 7.1, z: -8.4 }, // 北側横断歩道・東端
      { x: 9.3, z: -9.3 },
      { x: 8.4, z: -7.1, nextCrosswalkAxis: 'NS' }, // 東側横断歩道・北端
      { x: 8.4, z: 7.1 }, // 東側横断歩道・南端
      { x: 9.3, z: 9.3 },
      { x: 7.1, z: 8.4, nextCrosswalkAxis: 'EW' }, // 南側横断歩道・東端
      { x: -7.1, z: 8.4 }, // 南側横断歩道・西端
      { x: -9.3, z: 9.3 },
      { x: -8.4, z: 7.1, nextCrosswalkAxis: 'NS' }, // 西側横断歩道・南端
      { x: -8.4, z: -7.1 }, // 西側横断歩道・北端
    ],
  },
  {
    // 2. 交差点4辺の横断歩道を反時計回りに周回（SE -> NE -> NW -> SW）
    id: 'ped_loop_ccw',
    walkSpeedMs: 1.18, // ~4.2 km/h
    heightMeters: 1.64,
    tintHex: 0xe6edf5,
    startWaypointIndex: 3,
    animPhaseOffsetSec: 0.35,
    waypoints: [
      { x: 9.3, z: 9.3 },
      { x: 8.4, z: 7.1, nextCrosswalkAxis: 'NS' }, // 東側横断歩道・南端
      { x: 8.4, z: -7.1 }, // 東側横断歩道・北端
      { x: 9.3, z: -9.3 },
      { x: 7.1, z: -8.4, nextCrosswalkAxis: 'EW' }, // 北側横断歩道・東端
      { x: -7.1, z: -8.4 }, // 北側横断歩道・西端
      { x: -9.3, z: -9.3 },
      { x: -8.4, z: -7.1, nextCrosswalkAxis: 'NS' }, // 西側横断歩道・北端
      { x: -8.4, z: 7.1 }, // 西側横断歩道・南端
      { x: -9.3, z: 9.3 },
      { x: -7.1, z: 8.4, nextCrosswalkAxis: 'EW' }, // 南側横断歩道・西端
      { x: 7.1, z: 8.4 }, // 南側横断歩道・東端
    ],
  },
  {
    // 3. 西側歩道を南北に往来（北西街区 〜 西側横断歩道 〜 南西街区）
    id: 'ped_west_ns',
    walkSpeedMs: 1.35, // ~4.9 km/h
    heightMeters: 1.74,
    tintHex: 0xf2e8dc,
    startWaypointIndex: 0,
    animPhaseOffsetSec: 0.62,
    waypoints: [
      { x: -9.5, z: -28.0 },
      { x: -9.5, z: -10.5 },
      { x: -8.4, z: -7.1, nextCrosswalkAxis: 'NS' },
      { x: -8.4, z: 7.1 },
      { x: -9.5, z: 10.5 },
      { x: -9.5, z: 28.0 },
      { x: -7.2, z: 28.0 },
      { x: -7.2, z: 10.5 },
      { x: -8.4, z: 7.1, nextCrosswalkAxis: 'NS' },
      { x: -8.4, z: -7.1 },
      { x: -7.2, z: -10.5 },
      { x: -7.2, z: -28.0 },
    ],
  },
  {
    // 4. 東側歩道を南北に往来（南東街区 〜 東側横断歩道 〜 北東街区）
    id: 'ped_east_ns',
    walkSpeedMs: 1.22, // ~4.4 km/h
    heightMeters: 1.67,
    tintHex: 0xdce8e0,
    startWaypointIndex: 0,
    animPhaseOffsetSec: 0.18,
    waypoints: [
      { x: 9.5, z: 26.0 },
      { x: 9.5, z: 10.5 },
      { x: 8.4, z: 7.1, nextCrosswalkAxis: 'NS' },
      { x: 8.4, z: -7.1 },
      { x: 9.5, z: -10.5 },
      { x: 9.5, z: -26.0 },
      { x: 7.2, z: -26.0 },
      { x: 7.2, z: -10.5 },
      { x: 8.4, z: -7.1, nextCrosswalkAxis: 'NS' },
      { x: 8.4, z: 7.1 },
      { x: 7.2, z: 10.5 },
      { x: 7.2, z: 26.0 },
    ],
  },
  {
    // 5. 北側歩道を東西に往来（北西街区 〜 北側横断歩道 〜 北東街区）
    id: 'ped_north_ew',
    walkSpeedMs: 1.3, // ~4.7 km/h
    heightMeters: 1.72,
    tintHex: 0xebe0ea,
    startWaypointIndex: 0,
    animPhaseOffsetSec: 0.51,
    waypoints: [
      { x: -28.0, z: -9.4 },
      { x: -10.5, z: -9.4 },
      { x: -7.1, z: -8.4, nextCrosswalkAxis: 'EW' },
      { x: 7.1, z: -8.4 },
      { x: 10.5, z: -9.4 },
      { x: 28.0, z: -9.4 },
      { x: 28.0, z: -7.2 },
      { x: 10.5, z: -7.2 },
      { x: 7.1, z: -8.4, nextCrosswalkAxis: 'EW' },
      { x: -7.1, z: -8.4 },
      { x: -10.5, z: -7.2 },
      { x: -28.0, z: -7.2 },
    ],
  },
  {
    // 6. 南側歩道を東西に往来（南東街区 〜 南側横断歩道 〜 南西街区）
    id: 'ped_south_ew',
    walkSpeedMs: 1.16, // ~4.2 km/h
    heightMeters: 1.65,
    tintHex: 0xf0e4d8,
    startWaypointIndex: 0,
    animPhaseOffsetSec: 0.78,
    waypoints: [
      { x: 26.0, z: 9.4 },
      { x: 10.5, z: 9.4 },
      { x: 7.1, z: 8.4, nextCrosswalkAxis: 'EW' },
      { x: -7.1, z: 8.4 },
      { x: -10.5, z: 9.4 },
      { x: -26.0, z: 9.4 },
      { x: -26.0, z: 7.2 },
      { x: -10.5, z: 7.2 },
      { x: -7.1, z: 8.4, nextCrosswalkAxis: 'EW' },
      { x: 7.1, z: 8.4 },
      { x: 10.5, z: 7.2 },
      { x: 26.0, z: 7.2 },
    ],
  },
  {
    // 7. 北西〜北東ロング歩道ルート（交差点北側を広めに往復）
    id: 'ped_north_promenade',
    walkSpeedMs: 1.24,
    heightMeters: 1.68,
    tintHex: 0xe8eff5,
    startWaypointIndex: 4,
    animPhaseOffsetSec: 0.27,
    waypoints: [
      { x: -46.0, z: -9.5 },
      { x: -10.5, z: -9.5 },
      { x: -7.1, z: -8.4, nextCrosswalkAxis: 'EW' },
      { x: 7.1, z: -8.4 },
      { x: 10.5, z: -9.5 },
      { x: 46.0, z: -9.5 },
      { x: 46.0, z: -7.3 },
      { x: 10.5, z: -7.3 },
      { x: 7.1, z: -8.4, nextCrosswalkAxis: 'EW' },
      { x: -7.1, z: -8.4 },
      { x: -10.5, z: -7.3 },
      { x: -46.0, z: -7.3 },
    ],
  },
  {
    // 8. 南西〜南東ロング歩道ルート（交差点南側・プレイヤー初期視界近くを往復）
    id: 'ped_south_promenade',
    walkSpeedMs: 1.32,
    heightMeters: 1.66,
    tintHex: 0xf5ece4,
    startWaypointIndex: 4,
    animPhaseOffsetSec: 0.91,
    waypoints: [
      { x: 44.0, z: 9.5 },
      { x: 10.5, z: 9.5 },
      { x: 7.1, z: 8.4, nextCrosswalkAxis: 'EW' },
      { x: -7.1, z: 8.4 },
      { x: -10.5, z: 9.5 },
      { x: -44.0, z: 9.5 },
      { x: -44.0, z: 7.3 },
      { x: -10.5, z: 7.3 },
      { x: -7.1, z: 8.4, nextCrosswalkAxis: 'EW' },
      { x: 7.1, z: 8.4 },
      { x: 10.5, z: 7.3 },
      { x: 44.0, z: 7.3 },
    ],
  },
];
