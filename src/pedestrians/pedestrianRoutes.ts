import type { TrafficAxis } from '../traffic/trafficLights';

export interface PedestrianWaypoint {
  x: number;
  z: number;
  /** このウェイポイントから次のウェイポイントへ向かう区間が横断歩道の場合、連動する信号軸 */
  nextCrosswalkAxis?: TrafficAxis;
}

export interface PedestrianConfig {
  id: string;
  /** 巡航歩行速度 (m/s) — 約 4.1〜4.9 km/h (1.15〜1.36 m/s) */
  walkSpeedMs: number;
  /** 身長 (m) */
  heightMeters: number;
  /** 衣装の自然な色調バリエーション (乗算ティント RGB) */
  tintHex: number;
  /** 初期ウェイポイントインデックス */
  startWaypointIndex: number;
  /** アニメーション初期位相オフセット (秒) */
  animPhaseOffsetSec: number;
  /** 歩道・横断歩道の巡回ループウェイポイント */
  waypoints: readonly PedestrianWaypoint[];
}

/**
 * 3-B: 街区の歩道（±7.2m〜±9.4m）および 4 方向横断歩道（±8.4m）を往来・周回する 6 人の AI 歩行者定義。
 * - 信号支柱 (±6.7, ±6.7) や歩道小物（自販機・犬）を避けた自然な歩道レーンを通行。
 * - 横断歩道の進入手前ウェイポイントに nextCrosswalkAxis を設定し、青信号のときのみ横断開始。
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
];
