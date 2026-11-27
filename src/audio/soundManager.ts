import {
  VEHICLE_ENGINE_AUDIO_PROFILES,
  type VehicleAudioProfile,
} from '../vehicle/vehicleConfig';

export type { VehicleAudioProfile };

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
  private engineOsc1Mix: GainNode | null = null;
  private engineOsc2Mix: GainNode | null = null;
  private engineHarmonicMix: GainNode | null = null;
  private engineHighpass: BiquadFilterNode | null = null;
  private engineMidBoost: BiquadFilterNode | null = null;
  private enginePulseLfo: OscillatorNode | null = null;
  private enginePulseGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private currentEngineProfile: VehicleAudioProfile | null = null;

  private roadSource: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;

  // 3. タイヤスキッド音（常設）
  private skidSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  // 4. 5-A: 雨音（天候が RAIN の間だけループ再生し、他天候でフェードアウト停止）
  private rainActive = false;
  private rainBodyHighpass: BiquadFilterNode | null = null;
  private rainPatterFilter: BiquadFilterNode | null = null;
  private rainMasterGain: GainNode | null = null;
  private rainLfo: OscillatorNode | null = null;
  private rainBodySource: AudioBufferSourceNode | null = null;
  private rainPatterSource: AudioBufferSourceNode | null = null;
  private rainStopTimerId: number | null = null;

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
      !this.engineOsc1Mix ||
      !this.engineOsc2Mix ||
      !this.engineHarmonicMix ||
      !this.engineHighpass ||
      !this.engineMidBoost ||
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

    const tuning = VEHICLE_ENGINE_AUDIO_PROFILES[frame.profile];

    // 車種プロファイルが変わったときのみ波形・倍音ミックス・固定フィルター特性を切替
    if (this.currentEngineProfile !== frame.profile) {
      this.engineOsc1.type = tuning.osc1Type;
      this.engineOsc2.type = tuning.osc2Type;
      this.engineHarmonicOsc.type = tuning.harmonicOscType;
      this.enginePulseLfo.type = frame.profile === 'bike' ? 'triangle' : 'sine';
      this.engineOsc1Mix.gain.setTargetAtTime(tuning.osc1Gain, now, 0.04);
      this.engineOsc2Mix.gain.setTargetAtTime(tuning.osc2Gain, now, 0.04);
      this.engineHarmonicMix.gain.setTargetAtTime(tuning.harmonicGain, now, 0.04);
      this.engineHighpass.frequency.setTargetAtTime(tuning.highpassFreq, now, 0.05);
      this.engineMidBoost.gain.setTargetAtTime(tuning.midBoostGainDb, now, 0.05);
      this.currentEngineProfile = frame.profile;
    }

    const maxKmh = Math.max(40, frame.maxSpeedKmh);
    const speedKmh = Math.max(0, frame.speedKmh);
    const speedNorm = Math.min(1, speedKmh / maxKmh);
    const throttle = Math.max(0, Math.min(1, frame.throttle));
    const brake = Math.max(0, Math.min(1, frame.brake));

    // 擬似オートマチックの回転数カーブ（滑らかな上昇＋アクセル踏み込みによる負荷ブースト）
    const revCurve = Math.pow(speedNorm, tuning.revExponent);
    const throttleBoost = throttle * tuning.throttleBoost;
    const revNorm = Math.min(tuning.maxRevNorm, revCurve + throttleBoost);

    // 車種別の基本周波数＆倍音設計（standard: 静かな実用車 / sports: 高回転スポーツカー / bike: 単気筒〜2気筒バイク）
    const baseFreq = tuning.idleFreq + (tuning.maxFreq - tuning.idleFreq) * revNorm;
    const freqTau = tuning.freqTau;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, freqTau);
    this.engineOsc2.frequency.setTargetAtTime(
      baseFreq * tuning.harmonic2Ratio,
      now,
      freqTau,
    );
    this.engineHarmonicOsc.frequency.setTargetAtTime(
      baseFreq * tuning.harmonic3Ratio,
      now,
      freqTau,
    );

    // アイドリング時の鼓動感（バイクは単気筒〜2気筒らしい歯切れよい鼓動を低〜中速域まで維持）
    const isBike = frame.profile === 'bike';
    const idlePulseRate =
      tuning.idlePulseBaseRate +
      (isBike ? revNorm : speedNorm) * tuning.idlePulseSpeedScale;
    const pulseFade = isBike
      ? Math.max(0.22, 1 - Math.min(1, speedNorm * 1.4))
      : 1 - Math.min(1, speedNorm * 2.5);
    const idlePulseDepth = pulseFade * tuning.idlePulseDepth;
    this.enginePulseLfo.frequency.setTargetAtTime(idlePulseRate, now, 0.08);
    this.enginePulseGain.gain.setTargetAtTime(idlePulseDepth, now, 0.08);

    // ローパスフィルター開度（standard は 220Hz〜420Hz に抑制、sports は 680Hz〜2600Hz で伸びる）
    const filterFactor = Math.min(
      1,
      revNorm * tuning.filterRevWeight + throttle * tuning.filterThrottleWeight,
    );
    const targetFilterFreq =
      tuning.filterMin + (tuning.filterMax - tuning.filterMin) * filterFactor;
    this.engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.06);
    this.engineFilter.Q.setTargetAtTime(tuning.filterQ, now, 0.08);

    // エンジン音量（standard は全開時でも甲高く唸らず控えめに、sports は迫力維持）
    const targetEngineGain =
      tuning.engineBaseGain +
      throttle * tuning.engineThrottleGain +
      speedNorm * tuning.engineSpeedGain;
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.06);

    // タイヤ走行音・風切りロードノイズ（standard では走行時の主体となるバランス）
    const roadNorm = Math.min(1, speedKmh / tuning.roadSpeedRefKmh);
    const targetRoadGain =
      roadNorm > 0.03
        ? Math.pow(roadNorm, tuning.roadExponent) * tuning.roadGainScale
        : 0.0001;
    const targetRoadFreq =
      tuning.roadFreqMin + (tuning.roadFreqMax - tuning.roadFreqMin) * roadNorm;
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

  /** 建物・ガードレール・街灯・他車両との金属衝突衝撃音ワンショット（速度・入射角連動） */
  public playVehicleImpact(impactSpeed: number, incidence = 1.0): void {
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
    if (nowMs - this.lastImpactTimeMs < 200) return;
    this.lastImpactTimeMs = nowMs;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const clampedInc = Math.max(0.25, Math.min(1, incidence));
    const intensity = Math.max(
      0.22,
      Math.min(1, (impactSpeed / 18.0) * (0.55 + 0.45 * clampedInc)),
    );

    // 1. ボディの低中音インパクト（240Hz → 72Hz）
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(240 + intensity * 75, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(72, now + 0.19);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(0.52 * intensity, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.26);

    // 2. 金属ボディの歪み・クラッシュリンギング（高次倍音ペア）
    const metalOsc1 = ctx.createOscillator();
    metalOsc1.type = 'sawtooth';
    metalOsc1.frequency.setValueAtTime(520 + intensity * 260, now);
    metalOsc1.frequency.exponentialRampToValueAtTime(195, now + 0.14);

    const metalFilter = ctx.createBiquadFilter();
    metalFilter.type = 'bandpass';
    metalFilter.frequency.setValueAtTime(1250 + intensity * 650, now);
    metalFilter.Q.setValueAtTime(3.2, now);

    const metalGain = ctx.createGain();
    metalGain.gain.setValueAtTime(0.0001, now);
    metalGain.gain.linearRampToValueAtTime(0.28 * intensity, now + 0.004);
    metalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    metalOsc1.connect(metalFilter);
    metalFilter.connect(metalGain);
    metalGain.connect(this.masterGain);
    metalOsc1.start(now);
    metalOsc1.stop(now + 0.18);

    // 3. 金属・バンパー衝突クラッシュノイズ
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + intensity * 1200, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.22);
    filter.Q.setValueAtTime(0.85, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.46 * intensity, now + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const offset = Math.random() * Math.max(0.1, this.whiteNoiseBuffer.duration - 0.35);
    noiseSrc.start(now, offset, 0.29);
  }

  /**
   * 5-B: 車両発火カウントダウン（約2.5秒間）の緊急警告音（ピピピピ…）。
   * urgency01 (0..1) が高まるほど音程がわずかに上がり緊迫感を演出する。
   */
  public playFireWarningBeep(urgency01 = 0): void {
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

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const u = Math.max(0, Math.min(1, urgency01));
    const baseFreq = 1120 + u * 340;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(baseFreq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.15, now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    const dur = Math.max(0.055, 0.095 - u * 0.032);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.015);
  }

  /**
   * 5-B / 5-B2: 車両大爆発の衝撃音（重低音サブベース＋爆風ローパス轟音＋破片クラック、距離減衰付き）。
   */
  public playExplosion(distanceMeters = 0): void {
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
    if (!this.pinkNoiseBuffer || !this.whiteNoiseBuffer) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const atten = Math.max(0.16, Math.min(1, 1 / (1 + Math.max(0, distanceMeters - 6) * 0.03)));

    // 1a. 重低音サブベース・パンチ (84Hz -> 24Hz)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(84, now);
    subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.62);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.95 * atten, now + 0.01);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.88);

    // 1b. 中低音ブラストドロップ (175Hz -> 36Hz、iPad 内蔵スピーカーでも迫力が出る帯域)
    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'triangle';
    boomOsc.frequency.setValueAtTime(175, now);
    boomOsc.frequency.exponentialRampToValueAtTime(36, now + 0.54);

    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.linearRampToValueAtTime(0.86 * atten, now + 0.012);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.76);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(now);
    boomOsc.stop(now + 0.8);

    // 2. 轟音テール（ピンクノイズのローパス掃引 2400Hz -> 130Hz）
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = this.pinkNoiseBuffer;

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(2400, now);
    rumbleFilter.frequency.exponentialRampToValueAtTime(130, now + 1.55);
    rumbleFilter.Q.setValueAtTime(1.25, now);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.88 * atten, now + 0.016);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.72);

    rumbleSrc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    rumbleSrc.start(now, 0.1, 1.8);

    // 3. 破片・閃光の瞬間アタック（ホワイトノイズ高域）
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = this.whiteNoiseBuffer;

    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2600, now);
    crackFilter.frequency.exponentialRampToValueAtTime(480, now + 0.36);
    crackFilter.Q.setValueAtTime(0.75, now);

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.linearRampToValueAtTime(0.6 * atten, now + 0.004);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.masterGain);
    crackSrc.start(now, 0.2, 0.42);
  }

  /**
   * 5-B2: 爆発で跳ね上がった車体が地面にドスンと落下する際の金属着地音（距離減衰付き）。
   */
  public playBlastThud(distanceMeters = 0): void {
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
    const atten = Math.max(0.12, Math.min(1, 1 / (1 + Math.max(0, distanceMeters - 6) * 0.04)));

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.55 * atten, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(760, now);
    filter.Q.setValueAtTime(1.1, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.linearRampToValueAtTime(0.32 * atten, now + 0.006);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    noiseSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.masterGain);
    noiseSrc.start(now, 0.15, 0.24);
  }

  /**
   * 4-B: コイン獲得音（軽快な2音チャイム: B5 -> E6、iPad 内蔵スピーカー最適化・低遅延）。
   */
  public playCoinCollect(): void {
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

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1音目: B5 (987.77 Hz)
    this.scheduleTone(ctx, 'triangle', 987.77, now, 0.085, 0.28);
    this.scheduleTone(ctx, 'sine', 1975.53, now, 0.065, 0.09);

    // 2音目: E6 (1318.51 Hz) — 明るく伸びる2音目
    const t2 = now + 0.064;
    this.scheduleTone(ctx, 'triangle', 1318.51, t2, 0.25, 0.32);
    this.scheduleTone(ctx, 'sine', 2637.02, t2, 0.19, 0.11);
  }

  /**
   * 4-B: タイムアタック START / チェックポイント通過音。
   */
  public playCheckpointPass(isStart = false): void {
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

    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (isStart) {
      // START ゲート通過: 勢いのある3音スタートチャイム (C5 -> G5 -> C6)
      this.scheduleTone(ctx, 'triangle', 523.25, now, 0.09, 0.26);
      this.scheduleTone(ctx, 'triangle', 783.99, now + 0.065, 0.1, 0.28);
      this.scheduleTone(ctx, 'triangle', 1046.5, now + 0.13, 0.28, 0.34);
      this.scheduleTone(ctx, 'sine', 2093.0, now + 0.13, 0.22, 0.12);
    } else {
      // チェックポイント通過: 爽やかな上昇チャイム (E5 -> A5 -> C#6)
      this.scheduleTone(ctx, 'triangle', 659.25, now, 0.08, 0.24);
      this.scheduleTone(ctx, 'triangle', 880.0, now + 0.055, 0.1, 0.27);
      this.scheduleTone(ctx, 'sine', 1108.73, now + 0.11, 0.22, 0.26);
    }
  }

  /**
   * 4-B: タイムアタックゴール時のファンファーレ音（自己ベスト更新時は高音きらめき追加）。
   */
  public playTimeAttackGoal(isNewRecord = false): void {
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

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 明るいファンファーレ・アルペジオ (C5 -> E5 -> G5 -> C6 和音)
    this.scheduleTone(ctx, 'triangle', 523.25, now, 0.12, 0.26);
    this.scheduleTone(ctx, 'triangle', 659.25, now + 0.09, 0.12, 0.28);
    this.scheduleTone(ctx, 'triangle', 783.99, now + 0.18, 0.14, 0.3);

    // ゴール和音（C5 + E5 + G5 + C6 の豊かな広がり）
    const chordStart = now + 0.28;
    this.scheduleTone(ctx, 'triangle', 523.25, chordStart, 0.62, 0.2);
    this.scheduleTone(ctx, 'triangle', 659.25, chordStart, 0.62, 0.2);
    this.scheduleTone(ctx, 'triangle', 783.99, chordStart, 0.62, 0.22);
    this.scheduleTone(ctx, 'triangle', 1046.5, chordStart, 0.72, 0.3);
    this.scheduleTone(ctx, 'sine', 1567.98, chordStart + 0.02, 0.56, 0.12);

    if (isNewRecord) {
      // 自己ベスト更新時の追加きらめき (E6 -> G6)
      this.scheduleTone(ctx, 'sine', 1318.51, chordStart + 0.18, 0.24, 0.2);
      this.scheduleTone(ctx, 'sine', 1567.98, chordStart + 0.3, 0.45, 0.24);
    }
  }

  /**
   * 4-B: 車体復帰（スタック脱出）時の軽快なフィードバック音。
   */
  public playVehicleRecover(): void {
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

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** ワンショット効果音用の軽量オシレーター再生ヘルパー */
  private scheduleTone(
    ctx: AudioContext,
    type: OscillatorType,
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.masterGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    const attack = Math.min(0.012, duration * 0.2);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.015);
  }

  /**
   * 5-A: 雨天（RAIN）の間だけノイズフィルタによる軽量な雨音をループ再生し、
   * 他の天候に切り替わったら滑らかにフェードアウトして完全停止する。
   * 既存の iPad WebKit 同期アンロック済み AudioContext・ミュート設定と連動。
   */
  public setRainActive(active: boolean): void {
    if (this.rainActive === active) return;
    this.rainActive = active;
    this.syncRainPlayback();
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rainStopTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.rainStopTimerId);
      this.rainStopTimerId = null;
    }
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
    stopSafely(this.rainBodySource);
    stopSafely(this.rainPatterSource);
    stopSafely(this.rainLfo);
    this.rainBodySource = null;
    this.rainPatterSource = null;

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
      this.syncRainPlayback();
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

    // --- 2. 車両エンジン音（初期プロファイル: standard＝静かな実用車、sports 乗車時に動的切替） ---
    const initialTuning = VEHICLE_ENGINE_AUDIO_PROFILES.standard;

    const engineOsc1 = ctx.createOscillator();
    engineOsc1.type = initialTuning.osc1Type;
    engineOsc1.frequency.setValueAtTime(initialTuning.idleFreq, now);

    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = initialTuning.osc2Type;
    engineOsc2.frequency.setValueAtTime(
      initialTuning.idleFreq * initialTuning.harmonic2Ratio,
      now,
    );

    const engineHarmonicOsc = ctx.createOscillator();
    engineHarmonicOsc.type = initialTuning.harmonicOscType;
    engineHarmonicOsc.frequency.setValueAtTime(
      initialTuning.idleFreq * initialTuning.harmonic3Ratio,
      now,
    );

    const osc1Mix = ctx.createGain();
    osc1Mix.gain.setValueAtTime(initialTuning.osc1Gain, now);
    const osc2Mix = ctx.createGain();
    osc2Mix.gain.setValueAtTime(initialTuning.osc2Gain, now);
    const harmonicMix = ctx.createGain();
    harmonicMix.gain.setValueAtTime(initialTuning.harmonicGain, now);

    const engineHighpass = ctx.createBiquadFilter();
    engineHighpass.type = 'highpass';
    engineHighpass.frequency.setValueAtTime(initialTuning.highpassFreq, now);
    engineHighpass.Q.setValueAtTime(0.7, now);

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(initialTuning.filterMin, now);
    engineFilter.Q.setValueAtTime(initialTuning.filterQ, now);

    const engineMidBoost = ctx.createBiquadFilter();
    engineMidBoost.type = 'peaking';
    engineMidBoost.frequency.setValueAtTime(420, now);
    engineMidBoost.Q.setValueAtTime(1.0, now);
    engineMidBoost.gain.setValueAtTime(initialTuning.midBoostGainDb, now);

    const engineGain = ctx.createGain();
    engineGain.gain.setValueAtTime(0.0001, now);

    // アイドリング時の鼓動感用 LFO
    const enginePulseLfo = ctx.createOscillator();
    enginePulseLfo.type = 'sine';
    enginePulseLfo.frequency.setValueAtTime(initialTuning.idlePulseBaseRate, now);
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
    this.engineOsc1Mix = osc1Mix;
    this.engineOsc2Mix = osc2Mix;
    this.engineHarmonicMix = harmonicMix;
    this.engineHighpass = engineHighpass;
    this.engineMidBoost = engineMidBoost;
    this.enginePulseLfo = enginePulseLfo;
    this.enginePulseGain = enginePulseGain;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;
    this.currentEngineProfile = 'standard';

    // --- 2b. 車両ロードノイズ（走行時のタイヤ・風切り音） ---
    const roadSource = ctx.createBufferSource();
    roadSource.buffer = this.pinkNoiseBuffer;
    roadSource.loop = true;

    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.setValueAtTime(initialTuning.roadFreqMin, now);
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

    // --- 4. 5-A: 雨音フィルターバス（ソース自体は雨天時のみ起動・晴天時は完全停止） ---
    const rainMasterGain = ctx.createGain();
    rainMasterGain.gain.setValueAtTime(0.0001, now);
    rainMasterGain.connect(masterGain);

    // ベース雨音（ピンクノイズ: 420Hz〜2900Hz、穏やかな LFO 揺らぎ付き）
    const rainBodyHighpass = ctx.createBiquadFilter();
    rainBodyHighpass.type = 'highpass';
    rainBodyHighpass.frequency.setValueAtTime(420, now);
    rainBodyHighpass.Q.setValueAtTime(0.65, now);

    const rainBodyLowpass = ctx.createBiquadFilter();
    rainBodyLowpass.type = 'lowpass';
    rainBodyLowpass.frequency.setValueAtTime(2900, now);
    rainBodyLowpass.Q.setValueAtTime(0.7, now);

    const rainLfo = ctx.createOscillator();
    rainLfo.type = 'sine';
    rainLfo.frequency.setValueAtTime(0.16, now);
    const rainLfoDepth = ctx.createGain();
    rainLfoDepth.gain.setValueAtTime(380, now);
    rainLfo.connect(rainLfoDepth);
    rainLfoDepth.connect(rainBodyLowpass.frequency);
    rainLfo.start(now);

    const rainBodyGain = ctx.createGain();
    rainBodyGain.gain.setValueAtTime(0.3, now);

    rainBodyHighpass.connect(rainBodyLowpass);
    rainBodyLowpass.connect(rainBodyGain);
    rainBodyGain.connect(rainMasterGain);

    // 高域の雨粒感（ホワイトノイズ: 2400Hz バンドパス）
    const rainPatterFilter = ctx.createBiquadFilter();
    rainPatterFilter.type = 'bandpass';
    rainPatterFilter.frequency.setValueAtTime(2400, now);
    rainPatterFilter.Q.setValueAtTime(1.1, now);

    const rainPatterGain = ctx.createGain();
    rainPatterGain.gain.setValueAtTime(0.085, now);

    rainPatterFilter.connect(rainPatterGain);
    rainPatterGain.connect(rainMasterGain);

    this.rainBodyHighpass = rainBodyHighpass;
    this.rainPatterFilter = rainPatterFilter;
    this.rainMasterGain = rainMasterGain;
    this.rainLfo = rainLfo;

    if (this.rainActive) {
      this.syncRainPlayback();
    }
  }

  private syncRainPlayback(): void {
    if (
      this.disposed ||
      !this.ctx ||
      !this.rainMasterGain ||
      !this.rainBodyHighpass ||
      !this.rainPatterFilter ||
      !this.pinkNoiseBuffer ||
      !this.whiteNoiseBuffer
    ) {
      return;
    }

    if (this.rainStopTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.rainStopTimerId);
      this.rainStopTimerId = null;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.rainActive) {
      if (!this.rainBodySource) {
        const bodySrc = ctx.createBufferSource();
        bodySrc.buffer = this.pinkNoiseBuffer;
        bodySrc.loop = true;
        bodySrc.connect(this.rainBodyHighpass);
        bodySrc.start(now, 0.35);
        this.rainBodySource = bodySrc;
      }
      if (!this.rainPatterSource) {
        const patterSrc = ctx.createBufferSource();
        patterSrc.buffer = this.whiteNoiseBuffer;
        patterSrc.loop = true;
        patterSrc.connect(this.rainPatterFilter);
        patterSrc.start(now, 0.7);
        this.rainPatterSource = patterSrc;
      }

      this.rainMasterGain.gain.cancelScheduledValues(now);
      this.rainMasterGain.gain.setTargetAtTime(1.0, now, 0.32);
    } else {
      this.rainMasterGain.gain.cancelScheduledValues(now);
      this.rainMasterGain.gain.setTargetAtTime(0.0001, now, 0.22);

      if (this.rainBodySource || this.rainPatterSource) {
        if (typeof window !== 'undefined') {
          this.rainStopTimerId = window.setTimeout(() => {
            this.rainStopTimerId = null;
            if (!this.rainActive) {
              this.stopRainSources();
            }
          }, 800);
        } else {
          this.stopRainSources();
        }
      }
    }
  }

  private stopRainSources(): void {
    if (this.rainBodySource) {
      try {
        this.rainBodySource.stop();
        this.rainBodySource.disconnect();
      } catch {
        // 既に停止済み
      }
      this.rainBodySource = null;
    }
    if (this.rainPatterSource) {
      try {
        this.rainPatterSource.stop();
        this.rainPatterSource.disconnect();
      } catch {
        // 既に停止済み
      }
      this.rainPatterSource = null;
    }
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
