import * as THREE from 'three';

export type TimeAttackMode = 'idle' | 'running' | 'finished';
export type TimeAttackGateKind = 'start' | 'checkpoint' | 'goal';
export type TimeAttackEvent = 'none' | 'start' | 'checkpoint' | 'goal' | 'goal_record';

export interface TimeAttackGateDef {
  id: string;
  label: string;
  x: number;
  z: number;
  yaw: number;
  kind: TimeAttackGateKind;
}

export interface TimeAttackMinimapTarget {
  active: boolean;
  x: number;
  z: number;
  kind: TimeAttackGateKind;
}

export interface TimeAttackStatusSnapshot {
  mode: TimeAttackMode;
  elapsedMs: number;
  currentGateIndex: number;
  totalGates: number;
  remainingGates: number;
  currentGateLabel: string;
  lastClearTimeMs: number | null;
  bestTimeMs: number | null;
  isNewRecord: boolean;
  clearCount: number;
}

const STORAGE_KEY_BEST_TIME = 'my3dgame.timeAttack.bestTimeMs';
const STORAGE_KEY_CLEAR_COUNT = 'my3dgame.timeAttack.clearCount';

const GATE_TRIGGER_RADIUS = 6.4;
const GATE_TRIGGER_RADIUS_SQ = GATE_TRIGGER_RADIUS * GATE_TRIGGER_RADIUS;

/** START ゲート（駅前広場入口・南幹線 Z = 80m、南向き） */
export const TIME_ATTACK_START_GATE: TimeAttackGateDef = {
  id: 'ta_start',
  label: 'START',
  x: 0,
  z: 80,
  yaw: 0,
  kind: 'start',
};

/** 再挑戦時にスタートゲート直前へ復帰させる安全座標（STARTの14m手前・南向き） */
export const TIME_ATTACK_RETRY_POSE = {
  x: 0,
  z: 66,
  yaw: 0,
} as const;

/**
 * 外周道路〜市街地を1周する全8箇所のチェックポイントコース。
 * - START(駅前広場入口) -> ロータリー通過 -> 外周南東 -> 外周東 -> 公園前(外周北) -> 外周西 -> 市街地西幹線 -> 市街地南幹線GOAL
 */
export const TIME_ATTACK_CHECKPOINTS: readonly TimeAttackGateDef[] = [
  {
    id: 'ta_cp_1',
    label: '外周・南東ストレート',
    x: 42,
    z: 134,
    yaw: Math.PI * 0.5,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_2',
    label: '外周・東ストレート南',
    x: 134,
    z: 44,
    yaw: Math.PI,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_3',
    label: '外周・東ストレート北',
    x: 134,
    z: -44,
    yaw: Math.PI,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_4',
    label: 'さくら中央公園前',
    x: 55,
    z: -134,
    yaw: -Math.PI * 0.5,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_5',
    label: '外周・北西ストレート',
    x: -55,
    z: -134,
    yaw: -Math.PI * 0.5,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_6',
    label: '外周・西ストレート',
    x: -134,
    z: -44,
    yaw: 0,
    kind: 'checkpoint',
  },
  {
    id: 'ta_cp_7',
    label: '市街地・西幹線通り',
    x: -48,
    z: 0,
    yaw: Math.PI * 0.5,
    kind: 'checkpoint',
  },
  {
    id: 'ta_goal',
    label: 'GOAL',
    x: 0,
    z: 48,
    yaw: 0,
    kind: 'goal',
  },
];

const GATE_COLORS: Record<
  TimeAttackGateKind,
  { main: number; accent: number; badgeBg: string; badgeBorder: string; badgeText: string }
> = {
  start: {
    main: 0x10b981,
    accent: 0x6ee7b7,
    badgeBg: 'rgba(6, 78, 59, 0.88)',
    badgeBorder: '#34d399',
    badgeText: '#ecfdf5',
  },
  checkpoint: {
    main: 0x06b6d4,
    accent: 0x7dd3fc,
    badgeBg: 'rgba(12, 74, 110, 0.88)',
    badgeBorder: '#38bdf8',
    badgeText: '#f0f9ff',
  },
  goal: {
    main: 0xf59e0b,
    accent: 0xfde68a,
    badgeBg: 'rgba(120, 53, 15, 0.9)',
    badgeBorder: '#fbbf24',
    badgeText: '#fffbeb',
  },
};

function loadSavedNumber(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // プライベートブラウズ等で保存不可の場合は無視
  }
}

function distSqPointToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) {
    return wx * wx + wz * wz;
  }
  let t = (wx * vx + wz * vz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + t * vx);
  const dz = pz - (az + t * vz);
  return dx * dx + dz * dz;
}

/** タイム表示用フォーマッタ（MM:SS.cc） */
export function formatTimeAttackMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const sStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
  const cStr = centis < 10 ? `0${centis}` : `${centis}`;
  return `${mStr}:${sStr}.${cStr}`;
}

