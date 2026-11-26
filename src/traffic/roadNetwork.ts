export interface RoadPoint {
  x: number;
  z: number;
}

export interface RoadSample {
  x: number;
  z: number;
  yaw: number;
  /** カーブ・折り返し時の巡航速度倍率 (0..1) */
  speedFactor: number;
}

export type RoadSegmentKind = 'straight' | 'intersection' | 'uturn';

export interface RoadSegment {
  id: string;
  kind: RoadSegmentKind;
  points: readonly RoadPoint[];
  cumLengths: readonly number[];
  totalLength: number;
  /** 巡航速度に対する推奨倍率 */
  speedFactor: number;
  /** 終端到達時に接続可能な次セグメント ID 一覧 */
  nextIds: readonly string[];
}

/**
 * 日本の左側通行（車道幅 12m: 片側 6m のうち中央線寄り内側車線）の基準定数。
 * - 南向き (+Z): x = +1.65
 * - 北向き (-Z): x = -1.65
 * - 東向き (+X): z = -1.65
 * - 西向き (-X): z = +1.65
 */
export const TRAFFIC_ROAD_METRICS = {
  laneOffset: 1.65,
  intersectionEdge: 8.5,
  roadEnd: 68.0,
  uturnRadius: 3.6,
} as const;

const L = TRAFFIC_ROAD_METRICS.laneOffset;
const E = TRAFFIC_ROAD_METRICS.intersectionEdge;
const R = TRAFFIC_ROAD_METRICS.roadEnd;

function buildStraightPoints(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  steps: number,
): RoadPoint[] {
  const pts: RoadPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push({
      x: x0 + (x1 - x0) * t,
      z: z0 + (z1 - z0) * t,
    });
  }
  return pts;
}

function buildQuadBezierPoints(
  x0: number,
  z0: number,
  cx: number,
  cz: number,
  x1: number,
  z1: number,
  steps: number,
): RoadPoint[] {
  const pts: RoadPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const inv = 1 - t;
    pts.push({
      x: inv * inv * x0 + 2 * inv * t * cx + t * t * x1,
      z: inv * inv * z0 + 2 * inv * t * cz + t * t * z1,
    });
  }
  return pts;
}

/**
 * 道路端（街区外周付近）で左側通行のまま反対車線へ滑らかに折り返す半円アークを生成する。
 */
function buildUturnPoints(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  outDirX: number,
  outDirZ: number,
  bulge: number,
  steps: number,
): RoadPoint[] {
  const pts: RoadPoint[] = [];
  const midX = (startX + endX) * 0.5;
  const midZ = (startZ + endZ) * 0.5;
  const halfSpanX = (startX - endX) * 0.5;
  const halfSpanZ = (startZ - endZ) * 0.5;

  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    pts.push({
      x: midX + halfSpanX * cosT + outDirX * bulge * sinT,
      z: midZ + halfSpanZ * cosT + outDirZ * bulge * sinT,
    });
  }
  return pts;
}

function createSegment(
  id: string,
  kind: RoadSegmentKind,
  points: RoadPoint[],
  speedFactor: number,
  nextIds: readonly string[],
): RoadSegment {
  const cumLengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    total += Math.hypot(dx, dz);
    cumLengths.push(total);
  }
  return {
    id,
    kind,
    points,
    cumLengths,
    totalLength: total,
    speedFactor,
    nextIds,
  };
}

/**
 * 3-A: 160m四方の日本の十字路街区に対応した左側通行道路ネットワークを構築する。
 * - 8本の直線レーン（南北・東西の各進入/退出）
 * - 12本の交差点接続パス（直進・左折・右折）
 * - 4本の道路端折り返しループ
 */
