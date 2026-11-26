import * as THREE from 'three';
import type { WeatherLightingModifier } from './weather';

export type TimeOfDayMode = 'day' | 'sunset' | 'night';

export interface TimeOfDayPreset {
  mode: TimeOfDayMode;
  labelJa: string;
  labelEn: string;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyGround: THREE.Color;
  /** 曇天・雨天時の空トーン基準 */
  overcastZenith: THREE.Color;
  overcastHorizon: THREE.Color;
  overcastFog: THREE.Color;
  /** 濃霧時の霧＆空一体色 */
  denseFogColor: THREE.Color;
  sunDiscColor: THREE.Color;
  sunDiscStrength: number;
  starStrength: number;
  fogColor: THREE.Color;
  fogDensity: number;
  dirColor: THREE.Color;
  dirIntensity: number;
  /** 操作対象からの太陽光/月光オフセットベクトル */
  sunOffset: THREE.Vector3;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  envIntensity: number;
  /** 0 = 昼, 0.62 = 夕方, 1.0 = 夜（街灯・窓・信号の夜間発光強度） */
  nightFactor: number;
  /** 0 = 昼（消灯）, 0.82 = 夕方（点灯）, 1.0 = 夜（全灯） */
  headlightFactor: number;
}

export const TIME_OF_DAY_ORDER: readonly TimeOfDayMode[] = [
  'day',
  'sunset',
  'night',
];

export const TIME_OF_DAY_LABELS: Record<
  TimeOfDayMode,
  { ja: string; en: string }
> = {
  day: { ja: '昼', en: 'DAY' },
  sunset: { ja: '夕方', en: 'SUNSET' },
  night: { ja: '夜', en: 'NIGHT' },
};

