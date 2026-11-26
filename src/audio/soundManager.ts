export type VehicleAudioProfile = 'standard' | 'sports';

export interface VehicleAudioFrame {
  isDriving: boolean;
  speedKmh: number;
  maxSpeedKmh: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  isReversing: boolean;
  profile: VehicleAudioProfile;
}

export interface SoundStateSnapshot {
  muted: boolean;
  unlocked: boolean;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & { webkitAudioContext?: AudioContextCtor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/**
 * 作業ID 3-D: iPadOS Safari 対応・外部音声ファイル不要の手続き型 Web Audio エンジン。
 *
 * - エンジン音・走行音・スキッド音・街の環境音は初期化時に1回だけ常設ノードグラフを構築し、
 *   毎フレームは setTargetAtTime によるパラメータ更新のみを行う（M1 iPad Air 60FPS 維持）。
 * - 足音・着地音・衝突音はイベント発生時のみ事前生成ノイズバッファを共有して軽量再生。
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // 共有ノイズバッファ（初期化時に1回のみ生成）
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // 1. 街の環境音（常設）
  private ambientLfo: OscillatorNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;

  // 2. 車両エンジン音＆ロードノイズ（常設）
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private enginePulseLfo: OscillatorNode | null = null;
  private enginePulseGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private roadSource: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;

  // 3. タイヤスキッド音（常設）
  private skidSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  // 状態管理
  private muted = false;
  private unlocked = false;
  private disposed = false;
  private onStateChange?: (state: SoundStateSnapshot) => void;

  // 足音・衝突クールダウン管理
  private footstepTimer = 0;
  private wasMovingOnFoot = false;
  private footstepAlternate = false;
  private lastImpactTimeMs = -1000;

  // バックグラウンド遷移ハンドラ
  private readonly handleVisibilityChange: () => void;

  constructor(onStateChange?: (state: SoundStateSnapshot) => void) {
    this.onStateChange = onStateChange;

    this.handleVisibilityChange = () => {
      if (!this.ctx || this.disposed) return;
      if (document.hidden) {
        if (this.ctx.state === 'running') {
          void this.ctx.suspend().catch(() => {});
        }
      } else if (this.unlocked && !this.muted && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public getState(): SoundStateSnapshot {
    return {
      muted: this.muted,
      unlocked: this.unlocked,
    };
  }

  /**
   * iPadOS Safari の自動再生制限解除。
   * ユーザーの初回画面タップ／キー操作イベントハンドラ内から同期的に呼び出すこと。
   */
  public unlock(): void {
    if (this.disposed) return;

    if (!this.ctx) {
      const Ctor = getAudioContextConstructor();
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
        this.buildPersistentGraph(this.ctx);
      } catch {
        return;
      }
    }

    const ctx = this.ctx;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          this.markUnlocked();
        })
        .catch(() => {});
    }

    // iOS / iPadOS Safari 確実アンロック用の無音1サンプル再生
    if (!this.unlocked) {
      try {
        const silentBuf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = silentBuf;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // 既に再生可能または無視可能
      }
      if (ctx.state === 'running') {
        this.markUnlocked();
      }
    }
  }

  public setMuted(nextMuted: boolean): boolean {
    this.muted = nextMuted;
    if (!this.muted) {
      this.unlock();
    }
    this.applyMasterGain();
    this.emitState();
    return this.muted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  /**
   * 車両エンジン音・ロードノイズ・ブレーキスキッド音を毎フレーム滑らかに更新する（ゼロアロケーション）。
   */
  public updateVehicleAudio(frame: VehicleAudioFrame): void {
    if (!this.ctx || !this.unlocked || this.disposed) return;
    if (
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineSubOsc ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.enginePulseLfo ||
      !this.enginePulseGain ||
      !this.roadFilter ||
      !this.roadGain ||
      !this.skidFilter ||
      !this.skidGain
    ) {
      return;
    }

    const now = this.ctx.currentTime;

    if (!frame.isDriving) {
      // 降車時はエンジン音・走行音・スキッド音を滑らかに減衰停止
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.14);
      this.roadGain.gain.setTargetAtTime(0.0001, now, 0.12);
      this.skidGain.gain.setTargetAtTime(0.0001, now, 0.05);
      return;
    }

    const isSports = frame.profile === 'sports';
    const maxKmh = Math.max(40, frame.maxSpeedKmh);
    const speedKmh = Math.max(0, frame.speedKmh);
    const speedNorm = Math.min(1, speedKmh / maxKmh);
    const throttle = Math.max(0, Math.min(1, frame.throttle));
    const brake = Math.max(0, Math.min(1, frame.brake));

    // 擬似オートマチックの回転数カーブ（滑らかな上昇＋アクセル踏み込みによる負荷ブースト）
    const revCurve = Math.pow(speedNorm, 0.78);
    const throttleBoost = throttle * (isSports ? 0.18 : 0.12);
    const revNorm = Math.min(1.12, revCurve + throttleBoost);

    // 車種別の基本周波数＆倍音バランス
    const idleFreq = isSports ? 64 : 46;
    const maxFreq = isSports ? 255 : 155;
    const baseFreq = idleFreq + (maxFreq - idleFreq) * revNorm;
    const harmonicRatio = isSports ? 2.02 : 1.99;

    const freqTau = isSports ? 0.045 : 0.065;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, freqTau);
    this.engineOsc2.frequency.setTargetAtTime(
      baseFreq * harmonicRatio,
      now,
      freqTau,
    );
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, freqTau);

    // アイドリング時の低い鼓動感（低速ほど脈動、高速で滑らかに連続音へ）
    const idlePulseRate = isSports ? 14 + speedNorm * 22 : 10 + speedNorm * 16;
    const idlePulseDepth = (1 - Math.min(1, speedNorm * 2.5)) * (isSports ? 0.022 : 0.018);
    this.enginePulseLfo.frequency.setTargetAtTime(idlePulseRate, now, 0.08);
    this.enginePulseGain.gain.setTargetAtTime(idlePulseDepth, now, 0.08);

    // ローパスフィルター開度（アクセルON・高回転で倍音が明るく開く）
    const filterMin = isSports ? 340 : 220;
    const filterMax = isSports ? 2200 : 1150;
    const targetFilterFreq =
      filterMin +
      (filterMax - filterMin) * Math.min(1, revNorm * 0.85 + throttle * 0.28);
    this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);
    this.engineFilter.Q.setTargetAtTime(isSports ? 2.4 : 1.4, now, 0.08);

    // エンジン音量（アイドリング時は控えめ、加速・高速時に存在感アップ）
    const baseEngineGain = isSports ? 0.088 : 0.078;
    const targetEngineGain =
      baseEngineGain + throttle * 0.055 + speedNorm * 0.048;
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.06);

    // タイヤ走行音・風切りロードノイズ
    const roadNorm = Math.min(1, speedKmh / 120);
    const targetRoadGain = roadNorm > 0.03 ? roadNorm * roadNorm * 0.095 : 0.0001;
    const targetRoadFreq = 320 + roadNorm * 820;
    this.roadFilter.frequency.setTargetAtTime(targetRoadFreq, now, 0.08);
    this.roadGain.gain.setTargetAtTime(targetRoadGain, now, 0.09);

    // 一定速度以上（>= 18 km/h）からの急ブレーキ／ハンドブレーキ時に短いタイヤスキッド音
    const isHardBraking =
      !frame.isReversing &&
      speedKmh >= 18 &&
      (frame.handbrake || brake >= 0.35);
    if (isHardBraking) {
      const skidIntensity = Math.min(
        1,
        ((speedKmh - 14) / 65) * (frame.handbrake ? 1.0 : brake),
      );
      const targetSkidGain = 0.035 + skidIntensity * 0.095;
      const targetSkidFreq = 980 + skidIntensity * 460;
      this.skidFilter.frequency.setTargetAtTime(targetSkidFreq, now, 0.04);
      this.skidGain.gain.setTargetAtTime(targetSkidGain, now, 0.03);
    } else {
      this.skidGain.gain.setTargetAtTime(0.0001, now, 0.055);
    }
  }

  /**
   * 徒歩移動中の足音テンポを更新し、Walk (~0.50s) / Run (~0.32s) 間隔で足音を鳴らす。
   */
  public updateFootsteps(
    dt: number,
    isGrounded: boolean,
    horizontalSpeed: number,
    isRunning: boolean,
  ): void {
    if (!isGrounded || horizontalSpeed < 0.35) {
      this.wasMovingOnFoot = false;
      this.footstepTimer = 0;
      return;
    }

    const interval = isRunning ? 0.32 : 0.5;

    if (!this.wasMovingOnFoot) {
      // 歩き出し直後は少し早めに1歩目を鳴らす
      this.wasMovingOnFoot = true;
      this.footstepTimer = interval * 0.65;
    }

    this.footstepTimer += dt;
    if (this.footstepTimer >= interval) {
      this.footstepTimer -= interval;
      this.playFootstep(isRunning);
    }
  }

  /** 足音ワンショット（アスファルト／歩道を踏む靴音） */
  public playFootstep(isRunning: boolean): void {
    if (!this.ctx || !this.masterGain || !this.unlocked || this.muted || this.disposed) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.footstepAlternate = !this.footstepAlternate;

    const jitter = 0.92 + Math.random() * 0.16;
    const sideTone = this.footstepAlternate ? 1.04 : 0.96;

    // 1. 地面の擦れ・靴底のアタック（バンドパスノイズ）
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      (isRunning ? 720 : 540) * jitter * sideTone,
      now,
    );
    filter.Q.setValueAtTime(1.1, now);

    const noiseGain = ctx.createGain();
    const peakNoise = isRunning ? 0.085 : 0.052;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(peakNoise, now + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.068);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.15);
    noiseSrc.start(now, offset, 0.085);

    // 2. 低い着地タップ（短いサイン波ピッチドロップ）
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'sine';
    const startFreq = (isRunning ? 128 : 102) * jitter;
    thudOsc.frequency.setValueAtTime(startFreq, now);
    thudOsc.frequency.exponentialRampToValueAtTime(42, now + 0.05);

    const thudGain = ctx.createGain();
    const peakThud = isRunning ? 0.095 : 0.058;
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(peakThud, now + 0.005);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.06);
  }

  /** ジャンプ着地音ワンショット */
  public playLanding(impactSpeed: number): void {
    if (!this.ctx || !this.masterGain || !this.unlocked || this.muted || this.disposed) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const intensity = Math.max(0.35, Math.min(1, impactSpeed / 9.0));

    // 低音インパクト
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(115 + intensity * 25, now);
    thudOsc.frequency.exponentialRampToValueAtTime(34, now + 0.1);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(0.14 * intensity, now + 0.008);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.115);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.125);

    // 砂利・舗装の着地ノイズ
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(820, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.1 * intensity, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.2);
    noiseSrc.start(now, offset, 0.13);
  }

  /** 建物・他車両との衝突衝撃音ワンショット */
  public playVehicleImpact(impactSpeed: number): void {
    if (!this.ctx || !this.masterGain || !this.unlocked || this.muted || this.disposed) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const nowMs = performance.now();
    if (nowMs - this.lastImpactTimeMs < 220) return;
    this.lastImpactTimeMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const intensity = Math.max(0.25, Math.min(1, impactSpeed / 14.0));

    // 1. ボディの鈍い低音衝撃
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(135 + intensity * 40, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(32, now + 0.18);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(0.28 * intensity, now + 0.006);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.24);

    // 2. 金属・バンパー衝突クラッシュノイズ
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100 + intensity * 900, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.2);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.24 * intensity, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.3);
    noiseSrc.start(now, offset, 0.26);
  }

  public dispose(): void {
    this.disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    const stopSafely = (node: { stop: () => void } | null) => {
      if (!node) return;
      try {
        node.stop();
      } catch {
        // 既に停止済み
      }
    };

    stopSafely(this.ambientSource);
    stopSafely(this.ambientLfo);
    stopSafely(this.engineOsc1);
    stopSafely(this.engineOsc2);
    stopSafely(this.engineSubOsc);
    stopSafely(this.enginePulseLfo);
    stopSafely(this.roadSource);
    stopSafely(this.skidSource);

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      void ctx.close().catch(() => {});
    }
  }

  private markUnlocked(): void {
    if (this.unlocked || this.disposed) return;
    this.unlocked = true;
    this.applyMasterGain();
    this.emitState();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0.0 : 0.85;
    this.masterGain.gain.setTargetAtTime(target, now, 0.03);
  }

  private emitState(): void {
    this.onStateChange?.(this.getState());
  }

  /**
   * 初期化時に1回だけ全常設ノードを構築する（毎フレームの新規生成ゼロ）。
   */
  private buildPersistentGraph(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // マスターゲイン
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.muted ? 0.0 : 0.85, now);
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    // 共有ノイズバッファ生成（2.5秒ホワイトノイズ・3.0秒ピンクノイズ）
    this.whiteNoiseBuffer = createWhiteNoiseBuffer(ctx, 2.5);
    this.pinkNoiseBuffer = createPinkNoiseBuffer(ctx, 3.0);

    // --- 1. 街の環境音（遠い風と都市の気配、ごく控えめな音量で常時ループ） ---
    const ambientSource = ctx.createBufferSource();
    ambientSource.buffer = this.pinkNoiseBuffer;
    ambientSource.loop = true;

    const ambientWindFilter = ctx.createBiquadFilter();
    ambientWindFilter.type = 'lowpass';
    ambientWindFilter.frequency.setValueAtTime(340, now);
    ambientWindFilter.Q.setValueAtTime(0.7, now);

    const ambientLfo = ctx.createOscillator();
    ambientLfo.type = 'sine';
    ambientLfo.frequency.setValueAtTime(0.11, now);
    const ambientLfoDepth = ctx.createGain();
    ambientLfoDepth.gain.setValueAtTime(110, now);
    ambientLfo.connect(ambientLfoDepth);
    ambientLfoDepth.connect(ambientWindFilter.frequency);

    const ambientGain = ctx.createGain();
    ambientGain.gain.setValueAtTime(0.048, now);

    ambientSource.connect(ambientWindFilter);
    ambientWindFilter.connect(ambientGain);
    ambientGain.connect(masterGain);

    ambientSource.start(now);
    ambientLfo.start(now);

    this.ambientSource = ambientSource;
    this.ambientLfo = ambientLfo;

    // --- 2. 車両エンジン音（オシレーター3基 + 脈動LFO + ローパスフィルター） ---
    const engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.setValueAtTime(48, now);

    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'triangle';
    engineOsc2.frequency.setValueAtTime(96, now);

    const engineSubOsc = ctx.createOscillator();
    engineSubOsc.type = 'sine';
    engineSubOsc.frequency.setValueAtTime(24, now);

    const osc1Mix = ctx.createGain();
    osc1Mix.gain.setValueAtTime(0.52, now);
    const osc2Mix = ctx.createGain();
    osc2Mix.gain.setValueAtTime(0.34, now);
    const subMix = ctx.createGain();
    subMix.gain.setValueAtTime(0.45, now);

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(240, now);
    engineFilter.Q.setValueAtTime(1.5, now);

    const engineGain = ctx.createGain();
    engineGain.gain.setValueAtTime(0.0001, now);

    // アイドリング時の鼓動感用 LFO
    const enginePulseLfo = ctx.createOscillator();
    enginePulseLfo.type = 'sine';
    enginePulseLfo.frequency.setValueAtTime(11, now);
    const enginePulseGain = ctx.createGain();
    enginePulseGain.gain.setValueAtTime(0.0, now);
    enginePulseLfo.connect(enginePulseGain);
    enginePulseGain.connect(engineGain.gain);

    engineOsc1.connect(osc1Mix);
    engineOsc2.connect(osc2Mix);
    engineSubOsc.connect(subMix);
    osc1Mix.connect(engineFilter);
    osc2Mix.connect(engineFilter);
    subMix.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc1.start(now);
    engineOsc2.start(now);
    engineSubOsc.start(now);
    enginePulseLfo.start(now);

    this.engineOsc1 = engineOsc1;
    this.engineOsc2 = engineOsc2;
    this.engineSubOsc = engineSubOsc;
    this.enginePulseLfo = enginePulseLfo;
    this.enginePulseGain = enginePulseGain;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;

    // --- 2b. 車両ロードノイズ（走行時のタイヤ・風切り音） ---
    const roadSource = ctx.createBufferSource();
    roadSource.buffer = this.pinkNoiseBuffer;
    roadSource.loop = true;

    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.setValueAtTime(420, now);
    roadFilter.Q.setValueAtTime(0.8, now);

    const roadGain = ctx.createGain();
    roadGain.gain.setValueAtTime(0.0001, now);

    roadSource.connect(roadFilter);
    roadFilter.connect(roadGain);
    roadGain.connect(masterGain);
    roadSource.start(now);

    this.roadSource = roadSource;
    this.roadFilter = roadFilter;
    this.roadGain = roadGain;

    // --- 3. 急ブレーキ時のタイヤスキッド音（常設） ---
    const skidSource = ctx.createBufferSource();
    skidSource.buffer = this.whiteNoiseBuffer;
    skidSource.loop = true;

    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.setValueAtTime(1150, now);
    skidFilter.Q.setValueAtTime(4.8, now);

    const skidGain = ctx.createGain();
    skidGain.gain.setValueAtTime(0.0001, now);

    skidSource.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(masterGain);
    skidSource.start(now);

    this.skidSource = skidSource;
    this.skidFilter = skidFilter;
    this.skidGain = skidGain;
  }
}

function createWhiteNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Paul Kellet 近似ピンクノイズ（自然で柔らかい都市環境音・ロードノイズ向け）
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = Math.max(-1, Math.min(1, pink));
  }

  // ループ継ぎ目のプチノイズ防止（先頭・末尾 256 サンプルをクロスフェード）
  const fadeSamples = Math.min(256, Math.floor(sampleCount / 8));
  for (let i = 0; i < fadeSamples; i += 1) {
    const t = i / fadeSamples;
    const endIdx = sampleCount - fadeSamples + i;
    data[endIdx] = data[endIdx] * (1 - t) + data[i] * t;
  }

  return buffer;
}
