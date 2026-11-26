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
  const win = window as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

const MASTER_GAIN_LEVEL = 1.0;

/**
 * 作業ID 3-D: iPadOS Safari 対応・外部音声ファイル不要の手続き型 Web Audio エンジン。
 *
 * - エンジン音・走行音・スキッド音・街の環境音は初期化時に1回だけ常設ノードグラフを構築し、
 *   毎フレームは setTargetAtTime によるパラメータ更新のみを行う（M1 iPad Air 60FPS 維持）。
 * - iPadOS Safari の音声制限解除のため、ユーザー操作の同期コールバック内で
 *   AudioContext 生成・resume()・短い確認チャイム音の oscillator.start() を一括実行し、
 *   ctx.state === 'running' になるまで再試行する。
 * - iPad 内蔵スピーカーは 80Hz 以下の超低音が聞こえにくいため、中音域（150Hz〜1200Hz）の
 *   倍音バランスとマスターゲイン＋軽量コンプレッサーを最適化している。
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
  private engineHarmonicOsc: OscillatorNode | null = null;
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
  private unlockChimePlayed = false;
  private lastChimeTimeMs = -1000;
  private disposed = false;
  private onStateChange?: (state: SoundStateSnapshot) => void;

  // 足音・衝突クールダウン管理
  private footstepTimer = 0;
  private wasMovingOnFoot = false;
  private footstepAlternate = false;
  private lastImpactTimeMs = -1000;

  // バックグラウンド遷移・AudioContext 状態監視ハンドラ
  private readonly handleVisibilityChange: () => void;
  private readonly handleContextStateChange: () => void;

  constructor(onStateChange?: (state: SoundStateSnapshot) => void) {
    this.onStateChange = onStateChange;

    this.handleContextStateChange = () => {
      this.syncUnlockedState();
    };

    this.handleVisibilityChange = () => {
      if (!this.ctx || this.disposed) return;
      if (document.hidden) {
        if (this.ctx.state === 'running') {
          void this.ctx.suspend().catch(() => {});
        }
      } else if (!this.muted && this.ctx.state !== 'running') {
        void this.ctx
          .resume()
          .then(() => {
            this.syncUnlockedState();
          })
          .catch(() => {});
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
    return this.unlocked && this.ctx?.state === 'running';
  }

  public getState(): SoundStateSnapshot {
    return {
      muted: this.muted,
      unlocked: this.unlocked && this.ctx?.state === 'running',
    };
  }

  /**
   * iPadOS Safari の自動再生制限解除。
   * ユーザーの初回タップ（touchstart / pointerdown / click）・スピーカーボタン押下時の
   * 同期コールバック内から呼び出し、AudioContext 生成・resume()・短い確認チャイム音の
   * oscillator.start() を同一同期ブロック内で実行する。
   * ctx.state === 'running' になるまで再試行するガード付き。
   */
  public unlock(playFeedbackChime = false): boolean {
    if (this.disposed) return false;

    const alreadyRunning =
      this.ctx !== null && this.ctx.state === 'running' && this.unlocked;
    if (alreadyRunning) {
      if (playFeedbackChime && !this.muted && this.ctx) {
        this.playConfirmationChime(this.ctx, true, true);
      }
      return true;
    }

    // 1. AudioContext 生成と常設ノードグラフ構築（同期）
    if (!this.ctx) {
      const Ctor = getAudioContextConstructor();
      if (!Ctor) return false;
      try {
        const created = new Ctor();
        created.addEventListener('statechange', this.handleContextStateChange);
        this.ctx = created;
        this.buildPersistentGraph(created);
      } catch {
        return false;
      }
    }

    const ctx = this.ctx;
    if (!ctx) return false;

    // 2. ctx.state が 'running' でなければ同期的に resume() を発行
    if (ctx.state !== 'running') {
      try {
        void ctx
          .resume()
          .then(() => {
            this.syncUnlockedState();
          })
          .catch(() => {});
      } catch {
        // Safari の状態遷移中例外を保護
      }
    }

    // 3. 同一同期ブロック内で短い確認チャイム音（440Hz→660Hz）の oscillator.start() を実行
    const shouldPlayAudibleChime =
      !this.muted && (playFeedbackChime || !this.unlockChimePlayed);
    this.playConfirmationChime(ctx, shouldPlayAudibleChime, playFeedbackChime);
    if (shouldPlayAudibleChime) {
      this.unlockChimePlayed = true;
    }

    // 4. running 状態を同期反映（未達の場合は次回タップで再試行される）
    this.syncUnlockedState();
    return this.isUnlocked();
  }

  public setMuted(nextMuted: boolean): boolean {
    const wasMuted = this.muted;
    this.muted = nextMuted;

    if (!this.muted) {
      // 音声ON切替時はフィードバック音が減衰されないよう即座にマスターゲインを復帰
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(MASTER_GAIN_LEVEL, now);
      }
      // 確実なアンロック＋短いフィードバック音（440Hz→660Hz）を発音
      this.unlock(wasMuted || !this.unlockChimePlayed);
    } else {
      this.applyMasterGain();
    }

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
    if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked || this.disposed) {
      return;
    }
    if (
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineHarmonicOsc ||
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

    // 車種別の基本周波数＆iPad内蔵スピーカーで明確に聞こえる中音域（150Hz〜1200Hz）倍音設計
    const idleFreq = isSports ? 86 : 68;
    const maxFreq = isSports ? 295 : 215;
    const baseFreq = idleFreq + (maxFreq - idleFreq) * revNorm;
    const harmonic2Ratio = isSports ? 2.02 : 2.0;
    const harmonic3Ratio = isSports ? 3.03 : 3.01;

    const freqTau = isSports ? 0.045 : 0.065;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, freqTau);
    this.engineOsc2.frequency.setTargetAtTime(
      baseFreq * harmonic2Ratio,
      now,
      freqTau,
    );
    this.engineHarmonicOsc.frequency.setTargetAtTime(
      baseFreq * harmonic3Ratio,
      now,
      freqTau,
    );

    // アイドリング時の低い鼓動感（低速ほど脈動、高速で滑らかに連続音へ）
    const idlePulseRate = isSports ? 14 + speedNorm * 22 : 10 + speedNorm * 16;
    const idlePulseDepth =
      (1 - Math.min(1, speedNorm * 2.5)) * (isSports ? 0.055 : 0.045);
    this.enginePulseLfo.frequency.setTargetAtTime(idlePulseRate, now, 0.08);
    this.enginePulseGain.gain.setTargetAtTime(idlePulseDepth, now, 0.08);

    // ローパスフィルター開度（中音域の倍音をしっかり通す設定）
    const filterMin = isSports ? 680 : 500;
    const filterMax = isSports ? 2600 : 1800;
    const targetFilterFreq =
      filterMin +
      (filterMax - filterMin) * Math.min(1, revNorm * 0.85 + throttle * 0.28);
    this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);
    this.engineFilter.Q.setTargetAtTime(isSports ? 2.4 : 1.7, now, 0.08);

    // エンジン音量（通常の端末音量で明確に聞こえるレベル）
    const baseEngineGain = isSports ? 0.3 : 0.26;
    const targetEngineGain =
      baseEngineGain + throttle * 0.15 + speedNorm * 0.11;
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.06);

    // タイヤ走行音・風切りロードノイズ（中音域 480Hz〜1150Hz）
    const roadNorm = Math.min(1, speedKmh / 120);
    const targetRoadGain = roadNorm > 0.03 ? roadNorm * roadNorm * 0.24 : 0.0001;
    const targetRoadFreq = 480 + roadNorm * 680;
    this.roadFilter.frequency.setTargetAtTime(targetRoadFreq, now, 0.08);
    this.roadGain.gain.setTargetAtTime(targetRoadGain, now, 0.09);

    // 一定速度以上（>= 18 km/h）からの急ブレーキ／ハンドブレーキ時にタイヤスキッド音
    const isHardBraking =
      !frame.isReversing &&
      speedKmh >= 18 &&
      (frame.handbrake || brake >= 0.35);
    if (isHardBraking) {
      const skidIntensity = Math.min(
        1,
        ((speedKmh - 14) / 65) * (frame.handbrake ? 1.0 : brake),
      );
      const targetSkidGain = 0.15 + skidIntensity * 0.25;
      const targetSkidFreq = 920 + skidIntensity * 520;
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

  /** 足音ワンショット（アスファルト／歩道を踏む靴音、iPad スピーカー中音域最適化） */
  public playFootstep(isRunning: boolean): void {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.masterGain ||
      !this.unlocked ||
      this.muted ||
      this.disposed
    ) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.footstepAlternate = !this.footstepAlternate;

    const jitter = 0.92 + Math.random() * 0.16;
    const sideTone = this.footstepAlternate ? 1.04 : 0.96;

    // 1. 地面の擦れ・靴底のアタック（中音域バンドパスノイズ 680Hz〜1100Hz）
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      (isRunning ? 980 : 760) * jitter * sideTone,
      now,
    );
    filter.Q.setValueAtTime(1.2, now);

    const noiseGain = ctx.createGain();
    const peakNoise = isRunning ? 0.34 : 0.24;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(peakNoise, now + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.072);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.15);
    noiseSrc.start(now, offset, 0.088);

    // 2. 靴底の着地タップ（iPad スピーカーで明確に鳴る 190Hz〜240Hz → 95Hz ピッチドロップ）
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'triangle';
    const startFreq = (isRunning ? 235 : 190) * jitter;
    thudOsc.frequency.setValueAtTime(startFreq, now);
    thudOsc.frequency.exponentialRampToValueAtTime(95, now + 0.052);

    const thudGain = ctx.createGain();
    const peakThud = isRunning ? 0.36 : 0.26;
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(peakThud, now + 0.005);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.058);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.064);
  }

  /** ジャンプ着地音ワンショット */
  public playLanding(impactSpeed: number): void {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.masterGain ||
      !this.unlocked ||
      this.muted ||
      this.disposed
    ) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const intensity = Math.max(0.35, Math.min(1, impactSpeed / 9.0));

    // 中低音インパクト（215Hz → 88Hz）
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(215 + intensity * 45, now);
    thudOsc.frequency.exponentialRampToValueAtTime(88, now + 0.1);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(0.38 * intensity, now + 0.008);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.13);

    // 砂利・舗装の着地ノイズ
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.Q.setValueAtTime(0.9, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.3 * intensity, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.115);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.2);
    noiseSrc.start(now, offset, 0.135);
  }

  /** 建物・他車両との衝突衝撃音ワンショット */
  public playVehicleImpact(impactSpeed: number): void {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.masterGain ||
      !this.unlocked ||
      this.muted ||
      this.disposed
    ) {
      return;
    }
    if (!this.whiteNoiseBuffer) return;

    const nowMs = performance.now();
    if (nowMs - this.lastImpactTimeMs < 220) return;
    this.lastImpactTimeMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const intensity = Math.max(0.25, Math.min(1, impactSpeed / 14.0));

    // 1. ボディの衝撃（230Hz → 85Hz）
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(230 + intensity * 60, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(85, now + 0.18);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(0.5 * intensity, now + 0.006);
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
    filter.frequency.setValueAtTime(1500 + intensity * 900, now);
    filter.frequency.exponentialRampToValueAtTime(360, now + 0.2);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.42 * intensity, now + 0.005);
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
    stopSafely(this.engineHarmonicOsc);
    stopSafely(this.enginePulseLfo);
    stopSafely(this.roadSource);
    stopSafely(this.skidSource);

    if (this.ctx) {
      const ctx = this.ctx;
      ctx.removeEventListener('statechange', this.handleContextStateChange);
      this.ctx = null;
      void ctx.close().catch(() => {});
    }
  }

  /**
   * iPadOS Safari の同期アンロック兼・短い確認チャイム音（440Hz→660Hz）。
   * 同一ユーザー操作から touchstart / pointerdown / click が連続発火しても
   * 重複鳴動しないようデバウンスしつつ、ctx.state !== 'running' の間は
   * 常に oscillator.start() を実行して確実にロック解除する。
   */
  private playConfirmationChime(
    ctx: AudioContext,
    audible: boolean,
    bypassDebounce: boolean,
  ): void {
    const nowMs = performance.now();
    const withinDebounce = !bypassDebounce && nowMs - this.lastChimeTimeMs < 180;
    const effectiveAudible = audible && !withinDebounce;

    // 既に running かつデバウンス内なら不要
    if (ctx.state === 'running' && !effectiveAudible) {
      return;
    }

    if (effectiveAudible) {
      this.lastChimeTimeMs = nowMs;
    }

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.065);

      if (effectiveAudible) {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
        osc.connect(gain);
        gain.connect(this.masterGain ?? ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else {
        // ミュート中や連打デバウンス中でも Safari アンロック用の極小発音を実行
        gain.gain.setValueAtTime(0.0001, now);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.03);
      }
    } catch {
      // 既に停止済み・例外時は無視
    }
  }

  private syncUnlockedState(): void {
    if (this.disposed) return;
    const isRunning = this.ctx !== null && this.ctx.state === 'running';
    if (this.unlocked === isRunning) return;
    this.unlocked = isRunning;
    if (isRunning) {
      this.applyMasterGain();
    }
    this.emitState();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted ? 0.0 : MASTER_GAIN_LEVEL;
    this.masterGain.gain.setTargetAtTime(target, now, 0.025);
  }

  private emitState(): void {
    this.onStateChange?.(this.getState());
  }

  /**
   * 初期化時に1回だけ全常設ノードを構築する（毎フレームの新規生成ゼロ）。
   */
  private buildPersistentGraph(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // マスターゲイン＋軽量コンプレッサー（iPad スピーカーで音割れを防ぎつつ音圧確保）
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.muted ? 0.0 : MASTER_GAIN_LEVEL, now);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(4, now);
    compressor.attack.setValueAtTime(0.005, now);
    compressor.release.setValueAtTime(0.12, now);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);
    this.masterGain = masterGain;

    // 共有ノイズバッファ生成（2.5秒ホワイトノイズ・3.0秒ピンクノイズ）
    this.whiteNoiseBuffer = createWhiteNoiseBuffer(ctx, 2.5);
    this.pinkNoiseBuffer = createPinkNoiseBuffer(ctx, 3.0);

    // --- 1. 街の環境音（遠い風と都市の気配、iPad スピーカーで聞こえる 150Hz〜1150Hz 帯域） ---
    const ambientSource = ctx.createBufferSource();
    ambientSource.buffer = this.pinkNoiseBuffer;
    ambientSource.loop = true;

    const ambientHighpass = ctx.createBiquadFilter();
    ambientHighpass.type = 'highpass';
    ambientHighpass.frequency.setValueAtTime(140, now);
    ambientHighpass.Q.setValueAtTime(0.7, now);

    const ambientWindFilter = ctx.createBiquadFilter();
    ambientWindFilter.type = 'lowpass';
    ambientWindFilter.frequency.setValueAtTime(860, now);
    ambientWindFilter.Q.setValueAtTime(0.8, now);

    const ambientLfo = ctx.createOscillator();
    ambientLfo.type = 'sine';
    ambientLfo.frequency.setValueAtTime(0.11, now);
    const ambientLfoDepth = ctx.createGain();
    ambientLfoDepth.gain.setValueAtTime(240, now);
    ambientLfo.connect(ambientLfoDepth);
    ambientLfoDepth.connect(ambientWindFilter.frequency);

    const ambientGain = ctx.createGain();
    ambientGain.gain.setValueAtTime(0.18, now);

    ambientSource.connect(ambientHighpass);
    ambientHighpass.connect(ambientWindFilter);
    ambientWindFilter.connect(ambientGain);
    ambientGain.connect(masterGain);

    ambientSource.start(now);
    ambientLfo.start(now);

    this.ambientSource = ambientSource;
    this.ambientLfo = ambientLfo;

    // --- 2. 車両エンジン音（中音域倍音重視オシレーター3基 + 脈動LFO + フィルター） ---
    const engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.setValueAtTime(68, now);

    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.setValueAtTime(136, now);

    const engineHarmonicOsc = ctx.createOscillator();
    engineHarmonicOsc.type = 'triangle';
    engineHarmonicOsc.frequency.setValueAtTime(205, now);

    const osc1Mix = ctx.createGain();
    osc1Mix.gain.setValueAtTime(0.5, now);
    const osc2Mix = ctx.createGain();
    osc2Mix.gain.setValueAtTime(0.48, now);
    const harmonicMix = ctx.createGain();
    harmonicMix.gain.setValueAtTime(0.36, now);

    const engineHighpass = ctx.createBiquadFilter();
    engineHighpass.type = 'highpass';
    engineHighpass.frequency.setValueAtTime(105, now);
    engineHighpass.Q.setValueAtTime(0.7, now);

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(520, now);
    engineFilter.Q.setValueAtTime(1.7, now);

    const engineMidBoost = ctx.createBiquadFilter();
    engineMidBoost.type = 'peaking';
    engineMidBoost.frequency.setValueAtTime(420, now);
    engineMidBoost.Q.setValueAtTime(1.0, now);
    engineMidBoost.gain.setValueAtTime(5.0, now);

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
    engineHarmonicOsc.connect(harmonicMix);
    osc1Mix.connect(engineHighpass);
    osc2Mix.connect(engineHighpass);
    harmonicMix.connect(engineHighpass);
    engineHighpass.connect(engineFilter);
    engineFilter.connect(engineMidBoost);
    engineMidBoost.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc1.start(now);
    engineOsc2.start(now);
    engineHarmonicOsc.start(now);
    enginePulseLfo.start(now);

    this.engineOsc1 = engineOsc1;
    this.engineOsc2 = engineOsc2;
    this.engineHarmonicOsc = engineHarmonicOsc;
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
    roadFilter.frequency.setValueAtTime(520, now);
    roadFilter.Q.setValueAtTime(0.9, now);

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
    skidFilter.frequency.setValueAtTime(1100, now);
    skidFilter.Q.setValueAtTime(3.0, now);

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
