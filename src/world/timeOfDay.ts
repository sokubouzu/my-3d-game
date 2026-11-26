import * as THREE from 'three';

export type TimeOfDayMode = 'day' | 'sunset' | 'night';

export interface TimeOfDayPreset {
  mode: TimeOfDayMode;
  labelJa: string;
  labelEn: string;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyGround: THREE.Color;
  sunDiscColor: THREE.Color;
  sunDiscStrength: number;
  starStrength: number;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  dirColor: THREE.Color;
  dirIntensity: number;
  /** 操作対象からの太陽光/月光オフセットベクトル */
  sunOffset: THREE.Vector3;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  envIntensity: number;
  /** 0 = 昼, 0.65 = 夕方, 1.0 = 夜（街灯・窓・信号の夜間発光強度） */
  nightFactor: number;
  /** 0 = 昼（消灯）, 0.8 = 夕方（点灯）, 1.0 = 夜（全灯） */
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
    sunDiscColor: new THREE.Color(0xfff6dc),
    sunDiscStrength: 0.75,
    starStrength: 0.0,
    fogColor: new THREE.Color(0xb8d4eb),
    fogNear: 95,
    fogFar: 350,
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
    skyGround: new THREE.Color(0x4a2f32),
    sunDiscColor: new THREE.Color(0xffb35c),
    sunDiscStrength: 1.35,
    starStrength: 0.12,
    fogColor: new THREE.Color(0xd87b52),
    fogNear: 75,
    fogFar: 280,
    dirColor: new THREE.Color(0xff9248),
    dirIntensity: 1.25,
    sunOffset: new THREE.Vector3(-34, 11, -16),
    hemiSkyColor: new THREE.Color(0xffa770),
    hemiGroundColor: new THREE.Color(0x3a2c38),
    hemiIntensity: 0.56,
    envIntensity: 0.48,
    nightFactor: 0.62,
    headlightFactor: 0.82,
  },
  night: {
    mode: 'night',
    labelJa: '夜',
    labelEn: 'NIGHT',
    skyZenith: new THREE.Color(0x050918),
    skyHorizon: new THREE.Color(0x13203d),
    skyGround: new THREE.Color(0x090d16),
    sunDiscColor: new THREE.Color(0xc8dcff),
    sunDiscStrength: 0.9,
    starStrength: 1.0,
    fogColor: new THREE.Color(0x0c1428),
    fogNear: 48,
    fogFar: 210,
    dirColor: new THREE.Color(0x7aa4e8),
    dirIntensity: 0.34,
    sunOffset: new THREE.Vector3(22, 26, -24),
    hemiSkyColor: new THREE.Color(0x283e6e),
    hemiGroundColor: new THREE.Color(0x0d111a),
    hemiIntensity: 0.32,
    envIntensity: 0.16,
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

    // 夜間のみ控えめな星空を表示
    if (uStarStrength > 0.01 && h > 0.08) {
      vec2 grid = floor(dir.xz / (dir.y + 0.35) * 95.0);
      float n = hash21(grid);
      float star = step(0.994, n) * smoothstep(0.08, 0.45, h) * uStarStrength;
      col += vec3(0.82, 0.9, 1.0) * star * 0.75;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface TimeOfDayCallbacks {
  setDayHdriBackgroundVisible: (visible: boolean) => void;
}

/**
 * 3-G: 昼 / 夕方 / 夜 の時間帯切替および滑らかな環境トランジション制御。
 * - スカイドーム（1ドローコール・シェーダ）・フォグ・太陽光/月光・環境光・IBL強度をゼロアロケーションで補間。
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

  // ゼロアロケーション補間用の現在値
  private readonly curZenith = PRESETS.day.skyZenith.clone();
  private readonly curHorizon = PRESETS.day.skyHorizon.clone();
  private readonly curGround = PRESETS.day.skyGround.clone();
  private readonly curSunDisc = PRESETS.day.sunDiscColor.clone();
  private curSunDiscStrength = PRESETS.day.sunDiscStrength;
  private curStarStrength = PRESETS.day.starStrength;

  private readonly curFogColor = PRESETS.day.fogColor.clone();
  private curFogNear = PRESETS.day.fogNear;
  private curFogFar = PRESETS.day.fogFar;

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

  private readonly bgColor = PRESETS.day.skyHorizon.clone();

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
        uZenithColor: { value: this.curZenith },
        uHorizonColor: { value: this.curHorizon },
        uGroundColor: { value: this.curGround },
        uSunDir: { value: this.curSunDir },
        uSunColor: { value: this.curSunDisc },
        uSunStrength: { value: this.curSunDiscStrength },
        uStarStrength: { value: this.curStarStrength },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.skyDome = new THREE.Mesh(this.skyGeo, this.skyMat);
    this.skyDome.name = 'TimeOfDaySkyDome';
    this.skyDome.renderOrder = -10;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    this.applyCurrentState();
  }

  public getMode(): TimeOfDayMode {
    return this.mode;
  }

  public getNightFactor(): number {
    return this.curNightFactor;
  }

  public getHeadlightFactor(): number {
    return this.curHeadlightFactor;
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

  public update(dt: number, cameraPos: THREE.Vector3): void {
    // スカイドームをカメラ中心へ追従
    this.skyDome.position.copy(cameraPos);

    if (!this.isTransitioning) return;

    const target = PRESETS[this.mode];
    const alpha = 1 - Math.exp(-Math.max(0.001, dt) * 4.8);

    this.curZenith.lerp(target.skyZenith, alpha);
    this.curHorizon.lerp(target.skyHorizon, alpha);
    this.curGround.lerp(target.skyGround, alpha);
    this.curSunDisc.lerp(target.sunDiscColor, alpha);
    this.curSunDiscStrength +=
      (target.sunDiscStrength - this.curSunDiscStrength) * alpha;
    this.curStarStrength +=
      (target.starStrength - this.curStarStrength) * alpha;

    this.curFogColor.lerp(target.fogColor, alpha);
    this.curFogNear += (target.fogNear - this.curFogNear) * alpha;
    this.curFogFar += (target.fogFar - this.curFogFar) * alpha;

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
      Math.abs(target.fogNear - this.curFogNear) * 0.01;

    if (diff < 0.0025) {
      this.curZenith.copy(target.skyZenith);
      this.curHorizon.copy(target.skyHorizon);
      this.curGround.copy(target.skyGround);
      this.curSunDisc.copy(target.sunDiscColor);
      this.curSunDiscStrength = target.sunDiscStrength;
      this.curStarStrength = target.starStrength;
      this.curFogColor.copy(target.fogColor);
      this.curFogNear = target.fogNear;
      this.curFogFar = target.fogFar;
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

    this.applyCurrentState();
  }

  private applyCurrentState(): void {
    this.curSunDir.copy(this.curSunOffset).normalize();
    this.skyMat.uniforms.uSunStrength.value = this.curSunDiscStrength;
    this.skyMat.uniforms.uStarStrength.value = this.curStarStrength;

    // 昼かつ完全収束時のみ HDRI 背景を許可（未ロード時はシェーダスカイドームが表示される）
    const useDayHdriBg = this.mode === 'day' && !this.isTransitioning;
    this.callbacks.setDayHdriBackgroundVisible(useDayHdriBg);
    if (!useDayHdriBg) {
      this.bgColor.copy(this.curHorizon);
      this.scene.background = this.bgColor;
      this.skyDome.visible = true;
    }

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.curFogColor);
      this.scene.fog.near = this.curFogNear;
      this.scene.fog.far = this.curFogFar;
    } else {
      this.scene.fog = new THREE.Fog(
        this.curFogColor.getHex(),
        this.curFogNear,
        this.curFogFar,
      );
    }

    this.dirLight.color.copy(this.curDirColor);
    this.dirLight.intensity = this.curDirIntensity;

    this.hemiLight.color.copy(this.curHemiSky);
    this.hemiLight.groundColor.copy(this.curHemiGround);
    this.hemiLight.intensity = this.curHemiIntensity;

    this.scene.environmentIntensity = this.curEnvIntensity;
  }

  /** HDRI ロード完了時など、環境側の背景状態を再同期したいときに呼び出す */
  public syncBackgroundVisibility(hasLoadedHdri: boolean): void {
    const useDayHdriBg =
      this.mode === 'day' && !this.isTransitioning && hasLoadedHdri;
    this.skyDome.visible = !useDayHdriBg;
  }

  public dispose(): void {
    this.scene.remove(this.skyDome);
    this.skyGeo.dispose();
    this.skyMat.dispose();
  }
}
