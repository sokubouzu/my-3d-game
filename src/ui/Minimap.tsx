import { useEffect, useRef } from 'react';
import { CITY_METRICS } from '../world/collisionWorld';

export interface MinimapVehiclePoint {
  id: string;
  x: number;
  z: number;
  yaw: number;
  isActive: boolean;
  isWrecked?: boolean;
  isBurning?: boolean;
}

export interface MinimapCoinPoint {
  x: number;
  z: number;
}

export interface MinimapGateTarget {
  active: boolean;
  x: number;
  z: number;
  kind: 'start' | 'checkpoint' | 'goal';
}

export interface MinimapSnapshot {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  cameraYaw: number;
  isDriving: boolean;
  drivableCount: number;
  drivableVehicles: MinimapVehiclePoint[];
  trafficCount: number;
  trafficVehicles: MinimapVehiclePoint[];
  coinCount: number;
  coins: MinimapCoinPoint[];
  timeAttackActive: boolean;
  targetGate: MinimapGateTarget;
}

export interface MinimapProps {
  getSnapshot: (out: MinimapSnapshot) => void;
}

const MINIMAP_SIZE_PX = 140;
const MINIMAP_HALF_PX = MINIMAP_SIZE_PX * 0.5;
const RADAR_RANGE_FOOT_METERS = 92;
const RADAR_RANGE_DRIVE_METERS = 148;
const FRAME_INTERVAL_MS = 33; // ~30fps 更新で描画負荷を極小化

function strokeRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function createEmptySnapshot(): MinimapSnapshot {
  const drivableVehicles: MinimapVehiclePoint[] = [];
  for (let i = 0; i < 6; i += 1) {
    drivableVehicles.push({ id: '', x: 0, z: 0, yaw: 0, isActive: false });
  }
  const trafficVehicles: MinimapVehiclePoint[] = [];
  for (let i = 0; i < 8; i += 1) {
    trafficVehicles.push({ id: '', x: 0, z: 0, yaw: 0, isActive: false });
  }
  const coins: MinimapCoinPoint[] = [];
  for (let i = 0; i < 48; i += 1) {
    coins.push({ x: 0, z: 0 });
  }
  return {
    playerX: 0,
    playerZ: 0,
    playerYaw: 0,
    cameraYaw: 0,
    isDriving: false,
    drivableCount: 0,
    drivableVehicles,
    trafficCount: 0,
    trafficVehicles,
    coinCount: 0,
    coins,
    timeAttackActive: false,
    targetGate: { active: false, x: 0, z: 0, kind: 'start' },
  };
}

/**
 * 3-C / 4-A: 画面右上の軽量 2D Canvas レーダーミニマップ。
 * - 3D カメラの追加レンダリング（マルチパス描画）を一切行わず、2D 図形のみで描画。
 * - 拡張後の 360m マップ（外周道路ループ・都市公園・駅前ロータリー広場）へ表示範囲・スケールを自動同期。
 * - 徒歩時 92m / 運転時 148m にスムーズズーム切替し、高速走行時も先のカーブを確認可能。
 */