const PRESETS: Record<TimeOfDayMode, TimeOfDayPreset> = {
  day: {
    mode: 'day',
    labelJa: '昼',
    labelEn: 'DAY',
    skyZenith: new THREE.Color(0x3a78c2),
    skyHorizon: new THREE.Color(0xc4ddf2),
    skyGround: new THREE.Color(0x8c9aa6),
    overcastZenith: new THREE.Color(0x7c8a99),
    overcastHorizon: new THREE.Color(0xb2bcc7),
    overcastFog: new THREE.Color(0xa6b1bd),
    denseFogColor: new THREE.Color(0xc8d3dc),
    sunDiscColor: new THREE.Color(0xfff6dc),
    sunDiscStrength: 0.75,
    starStrength: 0.0,
    fogColor: new THREE.Color(0xb8d4eb),
    fogDensity: 0.0024,
    dirColor: new THREE.Color(0xfff4e0),
    dirIntensity: 1.55,
    sunOffset: new THREE.Vector3(18, 30, 14),
    hemiSkyColor: new THREE.Color(0xdceeff),
    hemiGroundColor: new THREE.Color(0x5c6068),
    hemiIntensity: 0.72,
    envIntensity: 1.0,
    nightFactor: 0.0,
    headlightFactor: 0.0,
  },
  sunset: {
    mode: 'sunset',
    labelJa: '夕方',
    labelEn: 'SUNSET',
    skyZenith: new THREE.Color(0x2e3b6e),
    skyHorizon: new THREE.Color(0xf07a42),
    skyGround: new THREE.Color(0x52363a),
    overcastZenith: new THREE.Color(0x4c4c5d),
    overcastHorizon: new THREE.Color(0x9b7e7c),
    overcastFog: new THREE.Color(0x8c7372),
    denseFogColor: new THREE.Color(0xb58e7e),
    sunDiscColor: new THREE.Color(0xffb35c),
    sunDiscStrength: 1.35,
    starStrength: 0.12,
    fogColor: new THREE.Color(0xd87b52),
    fogDensity: 0.0029,
    dirColor: new THREE.Color(0xff9b54),
    dirIntensity: 1.35,
    sunOffset: new THREE.Vector3(-34, 12, -16),
    hemiSkyColor: new THREE.Color(0xffb07c),
    hemiGroundColor: new THREE.Color(0x4c3c48),
    hemiIntensity: 0.68,
    envIntensity: 0.55,
    nightFactor: 0.62,
    headlightFactor: 0.82,
  },
  night: {
    mode: 'night',
    labelJa: '夜',
    labelEn: 'NIGHT',
    skyZenith: new THREE.Color(0x070d20),
    skyHorizon: new THREE.Color(0x18294d),
    skyGround: new THREE.Color(0x101828),
    overcastZenith: new THREE.Color(0x0d1320),
    overcastHorizon: new THREE.Color(0x1c273b),
    overcastFog: new THREE.Color(0x162033),
    denseFogColor: new THREE.Color(0x223047),
    sunDiscColor: new THREE.Color(0xc8dcff),
    sunDiscStrength: 0.9,
    starStrength: 1.0,
    fogColor: new THREE.Color(0x101c34),
    fogDensity: 0.0036,
    dirColor: new THREE.Color(0x93b8f2),
    dirIntensity: 0.52,
    sunOffset: new THREE.Vector3(22, 26, -24),
    hemiSkyColor: new THREE.Color(0x3a568f),
    hemiGroundColor: new THREE.Color(0x1c2536),
    hemiIntensity: 0.52,
    envIntensity: 0.26,
    nightFactor: 1.0,
    headlightFactor: 1.0,
  },
};

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalDir;
  void main() {
    vLocalDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform float uStarStrength;
  varying vec3 vLocalDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 dir = normalize(vLocalDir);
    float h = dir.y;

    vec3 col;
    if (h >= 0.0) {
      float t = pow(clamp(h, 0.0, 1.0), 0.55);
      col = mix(uHorizonColor, uZenithColor, t);
    } else {
      float t = clamp(-h * 3.0, 0.0, 1.0);
      col = mix(uHorizonColor, uGroundColor, t);
    }

    // 太陽・月のグローディスク
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float sunGlow = pow(sunDot, 12.0) * 0.38 * uSunStrength;
    float sunCore = smoothstep(0.9965, 0.9992, sunDot) * 1.1 * uSunStrength;
    col += uSunColor * (sunGlow + sunCore);

    // 夜間かつ晴天寄りのときのみ控えめな星空を表示
    if (uStarStrength > 0.01 && h > 0.08) {
      vec2 grid = floor(dir.xz / (dir.y + 0.35) * 95.0);
      float n = hash21(grid);
      float star = step(0.994, n) * smoothstep(0.08, 0.45, h) * uStarStrength;
      col += vec3(0.82, 0.9, 1.0) * star * 0.75;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface TimeOfDayCallbacks {
  setDayHdriBackgroundVisible: (visible: boolean) => boolean;
}

/**
 * 3-G / 5-A: 昼 / 夕方 / 夜 の時間帯切替および天候モディファイア連動の環境トランジション制御。
 * - スカイドーム（1ドローコール・トーンマップ一致シェーダ）・FogExp2・太陽光/月光・環境光・IBL強度を
 *   ゼロアロケーションで補間し、晴れ・曇り・雨・霧の全12組み合わせを破綻なく表現する。
 */
export class TimeOfDayController {
  private readonly scene: THREE.Scene;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly callbacks: TimeOfDayCallbacks;

  private readonly skyDome: THREE.Mesh;
  private readonly skyGeo: THREE.SphereGeometry;
  private readonly skyMat: THREE.ShaderMaterial;

  private mode: TimeOfDayMode = 'day';
  private isTransitioning = false;

  // ゼロアロケーション補間用の時間帯ベース現在値
  private readonly curZenith = PRESETS.day.skyZenith.clone();
  private readonly curHorizon = PRESETS.day.skyHorizon.clone();
  private readonly curGround = PRESETS.day.skyGround.clone();
  private readonly curOvercastZenith = PRESETS.day.overcastZenith.clone();
  private readonly curOvercastHorizon = PRESETS.day.overcastHorizon.clone();
  private readonly curOvercastFog = PRESETS.day.overcastFog.clone();
  private readonly curDenseFogColor = PRESETS.day.denseFogColor.clone();
  private readonly curSunDisc = PRESETS.day.sunDiscColor.clone();
  private curSunDiscStrength = PRESETS.day.sunDiscStrength;
  private curStarStrength = PRESETS.day.starStrength;

  private readonly curFogColor = PRESETS.day.fogColor.clone();
  private curFogDensity = PRESETS.day.fogDensity;

  private readonly curDirColor = PRESETS.day.dirColor.clone();
  private curDirIntensity = PRESETS.day.dirIntensity;
  private readonly curSunOffset = PRESETS.day.sunOffset.clone();
  private readonly curSunDir = PRESETS.day.sunOffset.clone().normalize();

  private readonly curHemiSky = PRESETS.day.hemiSkyColor.clone();
  private readonly curHemiGround = PRESETS.day.hemiGroundColor.clone();
  private curHemiIntensity = PRESETS.day.hemiIntensity;
  private curEnvIntensity = PRESETS.day.envIntensity;

  private curNightFactor = PRESETS.day.nightFactor;
  private curHeadlightFactor = PRESETS.day.headlightFactor;
  private effectiveHeadlightFactor = PRESETS.day.headlightFactor;

  // 天候合成後の最終出力カラー（ゼロアロケーション再利用）
  private readonly outZenith = PRESETS.day.skyZenith.clone();
  private readonly outHorizon = PRESETS.day.skyHorizon.clone();
  private readonly outGround = PRESETS.day.skyGround.clone();
  private readonly outFogColor = PRESETS.day.fogColor.clone();
  private readonly outDirColor = PRESETS.day.dirColor.clone();
  private readonly outHemiSky = PRESETS.day.hemiSkyColor.clone();
  private readonly outHemiGround = PRESETS.day.hemiGroundColor.clone();
  private readonly bgColor = PRESETS.day.skyHorizon.clone();

  private lastWeatherSig = -1;
  private lastAllowDayHdriByWeather = true;

  constructor(
    scene: THREE.Scene,
    dirLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight,
    callbacks: TimeOfDayCallbacks,
  ) {
    this.scene = scene;
    this.dirLight = dirLight;
    this.hemiLight = hemiLight;
    this.callbacks = callbacks;

    this.skyGeo = new THREE.SphereGeometry(420, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: {
        uZenithColor: { value: this.outZenith },
        uHorizonColor: { value: this.outHorizon },
        uGroundColor: { value: this.outGround },
        uSunDir: { value: this.curSunDir },
        uSunColor: { value: this.curSunDisc },
        uSunStrength: { value: this.curSunDiscStrength },
        uStarStrength: { value: this.curStarStrength },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: true,
    });

    this.skyDome = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.skyDome.name = 'TimeOfDaySkyDome';
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    this.applyCurrentState(null);
  }

  public getMode(): TimeOfDayMode {
    return this.mode;
  }

  public getNightFactor(): number {
    return this.curNightFactor;
  }

  public getHeadlightFactor(): number {
    return this.effectiveHeadlightFactor;
  }

  public getSunOffset(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.curSunOffset);
  }

  public setMode(nextMode: TimeOfDayMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.isTransitioning = true;
    // 夕方・夜へ移行開始時点でシェーダスカイドームを有効化
    if (nextMode !== 'day') {
      this.callbacks.setDayHdriBackgroundVisible(false);
      this.skyDome.visible = true;
    }
  }

  public cycleMode(): TimeOfDayMode {
    const idx = TIME_OF_DAY_ORDER.indexOf(this.mode);
    const next = TIME_OF_DAY_ORDER[(idx + 1) % TIME_OF_DAY_ORDER.length];
    this.setMode(next);
    return next;
  }

  public update(
    dt: number,
    cameraPos: THREE.Vector3,
    weatherMod?: WeatherLightingModifier | null,
  ): void {
    // スカイドームをカメラ中心へ追従
    this.skyDome.position.copy(cameraPos);

    let needsApply = false;

    if (this.isTransitioning) {
      needsApply = true;
      const target = PRESETS[this.mode];
      const alpha = 1 - Math.exp(-Math.max(0.001, dt) * 4.8);

      this.curZenith.lerp(target.skyZenith, alpha);
      this.curHorizon.lerp(target.skyHorizon, alpha);
      this.curGround.lerp(target.skyGround, alpha);
      this.curOvercastZenith.lerp(target.overcastZenith, alpha);
      this.curOvercastHorizon.lerp(target.overcastHorizon, alpha);
      this.curOvercastFog.lerp(target.overcastFog, alpha);
      this.curDenseFogColor.lerp(target.denseFogColor, alpha);
      this.curSunDisc.lerp(target.sunDiscColor, alpha);
      this.curSunDiscStrength +=
        (target.sunDiscStrength - this.curSunDiscStrength) * alpha;
      this.curStarStrength +=
        (target.starStrength - this.curStarStrength) * alpha;

      this.curFogColor.lerp(target.fogColor, alpha);
      this.curFogDensity += (target.fogDensity - this.curFogDensity) * alpha;

      this.curDirColor.lerp(target.dirColor, alpha);
      this.curDirIntensity +=
        (target.dirIntensity - this.curDirIntensity) * alpha;
      this.curSunOffset.lerp(target.sunOffset, alpha);

      this.curHemiSky.lerp(target.hemiSkyColor, alpha);
      this.curHemiGround.lerp(target.hemiGroundColor, alpha);
      this.curHemiIntensity +=
        (target.hemiIntensity - this.curHemiIntensity) * alpha;
      this.curEnvIntensity +=
        (target.envIntensity - this.curEnvIntensity) * alpha;

      this.curNightFactor += (target.nightFactor - this.curNightFactor) * alpha;
      this.curHeadlightFactor +=
        (target.headlightFactor - this.curHeadlightFactor) * alpha;

      // 収束判定
      const diff =
        Math.abs(target.nightFactor - this.curNightFactor) +
        Math.abs(target.headlightFactor - this.curHeadlightFactor) +
        Math.abs(target.dirIntensity - this.curDirIntensity) +
        Math.abs(target.fogDensity - this.curFogDensity) * 100;

      if (diff < 0.0025) {
        this.curZenith.copy(target.skyZenith);
        this.curHorizon.copy(target.skyHorizon);
        this.curGround.copy(target.skyGround);
        this.curOvercastZenith.copy(target.overcastZenith);
        this.curOvercastHorizon.copy(target.overcastHorizon);
        this.curOvercastFog.copy(target.overcastFog);
        this.curDenseFogColor.copy(target.denseFogColor);
        this.curSunDisc.copy(target.sunDiscColor);
        this.curSunDiscStrength = target.sunDiscStrength;
        this.curStarStrength = target.starStrength;
        this.curFogColor.copy(target.fogColor);
        this.curFogDensity = target.fogDensity;
        this.curDirColor.copy(target.dirColor);
        this.curDirIntensity = target.dirIntensity;
        this.curSunOffset.copy(target.sunOffset);
        this.curHemiSky.copy(target.hemiSkyColor);
        this.curHemiGround.copy(target.hemiGroundColor);
        this.curHemiIntensity = target.hemiIntensity;
        this.curEnvIntensity = target.envIntensity;
        this.curNightFactor = target.nightFactor;
        this.curHeadlightFactor = target.headlightFactor;
        this.isTransitioning = false;
      }
    }

    if (weatherMod) {
      const sig =
        weatherMod.overcastAmount +
        weatherMod.rainAmount * 2.13 +
        weatherMod.fogAmount * 4.37 +
        weatherMod.fogDensityScale * 0.71 +
        weatherMod.denseFogBlend * 7.11 +
        (weatherMod.allowDayHdriBg ? 16 : 0) +
        (weatherMod.isTransitioning ? 32 : 0);
      if (
        weatherMod.isTransitioning ||
        Math.abs(sig - this.lastWeatherSig) > 1e-5
      ) {
        this.lastWeatherSig = sig;
        needsApply = true;
      }
    }

    if (needsApply) {
      this.applyCurrentState(weatherMod ?? null);
    }
  }

  private applyCurrentState(
    weatherMod: WeatherLightingModifier | null,
  ): void {
    const overcast = weatherMod ? weatherMod.overcastAmount : 0;
    const fogAmt = weatherMod ? weatherMod.fogAmount : 0;
    const skyBright = weatherMod ? weatherMod.skyBrightnessScale : 1;
    const dirScale = weatherMod ? weatherMod.dirIntensityScale : 1;
    const hemiScale = weatherMod ? weatherMod.hemiIntensityScale : 1;
    const envScale = weatherMod ? weatherMod.envIntensityScale : 1;
    const sunDiscScale = weatherMod ? weatherMod.sunDiscScale : 1;
    const starScale = weatherMod ? weatherMod.starScale : 1;
    const fogDensityScale = weatherMod ? weatherMod.fogDensityScale : 1;
    const denseFogBlend = weatherMod ? weatherMod.denseFogBlend : 0;
    const denseFogTarget = weatherMod ? weatherMod.denseFogTargetDensity : 0.0185;
    const headlightFloor = weatherMod ? weatherMod.headlightFloor : 0;
    const allowDayHdriByWeather = weatherMod ? weatherMod.allowDayHdriBg : true;
    this.lastAllowDayHdriByWeather = allowDayHdriByWeather;

    // 1. 空色・フォグ色を時間帯ベースに天候トーンを掛け合わせて合成
    this.outZenith
      .copy(this.curZenith)
      .lerp(this.curOvercastZenith, overcast)
      .multiplyScalar(skyBright);
    this.outHorizon
      .copy(this.curHorizon)
      .lerp(this.curOvercastHorizon, overcast)
      .multiplyScalar(skyBright);
    this.outGround
      .copy(this.curGround)
      .lerp(this.curOvercastFog, overcast * 0.7)
      .multiplyScalar(skyBright);

    this.outFogColor
      .copy(this.curFogColor)
      .lerp(this.curOvercastFog, overcast)
      .multiplyScalar(0.25 + 0.75 * skyBright);

    // 霧モード時は空全体とフォグ色を自然になじませ、視界が霧に包まれる表現へ
    if (fogAmt > 0.001) {
      this.outFogColor.lerp(this.curDenseFogColor, fogAmt);
      this.outZenith.lerp(this.outFogColor, fogAmt * 0.92);
      this.outHorizon.lerp(this.outFogColor, fogAmt * 0.98);
      this.outGround.lerp(this.outFogColor, fogAmt * 0.95);
    }

    this.curSunDir.copy(this.curSunOffset).normalize();
    this.skyMat.uniforms.uSunStrength.value =
      this.curSunDiscStrength * sunDiscScale;
    this.skyMat.uniforms.uStarStrength.value = this.curStarStrength * starScale;

    // 昼かつ晴天かつ完全収束時のみ HDRI 背景を許可（曇り/雨/霧や遷移中はシェーダスカイドームを使用）
    const useDayHdriBg =
      this.mode === 'day' && !this.isTransitioning && allowDayHdriByWeather;
    const hdriShown = this.callbacks.setDayHdriBackgroundVisible(useDayHdriBg);
    if (hdriShown) {
      this.skyDome.visible = false;
    } else {
      this.bgColor.copy(this.outHorizon);
      this.scene.background = this.bgColor;
      this.skyDome.visible = true;
    }

    // 2. FogExp2 密度＆カラー更新（常時 FogExp2 を維持しシェーダ再コンパイルを回避）
    const baseDensity = this.curFogDensity * fogDensityScale;
    const finalDensity =
      baseDensity + (denseFogTarget - baseDensity) * denseFogBlend;

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.outFogColor);
      this.scene.fog.density = finalDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(
        this.outFogColor.getHex(),
        finalDensity,
      );
    }

    // 3. 太陽光/月光・環境光・IBL強度へ天候モディファイアを適用
    this.outDirColor.copy(this.curDirColor).lerp(this.outHorizon, overcast * 0.35);
    this.dirLight.color.copy(this.outDirColor);
    this.dirLight.intensity = this.curDirIntensity * dirScale;

    this.outHemiSky
      .copy(this.curHemiSky)
      .lerp(this.outHorizon, Math.min(1, overcast * 0.45 + fogAmt * 0.5));
    this.outHemiGround
      .copy(this.curHemiGround)
      .lerp(this.outFogColor, fogAmt * 0.35);
    this.hemiLight.color.copy(this.outHemiSky);
    this.hemiLight.groundColor.copy(this.outHemiGround);
    this.hemiLight.intensity = this.curHemiIntensity * hemiScale;

    this.scene.environmentIntensity = this.curEnvIntensity * envScale;
    this.effectiveHeadlightFactor = Math.max(
      this.curHeadlightFactor,
      headlightFloor,
    );
  }

  /** HDRI ロード完了時など、環境側の背景状態を再同期したいときに呼び出す */
  public syncBackgroundVisibility(hasLoadedHdri: boolean): void {
    const useDayHdriBg =
      this.mode === 'day' &&
      !this.isTransitioning &&
      this.lastAllowDayHdriByWeather &&
      hasLoadedHdri;
    this.skyDome.visible = !useDayHdriBg;
  }

  public dispose(): void {
    this.scene.remove(this.skyDome);
    this.skyGeo.dispose();
    this.skyMat.dispose();
  }
}