/**
 * PHASE 4-B: チェックポイント・タイムアタックシステム。
 * - 常時表示するゲートを1基のみ再利用し、発光リング＋左右の光柱＋遠距離ビーコン＋ラベルで
 *   M1 iPad Air 60FPS を維持しながら遠目からの高い視認性を実現。
 * - 毎フレーム更新はゼロアロケーション（ラベルCanvas再描画はゲート切替時のみ）。
 */
export class TimeAttackSystem {
  private readonly scene: THREE.Scene;
  private readonly gateRoot: THREE.Group;

  private readonly mainRingMesh: THREE.Mesh;
  private readonly innerRingMesh: THREE.Mesh;
  private readonly groundPadMesh: THREE.Mesh;
  private readonly labelSprite: THREE.Sprite;

  private readonly mainRingMat: THREE.MeshBasicMaterial;
  private readonly accentMat: THREE.MeshBasicMaterial;
  private readonly pillarMat: THREE.MeshBasicMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly groundPadMat: THREE.MeshBasicMaterial;
  private readonly labelCanvas: HTMLCanvasElement;
  private readonly labelCtx: CanvasRenderingContext2D | null;
  private readonly labelTexture: THREE.CanvasTexture;
  private readonly labelMat: THREE.SpriteMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  private mode: TimeAttackMode = 'idle';
  private currentGateIndex = 0;
  private elapsedMs = 0;
  private lastClearTimeMs: number | null = null;
  private bestTimeMs: number | null;
  private clearCount: number;
  private isNewRecord = false;
  private animTime = 0;
  private startCooldownSec = 0;
  private prevActorX = 0;
  private prevActorZ = 0;
  private hasPrevActor = false;
  private flashTimer = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.bestTimeMs = loadSavedNumber(STORAGE_KEY_BEST_TIME);
    this.clearCount = Math.floor(loadSavedNumber(STORAGE_KEY_CLEAR_COUNT) ?? 0);

    this.gateRoot = new THREE.Group();
    this.gateRoot.name = 'TimeAttackGateRoot';