export function Minimap({ getSnapshot }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(MINIMAP_SIZE_PX * dpr);
    canvas.height = Math.round(MINIMAP_SIZE_PX * dpr);

    const snapshot = createEmptySnapshot();
    const worldHalf = CITY_METRICS.cityHalfSize; // 180
    const innerHalf = CITY_METRICS.innerCityHalfSize; // 80
    const roadHalf = CITY_METRICS.roadHalfWidth; // 6
    const swOuter = CITY_METRICS.sidewalkOuterHalf; // 10
    const ringSpan = CITY_METRICS.outerRingHalfSpan; // 132
    const ringCornerR = CITY_METRICS.outerRingCornerRadius; // 38
    const ringHalfW = CITY_METRICS.outerRingHalfWidth; // 7
    const parkB = CITY_METRICS.parkBounds;
    const plazaB = CITY_METRICS.plazaBounds;
    const rotC = CITY_METRICS.rotaryCenter;
    const rotInR = CITY_METRICS.rotaryIslandRadius;
    const rotOutR = CITY_METRICS.rotaryOuterRoadRadius;

    let currentRangeMeters = RADAR_RANGE_FOOT_METERS;
    let rafId = 0;
    let lastDrawTime = 0;

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      if (now - lastDrawTime < FRAME_INTERVAL_MS) return;
      lastDrawTime = now;

      getSnapshotRef.current(snapshot);

      const targetRange = snapshot.isDriving
        ? RADAR_RANGE_DRIVE_METERS
        : RADAR_RANGE_FOOT_METERS;
      currentRangeMeters += (targetRange - currentRangeMeters) * 0.14;
      const scale = (MINIMAP_HALF_PX - 6) / currentRangeMeters;

      const cx = MINIMAP_HALF_PX;
      const cy = MINIMAP_HALF_PX;
      const px = snapshot.playerX;
      const pz = snapshot.playerZ;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);

      // 円形クリッピングマスク
      ctx.beginPath();
      ctx.arc(cx, cy, MINIMAP_HALF_PX - 2, 0, Math.PI * 2);
      ctx.clip();

      // 背景（ワールド外周外）
      ctx.fillStyle = '#090f1c';
      ctx.fillRect(0, 0, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);

      // ワールド座標 -> ミニマップ 2D 座標（北上: -Z が上, +X が右）
      const toX = (wx: number) => cx + (wx - px) * scale;
      const toY = (wz: number) => cy + (wz - pz) * scale;

      // 1. 拡張マップ全体 (360m × 360m)
      const worldLeft = toX(-worldHalf);
      const worldTop = toY(-worldHalf);
      const worldSpan = worldHalf * 2 * scale;
      ctx.fillStyle = '#131d2f';
      ctx.fillRect(worldLeft, worldTop, worldSpan, worldSpan);

      // 2. 内側コア市街地ブロック (160m × 160m)
      const innerLeft = toX(-innerHalf);
      const innerTop = toY(-innerHalf);
      const innerSpan = innerHalf * 2 * scale;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(innerLeft, innerTop, innerSpan, innerSpan);

      // 3. 都市公園エリア（さくら中央公園: 緑の芝生＋遊歩道＋中央噴水）
      const parkX = toX(parkB.minX);
      const parkY = toY(parkB.minZ);
      const parkW = (parkB.maxX - parkB.minX) * scale;
      const parkH = (parkB.maxZ - parkB.minZ) * scale;
      ctx.fillStyle = '#166534';
      ctx.fillRect(parkX, parkY, parkW, parkH);
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.45)';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(parkX, parkY, parkW, parkH);
      // 公園内十字遊歩道＆中央噴水
      const parkCx = toX((parkB.minX + parkB.maxX) * 0.5);
      const parkCy = toY((parkB.minZ + parkB.maxZ) * 0.5);
      ctx.strokeStyle = 'rgba(214, 211, 209, 0.65)';
      ctx.lineWidth = Math.max(1.2, 3.0 * scale);
      ctx.beginPath();
      ctx.moveTo(parkX, parkCy);
      ctx.lineTo(parkX + parkW, parkCy);
      ctx.moveTo(parkCx, parkY);
      ctx.lineTo(parkCx, parkY + parkH);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(parkCx, parkCy, Math.max(1.6, 2.8 * scale), 0, Math.PI * 2);
      ctx.fill();

      // 4. 駅前ロータリー広場（舗装エプロン）
      ctx.fillStyle = '#3b4759';
      ctx.fillRect(
        toX(plazaB.minX),
        toY(plazaB.minZ),
        (plazaB.maxX - plazaB.minX) * scale,
        (plazaB.maxZ - plazaB.minZ) * scale,
      );

      // 5. 内側歩道帯（±10m）
      ctx.fillStyle = '#475569';
      ctx.fillRect(toX(-swOuter), innerTop, swOuter * 2 * scale, innerSpan);
      ctx.fillRect(innerLeft, toY(-swOuter), innerSpan, swOuter * 2 * scale);

      // 6. 外周道路ループ（直線＋R=38mコーナー、幅14m）
      const ringLeft = toX(-ringSpan);
      const ringTop = toY(-ringSpan);
      const ringSize = ringSpan * 2 * scale;
      const ringRad = ringCornerR * scale;
      strokeRoundedRectPath(ctx, ringLeft, ringTop, ringSize, ringSize, ringRad);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(3.5, ringHalfW * 2 * scale);
      ctx.stroke();

      // 7. 十字幹線車道（外周ループ ±132m まで延長接続）
      const armSpan = ringSpan * 2 * scale;
      ctx.fillStyle = '#334155';
      ctx.fillRect(toX(-roadHalf), ringTop, roadHalf * 2 * scale, armSpan);
      ctx.fillRect(ringLeft, toY(-roadHalf), armSpan, roadHalf * 2 * scale);

      // 8. 駅前ロータリー環状車道＋中央緑地島
      const rotX = toX(rotC.x);
      const rotY = toY(rotC.z);
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(rotX, rotY, rotOutR * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(rotX, rotY, rotInR * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // 9. 中央線（外周ループ＋幹線道路破線）
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.36)';
      ctx.lineWidth = 0.9;
      ctx.setLineDash([3, 3]);
      strokeRoundedRectPath(ctx, ringLeft, ringTop, ringSize, ringSize, ringRad);
      ctx.stroke();
      ctx.beginPath();
      // 南北中央線
      ctx.moveTo(toX(0), toY(-ringSpan));
      ctx.lineTo(toX(0), toY(-swOuter));
      ctx.moveTo(toX(0), toY(swOuter));
      ctx.lineTo(toX(0), toY(rotC.z - rotOutR));
      // 東西中央線
      ctx.moveTo(toX(-ringSpan), toY(0));
      ctx.lineTo(toX(-swOuter), toY(0));
      ctx.moveTo(toX(swOuter), toY(0));
      ctx.lineTo(toX(ringSpan), toY(0));
      ctx.stroke();
      ctx.setLineDash([]);

      // 10. 中央交差点4方向横断歩道マーカー（±8.4m）
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.52)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(toX(-roadHalf + 0.6), toY(-8.4));
      ctx.lineTo(toX(roadHalf - 0.6), toY(-8.4));
      ctx.moveTo(toX(-roadHalf + 0.6), toY(8.4));
      ctx.lineTo(toX(roadHalf - 0.6), toY(8.4));
      ctx.moveTo(toX(-8.4), toY(-roadHalf + 0.6));
      ctx.lineTo(toX(-8.4), toY(roadHalf - 0.6));
      ctx.moveTo(toX(8.4), toY(-roadHalf + 0.6));
      ctx.lineTo(toX(8.4), toY(roadHalf - 0.6));
      ctx.stroke();

      // 拡張マップ外周枠線
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(worldLeft, worldTop, worldSpan, worldSpan);

      // 5.5. 4-B: 通常時は近くの未取得ゴールドコインを小さな点で描画
      if (!snapshot.timeAttackActive && snapshot.coinCount > 0) {
        const coinVisRadSq = (MINIMAP_HALF_PX - 4) * (MINIMAP_HALF_PX - 4);
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = 'rgba(120, 53, 15, 0.9)';
        ctx.lineWidth = 0.85;
        for (let i = 0; i < snapshot.coinCount; i += 1) {
          const c = snapshot.coins[i];
          const mx = toX(c.x);
          const my = toY(c.z);
          const dx = mx - cx;
          const dy = my - cy;
          if (dx * dx + dy * dy > coinVisRadSq) continue;
          ctx.beginPath();
          ctx.arc(mx, my, 2.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // 5.6. 4-B: タイムアタック目標ゲート（通常時は START ゲートを緑で表示、タイムアタック中は次ゲートをパルス強調）
      if (snapshot.targetGate.active) {
        const tg = snapshot.targetGate;
        let gx = toX(tg.x);
        let gy = toY(tg.z);
        const dx = gx - cx;
        const dy = gy - cy;
        const dist = Math.hypot(dx, dy);
        const gateClampR = MINIMAP_HALF_PX - 9;
        const isClamped = dist > gateClampR;
        if (isClamped && dist > 1e-4) {
          gx = cx + (dx / dist) * gateClampR;
          gy = cy + (dy / dist) * gateClampR;
        }

        const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
        const isGoal = tg.kind === 'goal';
        const isStart = tg.kind === 'start';
        const mainColor = isGoal
          ? '#fbbf24'
          : isStart
            ? '#34d399'
            : '#38bdf8';
        const haloColor = isGoal
          ? 'rgba(251, 191, 36, 0.45)'
          : isStart
            ? 'rgba(52, 211, 153, 0.35)'
            : 'rgba(56, 189, 248, 0.45)';

        ctx.save();
        ctx.translate(gx, gy);
        if (isClamped) {
          // レーダー外にある場合は端へ方向三角形マーカーを表示
          const dirAngle = Math.atan2(dy, dx);
          ctx.rotate(dirAngle);
          ctx.beginPath();
          ctx.moveTo(6.2, 0);
          ctx.lineTo(-3.6, -4.4);
          ctx.lineTo(-1.8, 0);
          ctx.lineTo(-3.6, 4.4);
          ctx.closePath();
          ctx.fillStyle = mainColor;
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          // レーダー内にある場合は脈動ハロー＋二重リング
          const haloR = (snapshot.timeAttackActive ? 7.2 : 5.6) + pulse * 2.4;
          ctx.beginPath();
          ctx.arc(0, 0, haloR, 0, Math.PI * 2);
          ctx.strokeStyle = haloColor;
          ctx.lineWidth = 1.8;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, snapshot.timeAttackActive ? 4.4 : 3.6, 0, Math.PI * 2);
          ctx.fillStyle = mainColor;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6. AI 交通車両（オレンジの向き付き矩形）
      for (let i = 0; i < snapshot.trafficCount; i += 1) {
        const tv = snapshot.trafficVehicles[i];
        const mx = toX(tv.x);
        const my = toY(tv.z);
        const dx = mx - cx;
        const dy = my - cy;
        if (dx * dx + dy * dy > (MINIMAP_HALF_PX + 6) * (MINIMAP_HALF_PX + 6)) {
          continue;
        }
        const angle = Math.atan2(Math.cos(tv.yaw), Math.sin(tv.yaw));
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.fillStyle = '#fb923c';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 1;
        ctx.fillRect(-3.6, -2.1, 7.2, 4.2);
        ctx.strokeRect(-3.6, -2.1, 7.2, 4.2);
        ctx.restore();
      }

      // 7. 運転可能車両4台（シアン／ゴールド／バイオレット／ピンクの強調アイコン・発火/残骸状態も区別表示・レーダー外でも端に表示）
      const clampRadius = MINIMAP_HALF_PX - 9;
      for (let i = 0; i < snapshot.drivableCount; i += 1) {
        const dv = snapshot.drivableVehicles[i];
        if (dv.isActive) continue; // 乗車中の自車はプレイヤー矢印で表現

        let mx = toX(dv.x);
        let my = toY(dv.z);
        const dx = mx - cx;
        const dy = my - cy;
        const dist = Math.hypot(dx, dy);
        const isClamped = dist > clampRadius;
        if (isClamped && dist > 1e-4) {
          mx = cx + (dx / dist) * clampRadius;
          my = cy + (dy / dist) * clampRadius;
        }

        const isSupercar = dv.id.includes('furai') || dv.id.includes('mazda');
        const isSports = dv.id.includes('porsche');
        const isBike = dv.id.includes('bike') || dv.id.includes('harley');
        const baseFill = isBike
          ? '#f472b6'
          : isSupercar
            ? '#c084fc'
            : isSports
              ? '#facc15'
              : '#38bdf8';
        const fill = dv.isWrecked
          ? '#475569'
          : dv.isBurning
            ? '#f97316'
            : baseFill;

        ctx.save();
        ctx.translate(mx, my);
        if (dv.isBurning) {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.016);
          ctx.beginPath();
          ctx.arc(0, 0, 5.5 + pulse * 2.4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        if (isClamped) {
          ctx.beginPath();
          ctx.arc(0, 0, isBike ? 3.2 : 3.6, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = dv.isWrecked ? '#ef4444' : '#0f172a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          const angle = Math.atan2(Math.cos(dv.yaw), Math.sin(dv.yaw));
          ctx.rotate(angle);
          ctx.fillStyle = fill;
          ctx.strokeStyle = dv.isWrecked ? '#94a3b8' : '#ffffff';
          ctx.lineWidth = 1.1;
          if (isBike) {
            ctx.fillRect(-3.8, -1.6, 7.6, 3.2);
            ctx.strokeRect(-3.8, -1.6, 7.6, 3.2);
          } else {
            ctx.fillRect(-4.6, -2.7, 9.2, 5.4);
            ctx.strokeRect(-4.6, -2.7, 9.2, 5.4);
          }
          if (dv.isWrecked) {
            ctx.rotate(-angle);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-2.6, -2.6);
            ctx.lineTo(2.6, 2.6);
            ctx.moveTo(2.6, -2.6);
            ctx.lineTo(-2.6, 2.6);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 8. カメラ視線方向コーン（薄い扇形）
      const camAngle = Math.atan2(
        Math.cos(snapshot.cameraYaw),
        Math.sin(snapshot.cameraYaw),
      );
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 26, camAngle - 0.36, camAngle + 0.36);
      ctx.closePath();
      ctx.fillStyle = 'rgba(125, 211, 252, 0.14)';
      ctx.fill();
      ctx.restore();

      // 9. プレイヤー位置と向き（中央の方向矢印）
      const playerAngle = Math.atan2(
        Math.cos(snapshot.playerYaw),
        Math.sin(snapshot.playerYaw),
      );
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(playerAngle);
      ctx.beginPath();
      ctx.moveTo(7.5, 0); // 先端
      ctx.lineTo(-5.2, -4.6);
      ctx.lineTo(-2.6, 0);
      ctx.lineTo(-5.2, 4.6);
      ctx.closePath();
      ctx.fillStyle = snapshot.isDriving ? '#38bdf8' : '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      // 内側レーダーリング
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, MINIMAP_HALF_PX * 0.52, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="minimap-container" aria-label="Minimap">
      <div className="minimap-frame">
        <canvas
          ref={canvasRef}
          className="minimap-canvas"
          style={{ width: MINIMAP_SIZE_PX, height: MINIMAP_SIZE_PX }}
        />
        <span className="minimap-north" aria-hidden="true">
          N
        </span>
      </div>
    </div>
  );
}