export function createJapaneseRoadNetwork(): Map<string, RoadSegment> {
  const segments = new Map<string, RoadSegment>();
  const add = (seg: RoadSegment) => {
    segments.set(seg.id, seg);
  };

  // =========================================================================
  // 1. 直線進入レーン（道路端 -> 中央交差点手前）
  // =========================================================================
  // 北から南下 (+Z, 左側 = +X)
  add(
    createSegment(
      'N_IN',
      'straight',
      buildStraightPoints(L, -R, L, -E, 16),
      1.0,
      ['X_N_STRAIGHT', 'X_N_LEFT', 'X_N_RIGHT'],
    ),
  );
  // 南から北上 (-Z, 左側 = -X)
  add(
    createSegment(
      'S_IN',
      'straight',
      buildStraightPoints(-L, R, -L, E, 16),
      1.0,
      ['X_S_STRAIGHT', 'X_S_LEFT', 'X_S_RIGHT'],
    ),
  );
  // 西から東進 (+X, 左側 = -Z)
  add(
    createSegment(
      'W_IN',
      'straight',
      buildStraightPoints(-R, -L, -E, -L, 16),
      1.0,
      ['X_W_STRAIGHT', 'X_W_LEFT', 'X_W_RIGHT'],
    ),
  );
  // 東から西進 (-X, 左側 = +Z)
  add(
    createSegment(
      'E_IN',
      'straight',
      buildStraightPoints(R, L, E, L, 16),
      1.0,
      ['X_E_STRAIGHT', 'X_E_LEFT', 'X_E_RIGHT'],
    ),
  );

  // =========================================================================
  // 2. 直線退出レーン（中央交差点先 -> 道路端）
  // =========================================================================
  add(
    createSegment(
      'S_OUT',
      'straight',
      buildStraightPoints(L, E, L, R, 16),
      1.0,
      ['S_UTURN'],
    ),
  );
  add(
    createSegment(
      'N_OUT',
      'straight',
      buildStraightPoints(-L, -E, -L, -R, 16),
      1.0,
      ['N_UTURN'],
    ),
  );
  add(
    createSegment(
      'E_OUT',
      'straight',
      buildStraightPoints(E, -L, R, -L, 16),
      1.0,
      ['E_UTURN'],
    ),
  );
  add(
    createSegment(
      'W_OUT',
      'straight',
      buildStraightPoints(-E, L, -R, L, 16),
      1.0,
      ['W_UTURN'],
    ),
  );

  // =========================================================================
  // 3. 中央交差点パス（日本の左側通行での直進・小回り左折・大回り右折）
  // =========================================================================
  // 北進入 (L, -E) -> 南直進 / 東左折 / 西右折
  add(
    createSegment(
      'X_N_STRAIGHT',
      'intersection',
      buildStraightPoints(L, -E, L, E, 10),
      0.88,
      ['S_OUT'],
    ),
  );
  add(
    createSegment(
      'X_N_LEFT',
      'intersection',
      buildQuadBezierPoints(L, -E, L, -L, E, -L, 14),
      0.56,
      ['E_OUT'],
    ),
  );
  add(
    createSegment(
      'X_N_RIGHT',
      'intersection',
      buildQuadBezierPoints(L, -E, L, L, -E, L, 16),
      0.58,
      ['W_OUT'],
    ),
  );

  // 南進入 (-L, E) -> 北直進 / 西左折 / 東右折
  add(
    createSegment(
      'X_S_STRAIGHT',
      'intersection',
      buildStraightPoints(-L, E, -L, -E, 10),
      0.88,
      ['N_OUT'],
    ),
  );
  add(
    createSegment(
      'X_S_LEFT',
      'intersection',
      buildQuadBezierPoints(-L, E, -L, L, -E, L, 14),
      0.56,
      ['W_OUT'],
    ),
  );
  add(
    createSegment(
      'X_S_RIGHT',
      'intersection',
      buildQuadBezierPoints(-L, E, -L, -L, E, -L, 16),
      0.58,
      ['E_OUT'],
    ),
  );

  // 西進入 (-E, -L) -> 東直進 / 北左折 / 南右折
  add(
    createSegment(
      'X_W_STRAIGHT',
      'intersection',
      buildStraightPoints(-E, -L, E, -L, 10),
      0.88,
      ['E_OUT'],
    ),
  );
  add(
    createSegment(
      'X_W_LEFT',
      'intersection',
      buildQuadBezierPoints(-E, -L, -L, -L, -L, -E, 14),
      0.56,
      ['N_OUT'],
    ),
  );
  add(
    createSegment(
      'X_W_RIGHT',
      'intersection',
      buildQuadBezierPoints(-E, -L, L, -L, L, E, 16),
      0.58,
      ['S_OUT'],
    ),
  );

  // 東進入 (E, L) -> 西直進 / 南左折 / 北右折
  add(
    createSegment(
      'X_E_STRAIGHT',
      'intersection',
      buildStraightPoints(E, L, -E, L, 10),
      0.88,
      ['W_OUT'],
    ),
  );
  add(
    createSegment(
      'X_E_LEFT',
      'intersection',
      buildQuadBezierPoints(E, L, L, L, L, E, 14),
      0.56,
      ['S_OUT'],
    ),
  );
  add(
    createSegment(
      'X_E_RIGHT',
      'intersection',
      buildQuadBezierPoints(E, L, -L, L, -L, -E, 16),
      0.58,
      ['N_OUT'],
    ),
  );

  // =========================================================================
  // 4. 道路端折り返しループ（街区端 ±68m 〜 ±71.6m の車道内で反対レーンへ復帰）
  // =========================================================================
  const bulge = TRAFFIC_ROAD_METRICS.uturnRadius;
  add(
    createSegment(
      'S_UTURN',
      'uturn',
      buildUturnPoints(L, R, -L, R, 0, 1, bulge, 16),
      0.42,
      ['S_IN'],
    ),
  );
  add(
    createSegment(
      'N_UTURN',
      'uturn',
      buildUturnPoints(-L, -R, L, -R, 0, -1, bulge, 16),
      0.42,
      ['N_IN'],
    ),
  );
  add(
    createSegment(
      'E_UTURN',
      'uturn',
      buildUturnPoints(R, -L, R, L, 1, 0, bulge, 16),
      0.42,
      ['E_IN'],
    ),
  );
  add(
    createSegment(
      'W_UTURN',
      'uturn',
      buildUturnPoints(-R, L, -R, -L, -1, 0, bulge, 16),
      0.42,
      ['W_IN'],
    ),
  );

  return segments;
}

/**
 * セグメント上の距離 s (0..totalLength) における位置・向き・速度倍率をサンプリングする。
 */
export function sampleRoadSegment(
  segment: RoadSegment,
  distance: number,
  out: RoadSample,
): RoadSample {
  const clamped = Math.max(0, Math.min(segment.totalLength, distance));
  const { points, cumLengths } = segment;
  const lastIdx = points.length - 1;

  let idx = 0;
  while (idx < lastIdx - 1 && cumLengths[idx + 1] < clamped) {
    idx += 1;
  }

  const segStart = cumLengths[idx];
  const segEnd = cumLengths[idx + 1];
  const segLen = Math.max(1e-5, segEnd - segStart);
  const t = Math.max(0, Math.min(1, (clamped - segStart) / segLen));

  const p0 = points[idx];
  const p1 = points[idx + 1];
  out.x = p0.x + (p1.x - p0.x) * t;
  out.z = p0.z + (p1.z - p0.z) * t;
  out.yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  out.speedFactor = segment.speedFactor;
  return out;
}