    // 1. メイン発光リング（半透明・加算ブレンド）
    const mainRingGeo = new THREE.TorusGeometry(4.5, 0.24, 14, 48);
    this.geometries.push(mainRingGeo);
    this.mainRingMat = new THREE.MeshBasicMaterial({
      color: GATE_COLORS.start.main,
      transparent: true,
      opacity: 0.84,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mainRingMesh = new THREE.Mesh(mainRingGeo, this.mainRingMat);
    this.mainRingMesh.position.set(0, 3.6, 0);
    this.gateRoot.add(this.mainRingMesh);

    // 2. 内側アクセントリング（ゆっくり回転）
    const innerRingGeo = new THREE.TorusGeometry(3.85, 0.085, 10, 36);
    this.geometries.push(innerRingGeo);
    this.accentMat = new THREE.MeshBasicMaterial({
      color: GATE_COLORS.start.accent,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.innerRingMesh = new THREE.Mesh(innerRingGeo, this.accentMat);
    this.innerRingMesh.position.set(0, 3.6, 0);
    this.gateRoot.add(this.innerRingMesh);

    // 3. 左右の半透明光柱（道路両端で遠目から位置を明確化）
    const pillarGeo = new THREE.CylinderGeometry(0.24, 0.44, 14.0, 12, 1, true);
    this.geometries.push(pillarGeo);
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: GATE_COLORS.start.main,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const leftPillarMesh = new THREE.Mesh(pillarGeo, this.pillarMat);
    leftPillarMesh.position.set(-4.6, 7.0, 0);
    const rightPillarMesh = new THREE.Mesh(pillarGeo, this.pillarMat);
    rightPillarMesh.position.set(4.6, 7.0, 0);
    this.gateRoot.add(leftPillarMesh, rightPillarMesh);

    // 4. 遠距離視認用の空へ伸びる半透明ビーコン柱
    const beaconGeo = new THREE.CylinderGeometry(0.55, 2.2, 36.0, 14, 1, true);
    this.geometries.push(beaconGeo);
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: GATE_COLORS.start.accent,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMat);
    beaconMesh.position.set(0, 18.0, 0);
    this.gateRoot.add(beaconMesh);

    // 5. 路面のガイド発光リングパッド
    const groundPadGeo = new THREE.RingGeometry(3.4, 4.8, 36);
    groundPadGeo.rotateX(-Math.PI * 0.5);
    this.geometries.push(groundPadGeo);
    this.groundPadMat = new THREE.MeshBasicMaterial({
      color: GATE_COLORS.start.accent,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.groundPadMesh = new THREE.Mesh(groundPadGeo, this.groundPadMat);
    this.groundPadMesh.position.set(0, 0.05, 0);
    this.gateRoot.add(this.groundPadMesh);

    // 6. 上部の視認性ラベルスプライト（ゲート切替時のみ Canvas 再描画）
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 144;
    this.labelCtx = this.labelCanvas.getContext('2d');
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelMat = new THREE.SpriteMaterial({
      map: this.labelTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.labelSprite = new THREE.Sprite(this.labelMat);
    this.labelSprite.position.set(0, 9.2, 0);
    this.labelSprite.scale.set(7.6, 2.14, 1);
    this.gateRoot.add(this.labelSprite);

    this.scene.add(this.gateRoot);
    this.applyActiveGateVisual();
  }

  public isRunning(): boolean {
    return this.mode === 'running';
  }

  /**
   * 毎フレーム更新（ゲート発光アニメ・経過タイム加算・通過判定）。
   */
  public update(dt: number, actorX: number, actorZ: number): TimeAttackEvent {
    const clampedDt = Math.min(dt, 0.05);
    this.animTime += clampedDt;

    if (this.startCooldownSec > 0) {
      this.startCooldownSec = Math.max(0, this.startCooldownSec - clampedDt);
    }
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - clampedDt);
    }
    if (this.mode === 'running') {
      this.elapsedMs += clampedDt * 1000;
    }

    // ゲートアニメーション（ゼロアロケーション）
    const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 4.2);
    const flashBoost = this.flashTimer > 0 ? this.flashTimer * 0.45 : 0;
    this.mainRingMat.opacity = Math.min(1, 0.72 + pulse * 0.2 + flashBoost);
    this.accentMat.opacity = Math.min(1, 0.62 + (1 - pulse) * 0.25 + flashBoost);
    this.pillarMat.opacity = 0.24 + pulse * 0.16;
    this.beaconMat.opacity = 0.1 + pulse * 0.07;
    this.groundPadMat.opacity = 0.34 + pulse * 0.24;

    const ringScale = 1.0 + Math.sin(this.animTime * 3.0) * 0.025;
    this.mainRingMesh.scale.set(ringScale, ringScale, 1);
    this.innerRingMesh.rotation.z = this.animTime * 1.15;
    const padScale = 0.96 + pulse * 0.08;
    this.groundPadMesh.scale.set(padScale, 1, padScale);
    this.labelSprite.position.y = 9.15 + Math.sin(this.animTime * 2.5) * 0.22;

    if (!this.hasPrevActor) {
      this.prevActorX = actorX;
      this.prevActorZ = actorZ;
      this.hasPrevActor = true;
    }

    const moveDx = actorX - this.prevActorX;
    const moveDz = actorZ - this.prevActorZ;
    const isTeleport = moveDx * moveDx + moveDz * moveDz > 400;
    const segAx = isTeleport ? actorX : this.prevActorX;
    const segAz = isTeleport ? actorZ : this.prevActorZ;

    this.prevActorX = actorX;
    this.prevActorZ = actorZ;

    const targetGate = this.getActiveGateDef();
    const dSq = distSqPointToSegment2D(
      targetGate.x,
      targetGate.z,
      segAx,
      segAz,
      actorX,
      actorZ,
    );

    if (dSq > GATE_TRIGGER_RADIUS_SQ) {
      return 'none';
    }

    if (this.mode !== 'running') {
      if (this.startCooldownSec > 0) {
        return 'none';
      }
      // START ゲート通過 -> タイムアタック自動開始
      this.mode = 'running';
      this.currentGateIndex = 0;
      this.elapsedMs = 0;
      this.isNewRecord = false;
      this.flashTimer = 0.45;
      this.applyActiveGateVisual();
      return 'start';
    }

    // チェックポイント通過
    if (this.currentGateIndex < TIME_ATTACK_CHECKPOINTS.length - 1) {
      this.currentGateIndex += 1;
      this.flashTimer = 0.4;
      this.applyActiveGateVisual();
      return 'checkpoint';
    }

    // 最終 GOAL ゲート通過 -> クリア！
    const clearTimeMs = Math.round(this.elapsedMs);
    this.mode = 'finished';
    this.lastClearTimeMs = clearTimeMs;
    this.clearCount += 1;
    saveNumber(STORAGE_KEY_CLEAR_COUNT, this.clearCount);

    const improved = this.bestTimeMs === null || clearTimeMs < this.bestTimeMs;
    this.isNewRecord = improved;
    if (improved) {
      this.bestTimeMs = clearTimeMs;
      saveNumber(STORAGE_KEY_BEST_TIME, clearTimeMs);
    }

    this.startCooldownSec = 2.0;
    this.flashTimer = 0.65;
    this.applyActiveGateVisual();
    return improved ? 'goal_record' : 'goal';
  }

  /** 走行中のタイムアタックを中断し START ゲートへ戻す */
  public abort(): void {
    this.mode = 'idle';
    this.currentGateIndex = 0;
    this.elapsedMs = 0;
    this.isNewRecord = false;
    this.startCooldownSec = 1.6;
    this.applyActiveGateVisual();
  }

  /** リザルト表示を閉じて通常状態へ戻す */
  public dismissResult(): void {
    if (this.mode === 'finished') {
      this.mode = 'idle';
    }
  }

  /** 再挑戦準備（タイマーとゲートを START へ戻し、直前ワープ後に即スタート可能にする） */
  public resetForRetry(): void {
    this.mode = 'idle';
    this.currentGateIndex = 0;
    this.elapsedMs = 0;
    this.isNewRecord = false;
    this.startCooldownSec = 0.25;
    this.hasPrevActor = false;
    this.applyActiveGateVisual();
  }

  /** ミニマップ用に現在目標ゲートの座標と種別を書き込む（ゼロアロケーション） */
  public fillMinimapTarget(out: TimeAttackMinimapTarget): void {
    const gate = this.getActiveGateDef();
    out.active = true;
    out.x = gate.x;
    out.z = gate.z;
    out.kind = gate.kind;
  }

  public getStatus(): TimeAttackStatusSnapshot {
    const totalGates = TIME_ATTACK_CHECKPOINTS.length;
    const remainingGates =
      this.mode === 'running'
        ? Math.max(0, totalGates - this.currentGateIndex)
        : totalGates;
    const activeGate = this.getActiveGateDef();

    return {
      mode: this.mode,
      elapsedMs: this.elapsedMs,
      currentGateIndex: this.currentGateIndex,
      totalGates,
      remainingGates,
      currentGateLabel: activeGate.label,
      lastClearTimeMs: this.lastClearTimeMs,
      bestTimeMs: this.bestTimeMs,
      isNewRecord: this.isNewRecord,
      clearCount: this.clearCount,
    };
  }

  public dispose(): void {
    this.scene.remove(this.gateRoot);
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.mainRingMat.dispose();
    this.accentMat.dispose();
    this.pillarMat.dispose();
    this.beaconMat.dispose();
    this.groundPadMat.dispose();
    this.labelTexture.dispose();
    this.labelMat.dispose();
  }

  private getActiveGateDef(): TimeAttackGateDef {
    if (this.mode === 'running') {
      return TIME_ATTACK_CHECKPOINTS[this.currentGateIndex];
    }
    return TIME_ATTACK_START_GATE;
  }

  private applyActiveGateVisual(): void {
    const gate = this.getActiveGateDef();
    const palette = GATE_COLORS[gate.kind];

    this.gateRoot.position.set(gate.x, 0, gate.z);
    this.gateRoot.rotation.y = gate.yaw;

    this.mainRingMat.color.setHex(palette.main);
    this.accentMat.color.setHex(palette.accent);
    this.pillarMat.color.setHex(palette.main);
    this.beaconMat.color.setHex(palette.accent);
    this.groundPadMat.color.setHex(palette.accent);

    let title = 'START';
    let subtitle = 'TIME ATTACK';
    if (this.mode === 'running') {
      if (gate.kind === 'goal') {
        title = 'GOAL!';
        subtitle = 'FINAL GATE';
      } else {
        title = `GATE ${this.currentGateIndex + 1} / ${TIME_ATTACK_CHECKPOINTS.length}`;
        subtitle = gate.label;
      }
    }
    this.redrawLabelCanvas(title, subtitle, palette);
  }

  private redrawLabelCanvas(
    title: string,
    subtitle: string,
    palette: { badgeBg: string; badgeBorder: string; badgeText: string },
  ): void {
    const ctx = this.labelCtx;
    if (!ctx) return;

    const w = this.labelCanvas.width;
    const h = this.labelCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // 角丸バッジ背景
    const r = 28;
    const pad = 10;
    ctx.beginPath();
    ctx.moveTo(pad + r, pad);
    ctx.lineTo(w - pad - r, pad);
    ctx.quadraticCurveTo(w - pad, pad, w - pad, pad + r);
    ctx.lineTo(w - pad, h - pad - r);
    ctx.quadraticCurveTo(w - pad, h - pad, w - pad - r, h - pad);
    ctx.lineTo(pad + r, h - pad);
    ctx.quadraticCurveTo(pad, h - pad, pad, h - pad - r);
    ctx.lineTo(pad, pad + r);
    ctx.quadraticCurveTo(pad, pad, pad + r, pad);
    ctx.closePath();

    ctx.fillStyle = palette.badgeBg;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = palette.badgeBorder;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.badgeText;
    ctx.font = '800 50px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(title, w * 0.5, h * 0.41);

    ctx.fillStyle = palette.badgeBorder;
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(subtitle, w * 0.5, h * 0.77);

    this.labelTexture.needsUpdate = true;
  }
}
