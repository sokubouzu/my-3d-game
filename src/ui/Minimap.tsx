import { useEffect, useRef } from 'react';
import { CITY_METRICS } from '../world/collisionWorld';

export interface MinimapVehiclePoint {
  id: string;
  x: number;
  z: number;
  yaw: number;
  isActive: boolean;
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
}

export interface MinimapProps {
  getSnapshot: (out: MinimapSnapshot) => void;
}

const MINIMAP_SIZE_PX = 140;
const MINIMAP_HALF_PX = MINIMAP_SIZE_PX * 0.5;
const RADAR_RANGE_METERS = 56;
const FRAME_INTERVAL_MS = 33; // ~30fps 更新で描画負荷を極小化

function createEmptySnapshot(): MinimapSnapshot {
  const drivableVehicles: MinimapVehiclePoint[] = [];
  for (let i = 0; i < 4; i += 1) {
    drivableVehicles.push({ id: '', x: 0, z: 0, yaw: 0, isActive: false });
  }
  const trafficVehicles: MinimapVehiclePoint[] = [];
  for (let i = 0; i < 8; i += 1) {
    trafficVehicles.push({ id: '', x: 0, z: 0, yaw: 0, isActive: false });
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
  };
}

/**
 * 3-C: 画面右上の軽量 2D Canvas レーダーミニマップ。
 * - 3D カメラの追加レンダリング（マルチパス描画）を一切行わず、2D 図形のみで描画。
 * - 約 30fps スロットリング＆ゼロアロケーションスナップショットで M1 iPad Air の 60FPS を維持。
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
    const scale = (MINIMAP_HALF_PX - 6) / RADAR_RANGE_METERS;
    const cityHalf = CITY_METRICS.cityHalfSize;
    const roadHalf = CITY_METRICS.roadHalfWidth;
    const swOuter = CITY_METRICS.sidewalkOuterHalf;

    let rafId = 0;
    let lastDrawTime = 0;

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      if (now - lastDrawTime < FRAME_INTERVAL_MS) return;
      lastDrawTime = now;

      getSnapshotRef.current(snapshot);

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

      // 背景（街区外周）
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);

      // ワールド座標 -> ミニマップ 2D 座標（北上: -Z が上, +X が右）
      const toX = (wx: number) => cx + (wx - px) * scale;
      const toY = (wz: number) => cy + (wz - pz) * scale;

      // 1. 160m × 160m 街区ブロック（4区画）
      ctx.fillStyle = '#1e293b';
      const cityLeft = toX(-cityHalf);
      const cityTop = toY(-cityHalf);
      const citySpan = cityHalf * 2 * scale;
      ctx.fillRect(cityLeft, cityTop, citySpan, citySpan);

      // 2. 歩道帯（±10m）
      ctx.fillStyle = '#475569';
      ctx.fillRect(toX(-swOuter), cityTop, swOuter * 2 * scale, citySpan);
      ctx.fillRect(cityLeft, toY(-swOuter), citySpan, swOuter * 2 * scale);

      // 3. 十字車道アスファルト（±6m）
      ctx.fillStyle = '#334155';
      ctx.fillRect(toX(-roadHalf), cityTop, roadHalf * 2 * scale, citySpan);
      ctx.fillRect(cityLeft, toY(-roadHalf), citySpan, roadHalf * 2 * scale);

      // 4. 中央線（破線）
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.36)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      // 南北中央線（交差点外）
      ctx.moveTo(toX(0), toY(-cityHalf));
      ctx.lineTo(toX(0), toY(-swOuter));
      ctx.moveTo(toX(0), toY(swOuter));
      ctx.lineTo(toX(0), toY(cityHalf));
      // 東西中央線（交差点外）
      ctx.moveTo(toX(-cityHalf), toY(0));
      ctx.lineTo(toX(-swOuter), toY(0));
      ctx.moveTo(toX(swOuter), toY(0));
      ctx.lineTo(toX(cityHalf), toY(0));
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. 4方向横断歩道マーカー（±8.4m）
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.52)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      // 北・南横断歩道
      ctx.moveTo(toX(-roadHalf + 0.6), toY(-8.4));
      ctx.lineTo(toX(roadHalf - 0.6), toY(-8.4));
      ctx.moveTo(toX(-roadHalf + 0.6), toY(8.4));
      ctx.lineTo(toX(roadHalf - 0.6), toY(8.4));
      // 西・東横断歩道
      ctx.moveTo(toX(-8.4), toY(-roadHalf + 0.6));
      ctx.lineTo(toX(-8.4), toY(roadHalf - 0.6));
      ctx.moveTo(toX(8.4), toY(-roadHalf + 0.6));
      ctx.lineTo(toX(8.4), toY(roadHalf - 0.6));
      ctx.stroke();

      // 街区外周枠線
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cityLeft, cityTop, citySpan, citySpan);

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

      // 7. 運転可能車両2台（シアン／ゴールドの強調アイコン・レーダー外でも端に表示）
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

        const isSports = dv.id.includes('porsche');
        const isBike = dv.id.includes('bike') || dv.id.includes('harley');
        const fill = isBike ? '#f472b6' : isSports ? '#facc15' : '#38bdf8';

        ctx.save();
        ctx.translate(mx, my);
        if (isClamped) {
          ctx.beginPath();
          ctx.arc(0, 0, isBike ? 3.2 : 3.6, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          const angle = Math.atan2(Math.cos(dv.yaw), Math.sin(dv.yaw));
          ctx.rotate(angle);
          ctx.fillStyle = fill;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.1;
          if (isBike) {
            ctx.fillRect(-3.8, -1.6, 7.6, 3.2);
            ctx.strokeRect(-3.8, -1.6, 7.6, 3.2);
          } else {
            ctx.fillRect(-4.6, -2.7, 9.2, 5.4);
            ctx.strokeRect(-4.6, -2.7, 9.2, 5.4);
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
