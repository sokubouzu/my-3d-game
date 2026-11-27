import * as THREE from 'three';

const MAX_SPARKS = 180;
const MAX_SMOKE = 260;
const MAX_FIRE = 240;
const MAX_OIL_DECALS = 96;

const DEBRIS_TIRE_CAP = 8;
const DEBRIS_PANEL_CAP = 12;
const DEBRIS_BUMPER_CAP = 10;
const DEBRIS_SHARD_CAP = 32;
const MAX_DEBRIS =
  DEBRIS_TIRE_CAP + DEBRIS_PANEL_CAP + DEBRIS_BUMPER_CAP + DEBRIS_SHARD_CAP;

const DEBRIS_KIND_TIRE = 0;
const DEBRIS_KIND_PANEL = 1;
const DEBRIS_KIND_BUMPER = 2;
const DEBRIS_KIND_SHARD = 3;

interface ParticlePool {
  readonly capacity: number;
  cursor: number;
  activeCount: number;
  readonly isFire: boolean;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly sizeStart: Float32Array;
  readonly sizeEnd: Float32Array;
  readonly alphaPeak: Float32Array;
  readonly drag: Float32Array;
  readonly riseAccel: Float32Array;
  readonly windScale: Float32Array;
  readonly angleArray: Float32Array;
  readonly spinVel: Float32Array;
  readonly baseR: Float32Array;
  readonly baseG: Float32Array;
  readonly baseB: Float32Array;
  readonly posArray: Float32Array;
  readonly colorArray: Float32Array;
  readonly sizeArray: Float32Array;
  readonly alphaArray: Float32Array;
  readonly posAttr: THREE.BufferAttribute;
  readonly colorAttr: THREE.BufferAttribute;
  readonly sizeAttr: THREE.BufferAttribute;
  readonly alphaAttr: THREE.BufferAttribute;
  readonly angleAttr: THREE.BufferAttribute;
  readonly points: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aAngle;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vRot;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vRot = vec2(cos(aAngle), sin(aAngle));
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(0.8, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * (285.0 / dist), 0.0, 176.0);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vRot;

  void main() {
    if (vAlpha <= 0.004) discard;
    vec2 centered = gl_PointCoord - 0.5;
    vec2 uv = vec2(
      centered.x * vRot.x - centered.y * vRot.y,
      centered.x * vRot.y + centered.y * vRot.x
    ) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec4 tex = texture2D(uMap, uv);
    float alpha = tex.a * vAlpha;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vColor * tex.rgb, alpha);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aVel;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vDir;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vec3 viewVel = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
    vec2 screenVel = vec2(viewVel.x, -viewVel.y);
    float vLen = length(screenVel);
    vDir = vLen > 0.001 ? (screenVel / vLen) : vec2(0.0, -1.0);
    float dist = max(0.8, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * (260.0 / dist), 0.0, 96.0);
  }
`;

const SPARK_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vDir;

  void main() {
    if (vAlpha <= 0.004) discard;
    vec2 p = gl_PointCoord - 0.5;
    vec2 uv = vec2(
      p.x * vDir.x + p.y * vDir.y,
      -p.x * vDir.y + p.y * vDir.x
    ) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec4 tex = texture2D(uMap, uv);
    float alpha = tex.a * vAlpha;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vColor * tex.rgb, alpha);
  }
`;

/**
 * 5-B2: 柔らかい炎用プロシージャル CanvasTexture（中心白→黄→オレンジ→赤橙→透明）。
 * 多層の有機的な炎ローブを重ねて加算合成時に自然な揺らめき・発光感を出す。
 */
function createFlameTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const half = size * 0.5;

    // 外周の柔らかいオレンジ〜赤炎グロー
    const outerGrad = ctx.createRadialGradient(
      half,
      half * 1.06,
      size * 0.04,
      half,
      half,
      half * 0.94,
    );
    outerGrad.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
    outerGrad.addColorStop(0.22, 'rgba(255, 224, 92, 0.94)');
    outerGrad.addColorStop(0.5, 'rgba(255, 118, 22, 0.65)');
    outerGrad.addColorStop(0.78, 'rgba(210, 38, 6, 0.22)');
    outerGrad.addColorStop(1.0, 'rgba(160, 14, 0, 0.0)');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(0, 0, size, size);

    // 炎の舌のような有機的ハイライトローブ（単調な円を避ける）
    ctx.globalCompositeOperation = 'lighter';
    const lobes: ReadonlyArray<[number, number, number, string, string]> = [
      [0.48, 0.58, 0.24, 'rgba(255, 252, 220, 0.85)', 'rgba(255, 170, 32, 0.0)'],
      [0.54, 0.44, 0.22, 'rgba(255, 220, 96, 0.62)', 'rgba(255, 92, 12, 0.0)'],
      [0.42, 0.46, 0.2, 'rgba(255, 196, 68, 0.52)', 'rgba(240, 74, 8, 0.0)'],
      [0.5, 0.3, 0.18, 'rgba(255, 148, 36, 0.42)', 'rgba(200, 32, 4, 0.0)'],
    ];
    for (let i = 0; i < lobes.length; i += 1) {
      const [lx, ly, lr, c0, c1] = lobes[i];
      const cx = size * lx;
      const cy = size * ly;
      const r = size * lr;
      const g = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 5-B2: 濃い煙・白煙用プロシージャル CanvasTexture（ノイズ感のある柔らかい雲状）。
 * 複数の柔らかいパフと微細陰影を重ねて立体的な煙の塊を表現する。
 */
function createSmokeTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const half = size * 0.5;

    let seed = 91823;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // ベースとなる柔らかい雲塊
    const baseGrad = ctx.createRadialGradient(
      half,
      half,
      size * 0.05,
      half,
      half,
      half * 0.88,
    );
    baseGrad.addColorStop(0.0, 'rgba(246, 246, 248, 0.72)');
    baseGrad.addColorStop(0.45, 'rgba(228, 228, 232, 0.45)');
    baseGrad.addColorStop(0.78, 'rgba(205, 205, 210, 0.14)');
    baseGrad.addColorStop(1.0, 'rgba(190, 190, 196, 0.0)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    // 複数の不規則な雲パフでモクモクしたノイズ感を付与
    for (let i = 0; i < 20; i += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = (0.06 + Math.pow(rand(), 0.75) * 0.28) * size;
      const px = half + Math.cos(ang) * dist;
      const py = half + Math.sin(ang) * dist;
      const r = size * (0.14 + rand() * 0.17);
      const shade = Math.round(212 + rand() * 43);
      const peakAlpha = 0.22 + rand() * 0.24;

      const puffGrad = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
      puffGrad.addColorStop(0.0, `rgba(${shade}, ${shade}, ${shade}, ${peakAlpha})`);
      puffGrad.addColorStop(
        0.58,
        `rgba(${shade - 14}, ${shade - 14}, ${shade - 12}, ${peakAlpha * 0.45})`,
      );
      puffGrad.addColorStop(1.0, `rgba(${shade - 24}, ${shade - 24}, ${shade - 22}, 0.0)`);
      ctx.fillStyle = puffGrad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 外周エッジを円形マスクで確実に透明へフェード（角張り防止）
    ctx.globalCompositeOperation = 'destination-in';
    const maskGrad = ctx.createRadialGradient(
      half,
      half,
      half * 0.35,
      half,
      half,
      half * 0.96,
    );
    maskGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    maskGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.72)');
    maskGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = maskGrad;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 5-B2: 火花用プロシージャル CanvasTexture（細長い光点・水平ストリーク）。
 * シェーダ側で速度方向へ回転させ、鋭く発光する金属火花・火の粉を表現する。
 */
function createSparkTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const half = size * 0.5;

    ctx.save();
    ctx.translate(half, half);
    ctx.scale(1.0, 0.24);
    const glowGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, half * 0.92);
    glowGrad.addColorStop(0.0, 'rgba(255, 255, 248, 1.0)');
    glowGrad.addColorStop(0.28, 'rgba(255, 228, 128, 0.92)');
    glowGrad.addColorStop(0.62, 'rgba(255, 128, 28, 0.45)');
    glowGrad.addColorStop(1.0, 'rgba(255, 64, 8, 0.0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // 進行先端寄りの高温白熱コア
    const tipGrad = ctx.createRadialGradient(half * 0.24, 0, 0.5, half * 0.24, 0, half * 0.36);
    tipGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    tipGrad.addColorStop(0.5, 'rgba(255, 245, 185, 0.72)');
    tipGrad.addColorStop(1.0, 'rgba(255, 210, 90, 0.0)');
    ctx.fillStyle = tipGrad;
    ctx.beginPath();
    ctx.arc(half * 0.24, 0, half * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createOilStainTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;

    let seed = 7331;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 6; i += 1) {
      const ox = cx + (rand() - 0.5) * size * 0.22;
      const oy = cy + (rand() - 0.5) * size * 0.22;
      const r = size * (0.18 + rand() * 0.2);
      const grad = ctx.createRadialGradient(ox, oy, r * 0.12, ox, oy, r);
      grad.addColorStop(0, 'rgba(10, 10, 12, 0.94)');
      grad.addColorStop(0.62, 'rgba(16, 17, 22, 0.76)');
      grad.addColorStop(1, 'rgba(16, 17, 22, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 光沢のある油膜ハイライト（青紫〜シアン反射）
    const sheenGrad = ctx.createRadialGradient(
      cx - size * 0.06,
      cy - size * 0.05,
      2,
      cx,
      cy,
      size * 0.27,
    );
    sheenGrad.addColorStop(0, 'rgba(108, 140, 188, 0.34)');
    sheenGrad.addColorStop(0.5, 'rgba(132, 86, 152, 0.18)');
    sheenGrad.addColorStop(1, 'rgba(40, 48, 60, 0.0)');
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.29, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = size * (0.24 + rand() * 0.2);
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist;
      const dr = 1.5 + rand() * 3.5;
      ctx.fillStyle = `rgba(12, 12, 15, ${0.48 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.arc(px, py, dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createShockwaveTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, half * 0.42, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 220, 150, 0.0)');
    grad.addColorStop(0.56, 'rgba(255, 196, 108, 0.26)');
    grad.addColorStop(0.78, 'rgba(255, 240, 195, 0.95)');
    grad.addColorStop(0.92, 'rgba(255, 136, 44, 0.45)');
    grad.addColorStop(1.0, 'rgba(255, 100, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * PHASE 5-B / 5-B2: 全車両で共有する高品質・軽量ダメージエフェクト＆爆発破片システム。
 * - M1 iPad Air 60FPS 維持設計:
 *   - 炎（CanvasTexture・回転ビルボード・AdditiveBlending）: 1ドローコール (240粒)
 *   - 煙（ノイズ雲状 CanvasTexture・回転ビルボード・NormalBlending）: 1ドローコール (260粒)
 *   - 火花（細長い光点 CanvasTexture・速度方向配向・AdditiveBlending）: 1ドローコール (180粒)
 *   - 飛散バウンド破片（タイヤ・ボンネット片・バンパー片・金属破片）: InstancedMesh 4ドローコール（castShadow=false・休止時非表示）
 *   - 路面オイル漏れ＆焦げ跡: 96枚リングバッファ InstancedMesh 1ドローコール
 *   - 爆発フラッシュ（0.25秒減衰）＋炎上揺らぎ照明: 常設 PointLight 2基のみ（castShadow=false・休止時 intensity=0）
 */
export class VehicleDamageEffects {
  private readonly scene: THREE.Scene;
  private readonly flameTexture: THREE.CanvasTexture;
  private readonly smokeTexture: THREE.CanvasTexture;
  private readonly sparkTexture: THREE.CanvasTexture;
  private readonly oilTexture: THREE.CanvasTexture;
  private readonly shockwaveTexture: THREE.CanvasTexture;

  // 火花ビルボードプール（細長い光点 CanvasTexture・速度配向・AdditiveBlending）
  private readonly sparkLife = new Float32Array(MAX_SPARKS);
  private readonly sparkMaxLife = new Float32Array(MAX_SPARKS);
  private readonly sparkX = new Float32Array(MAX_SPARKS);
  private readonly sparkY = new Float32Array(MAX_SPARKS);
  private readonly sparkZ = new Float32Array(MAX_SPARKS);
  private readonly sparkVX = new Float32Array(MAX_SPARKS);
  private readonly sparkVY = new Float32Array(MAX_SPARKS);
  private readonly sparkVZ = new Float32Array(MAX_SPARKS);
  private readonly sparkBaseSize = new Float32Array(MAX_SPARKS);
  private readonly sparkPosArray: Float32Array;
  private readonly sparkVelArray: Float32Array;
  private readonly sparkColorArray: Float32Array;
  private readonly sparkSizeArray: Float32Array;
  private readonly sparkAlphaArray: Float32Array;
  private readonly sparkPosAttr: THREE.BufferAttribute;
  private readonly sparkVelAttr: THREE.BufferAttribute;
  private readonly sparkColorAttr: THREE.BufferAttribute;
  private readonly sparkSizeAttr: THREE.BufferAttribute;
  private readonly sparkAlphaAttr: THREE.BufferAttribute;
  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkMat: THREE.ShaderMaterial;
  private readonly sparkPoints: THREE.Points;
  private sparkCursor = 0;
  private activeSparkCount = 0;

  // 煙＆炎ビルボードプール
  private readonly smokePool: ParticlePool;
  private readonly firePool: ParticlePool;

  // 5-B2: 爆発飛散＆バウンド破片プール（タイヤ・ボンネット片・バンパー片・金属破片）
  private readonly debrisLife = new Float32Array(MAX_DEBRIS);
  private readonly debrisKind = new Uint8Array(MAX_DEBRIS);
  private readonly debrisSubSlot = new Uint8Array(MAX_DEBRIS);
  private readonly debrisX = new Float32Array(MAX_DEBRIS);
  private readonly debrisY = new Float32Array(MAX_DEBRIS);
  private readonly debrisZ = new Float32Array(MAX_DEBRIS);
  private readonly debrisGroundY = new Float32Array(MAX_DEBRIS);
  private readonly debrisVX = new Float32Array(MAX_DEBRIS);
  private readonly debrisVY = new Float32Array(MAX_DEBRIS);
  private readonly debrisVZ = new Float32Array(MAX_DEBRIS);
  private readonly debrisRX = new Float32Array(MAX_DEBRIS);
  private readonly debrisRY = new Float32Array(MAX_DEBRIS);
  private readonly debrisRZ = new Float32Array(MAX_DEBRIS);
  private readonly debrisVRX = new Float32Array(MAX_DEBRIS);
  private readonly debrisVRY = new Float32Array(MAX_DEBRIS);
  private readonly debrisVRZ = new Float32Array(MAX_DEBRIS);
  private readonly debrisSX = new Float32Array(MAX_DEBRIS);
  private readonly debrisSY = new Float32Array(MAX_DEBRIS);
  private readonly debrisSZ = new Float32Array(MAX_DEBRIS);
  private readonly debrisRadius = new Float32Array(MAX_DEBRIS);
  private readonly debrisRestitution = new Float32Array(MAX_DEBRIS);
  private readonly debrisBounces = new Uint8Array(MAX_DEBRIS);
  private readonly debrisTrailFlag = new Uint8Array(MAX_DEBRIS);
  private readonly debrisTrailTimer = new Float32Array(MAX_DEBRIS);

  private readonly debrisMeshes: readonly THREE.InstancedMesh[];
  private readonly debrisGeos: readonly THREE.BufferGeometry[];
  private readonly debrisMats: readonly THREE.Material[];
  private readonly debrisCursors = new Uint8Array(4);
  private readonly debrisCaps = [
    DEBRIS_TIRE_CAP,
    DEBRIS_PANEL_CAP,
    DEBRIS_BUMPER_CAP,
    DEBRIS_SHARD_CAP,
  ] as const;
  private readonly debrisSlotBase = [
    0,
    DEBRIS_TIRE_CAP,
    DEBRIS_TIRE_CAP + DEBRIS_PANEL_CAP,
    DEBRIS_TIRE_CAP + DEBRIS_PANEL_CAP + DEBRIS_BUMPER_CAP,
  ] as const;
  private activeDebrisCount = 0;
  private readonly debrisDummy = new THREE.Object3D();

  // 路面オイル漏れ＆爆発焦げ跡デカール（リングバッファ InstancedMesh）
  private readonly oilGeo: THREE.PlaneGeometry;
  private readonly oilMat: THREE.MeshBasicMaterial;
  private readonly oilMesh: THREE.InstancedMesh;
  private oilCursor = 0;
  private readonly oilDummy = new THREE.Object3D();
  private readonly oilColorScratch = new THREE.Color();

  // 爆発衝撃波リング + 常設フラッシュライト（0.25秒減衰）+ 常設炎上揺らぎライト
  private readonly shockwaveGeo: THREE.PlaneGeometry;
  private readonly shockwaveMat: THREE.MeshBasicMaterial;
  private readonly shockwaveMesh: THREE.Mesh;
  private shockwaveTimer = 0;
  private shockwaveDuration = 0.48;
  private readonly flashLight: THREE.PointLight;
  private flashTimer = 0;
  private readonly flashDuration = 0.25;
  private flashPeakIntensity = 185;
  private readonly wreckFireLight: THREE.PointLight;
  private wreckFireTargetIntensity = 0;
  private envClock = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.flameTexture = createFlameTexture(128);
    this.smokeTexture = createSmokeTexture(128);
    this.sparkTexture = createSparkTexture(64);
    this.oilTexture = createOilStainTexture(128);
    this.shockwaveTexture = createShockwaveTexture(128);

    // 1. 火花ビルボード Points（細長い光点 CanvasTexture・AdditiveBlending・1ドローコール）
    this.sparkPosArray = new Float32Array(MAX_SPARKS * 3);
    this.sparkVelArray = new Float32Array(MAX_SPARKS * 3);
    this.sparkColorArray = new Float32Array(MAX_SPARKS * 3);
    this.sparkSizeArray = new Float32Array(MAX_SPARKS);
    this.sparkAlphaArray = new Float32Array(MAX_SPARKS);

    this.sparkPosAttr = new THREE.BufferAttribute(this.sparkPosArray, 3);
    this.sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkVelAttr = new THREE.BufferAttribute(this.sparkVelArray, 3);
    this.sparkVelAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkColorAttr = new THREE.BufferAttribute(this.sparkColorArray, 3);
    this.sparkColorAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkSizeAttr = new THREE.BufferAttribute(this.sparkSizeArray, 1);
    this.sparkSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkAlphaAttr = new THREE.BufferAttribute(this.sparkAlphaArray, 1);
    this.sparkAlphaAttr.setUsage(THREE.DynamicDrawUsage);

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', this.sparkPosAttr);
    this.sparkGeo.setAttribute('aVel', this.sparkVelAttr);
    this.sparkGeo.setAttribute('color', this.sparkColorAttr);
    this.sparkGeo.setAttribute('aSize', this.sparkSizeAttr);
    this.sparkGeo.setAttribute('aAlpha', this.sparkAlphaAttr);

    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.sparkTexture },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
      },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.sparkPoints.name = 'VehicleDamageSparks';
    this.sparkPoints.castShadow = false;
    this.sparkPoints.receiveShadow = false;
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 3;
    this.sparkPoints.visible = false;
    this.scene.add(this.sparkPoints);

    // 2. 煙プール（ノイズ雲状テクスチャ・NormalBlending・1ドローコール）
    this.smokePool = this.createParticlePool(
      MAX_SMOKE,
      this.smokeTexture,
      THREE.NormalBlending,
      'VehicleDamageSmoke',
      1,
      false,
    );

    // 3. 炎・火球プール（柔らかい炎テクスチャ・AdditiveBlending・1ドローコール）
    this.firePool = this.createParticlePool(
      MAX_FIRE,
      this.flameTexture,
      THREE.AdditiveBlending,
      'VehicleDamageFire',
      2,
      true,
    );

    // 4. 5-B2: 飛散バウンド破片プール（InstancedMesh 4種、castShadow=false、休止時非表示）
    const tireGeo = new THREE.TorusGeometry(0.24, 0.105, 8, 14);
    const panelGeo = new THREE.BoxGeometry(0.64, 0.042, 0.46);
    const bumperGeo = new THREE.BoxGeometry(0.76, 0.12, 0.13);
    const shardGeo = new THREE.TetrahedronGeometry(0.14, 0);

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 0.92,
      metalness: 0.05,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x2a2625,
      roughness: 0.72,
      metalness: 0.42,
    });
    const bumperMat = new THREE.MeshStandardMaterial({
      color: 0x222226,
      roughness: 0.68,
      metalness: 0.35,
    });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x3a3634,
      roughness: 0.56,
      metalness: 0.65,
    });

    this.debrisGeos = [tireGeo, panelGeo, bumperGeo, shardGeo];
    this.debrisMats = [tireMat, panelMat, bumperMat, shardMat];
    const tireInst = this.createDebrisInstancedMesh(
      tireGeo,
      tireMat,
      DEBRIS_TIRE_CAP,
      'ExplosionDebrisTires',
    );
    const panelInst = this.createDebrisInstancedMesh(
      panelGeo,
      panelMat,
      DEBRIS_PANEL_CAP,
      'ExplosionDebrisPanels',
    );
    const bumperInst = this.createDebrisInstancedMesh(
      bumperGeo,
      bumperMat,
      DEBRIS_BUMPER_CAP,
      'ExplosionDebrisBumpers',
    );
    const shardInst = this.createDebrisInstancedMesh(
      shardGeo,
      shardMat,
      DEBRIS_SHARD_CAP,
      'ExplosionDebrisShards',
    );
    this.debrisMeshes = [tireInst, panelInst, bumperInst, shardInst];

    // 5. 路面オイル漏れ＆焦げ跡リングバッファ InstancedMesh（1ドローコール）
    this.oilGeo = new THREE.PlaneGeometry(1, 1);
    this.oilGeo.rotateX(-Math.PI * 0.5);
    this.oilMat = new THREE.MeshBasicMaterial({
      map: this.oilTexture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.oilMesh = new THREE.InstancedMesh(
      this.oilGeo,
      this.oilMat,
      MAX_OIL_DECALS,
    );
    this.oilMesh.name = 'VehicleOilLeakDecals';
    this.oilMesh.castShadow = false;
    this.oilMesh.receiveShadow = false;
    this.oilMesh.frustumCulled = false;

    this.oilDummy.position.set(0, -100, 0);
    this.oilDummy.scale.set(0, 0, 0);
    this.oilDummy.updateMatrix();
    this.oilColorScratch.setHex(0xffffff);
    for (let i = 0; i < MAX_OIL_DECALS; i += 1) {
      this.oilMesh.setMatrixAt(i, this.oilDummy.matrix);
      this.oilMesh.setColorAt(i, this.oilColorScratch);
    }
    this.oilMesh.instanceMatrix.needsUpdate = true;
    if (this.oilMesh.instanceColor) {
      this.oilMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.oilMesh);

    // 6. 爆発衝撃波リング + 常設フラッシュライト（0.25秒減衰）+ 常設炎上揺らぎライト
    this.shockwaveGeo = new THREE.PlaneGeometry(1, 1);
    this.shockwaveGeo.rotateX(-Math.PI * 0.5);
    this.shockwaveMat = new THREE.MeshBasicMaterial({
      map: this.shockwaveTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shockwaveMesh = new THREE.Mesh(this.shockwaveGeo, this.shockwaveMat);
    this.shockwaveMesh.name = 'ExplosionShockwave';
    this.shockwaveMesh.castShadow = false;
    this.shockwaveMesh.receiveShadow = false;
    this.shockwaveMesh.visible = false;
    this.scene.add(this.shockwaveMesh);

    this.flashLight = new THREE.PointLight(0xff9836, 0, 44, 1.4);
    this.flashLight.castShadow = false;
    this.flashLight.position.set(0, -50, 0);
    this.scene.add(this.flashLight);

    this.wreckFireLight = new THREE.PointLight(0xff5210, 0, 24, 1.55);
    this.wreckFireLight.castShadow = false;
    this.wreckFireLight.position.set(0, -50, 0);
    this.scene.add(this.wreckFireLight);
  }

  private createDebrisInstancedMesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    capacity: number,
    name: string,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = false;

    this.debrisDummy.position.set(0, -100, 0);
    this.debrisDummy.rotation.set(0, 0, 0);
    this.debrisDummy.scale.set(0, 0, 0);
    this.debrisDummy.updateMatrix();
    for (let i = 0; i < capacity; i += 1) {
      mesh.setMatrixAt(i, this.debrisDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  private createParticlePool(
    capacity: number,
    texture: THREE.CanvasTexture,
    blending: THREE.Blending,
    name: string,
    renderOrder: number,
    isFire: boolean,
  ): ParticlePool {
    const posArray = new Float32Array(capacity * 3);
    const colorArray = new Float32Array(capacity * 3);
    const sizeArray = new Float32Array(capacity);
    const alphaArray = new Float32Array(capacity);
    const angleArray = new Float32Array(capacity);

    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.BufferAttribute(colorArray, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(sizeArray, 1);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(alphaArray, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    const angleAttr = new THREE.BufferAttribute(angleArray, 1);
    angleAttr.setUsage(THREE.DynamicDrawUsage);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('color', colorAttr);
    geometry.setAttribute('aSize', sizeAttr);
    geometry.setAttribute('aAlpha', alphaAttr);
    geometry.setAttribute('aAngle', angleAttr);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending,
    });

    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.castShadow = false;
    points.receiveShadow = false;
    points.frustumCulled = false;
    points.renderOrder = renderOrder;
    points.visible = false;
    this.scene.add(points);

    return {
      capacity,
      cursor: 0,
      activeCount: 0,
      isFire,
      life: new Float32Array(capacity),
      maxLife: new Float32Array(capacity),
      vx: new Float32Array(capacity),
      vy: new Float32Array(capacity),
      vz: new Float32Array(capacity),
      sizeStart: new Float32Array(capacity),
      sizeEnd: new Float32Array(capacity),
      alphaPeak: new Float32Array(capacity),
      drag: new Float32Array(capacity),
      riseAccel: new Float32Array(capacity),
      windScale: new Float32Array(capacity),
      angleArray,
      spinVel: new Float32Array(capacity),
      baseR: new Float32Array(capacity),
      baseG: new Float32Array(capacity),
      baseB: new Float32Array(capacity),
      posArray,
      colorArray,
      sizeArray,
      alphaArray,
      posAttr,
      colorAttr,
      sizeAttr,
      alphaAttr,
      angleAttr,
      points,
      geometry,
      material,
    };
  }

  /** 衝突時の金属火花バーストを発生させる */
  public emitImpactSparks(
    worldX: number,
    worldY: number,
    worldZ: number,
    normalX: number,
    normalZ: number,
    intensity01: number,
  ): void {
    const count = Math.round(12 + Math.max(0, Math.min(1, intensity01)) * 28);
    for (let i = 0; i < count; i += 1) {
      const spread = (Math.random() - 0.5) * 2.2;
      const speed = 3.2 + Math.random() * (6.5 + intensity01 * 7.5);
      const cosS = Math.cos(spread);
      const sinS = Math.sin(spread);
      const dirX = normalX * cosS - normalZ * sinS;
      const dirZ = normalX * sinS + normalZ * cosS;

      this.spawnSpark(
        worldX + (Math.random() - 0.5) * 0.25,
        Math.max(0.18, worldY + (Math.random() - 0.3) * 0.35),
        worldZ + (Math.random() - 0.5) * 0.25,
        dirX * speed + (Math.random() - 0.5) * 2.4,
        1.8 + Math.random() * (4.2 + intensity01 * 3.8),
        dirZ * speed + (Math.random() - 0.5) * 2.4,
        0.24 + Math.random() * 0.34,
        0.26 + Math.random() * 0.22,
      );
    }
  }

  /** 中傷（HP45%以下）〜炎上中のエンジン付近からパチパチ散る電気・金属火花 */
  public emitDamageSparks(worldX: number, worldY: number, worldZ: number): void {
    const count = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 3.8;
      this.spawnSpark(
        worldX + (Math.random() - 0.5) * 0.34,
        worldY + (Math.random() - 0.5) * 0.16,
        worldZ + (Math.random() - 0.5) * 0.34,
        Math.cos(ang) * spd,
        1.8 + Math.random() * 3.1,
        Math.sin(ang) * spd,
        0.22 + Math.random() * 0.28,
        0.22 + Math.random() * 0.16,
      );
    }
  }

  /** 炎上残骸から立ち昇る火の粉 */
  public emitBurningEmbers(
    worldX: number,
    worldY: number,
    worldZ: number,
    spread = 0.8,
    count = 3,
  ): void {
    for (let i = 0; i < count; i += 1) {
      this.spawnSpark(
        worldX + (Math.random() - 0.5) * spread,
        worldY + Math.random() * 0.35,
        worldZ + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 2.2,
        2.6 + Math.random() * 3.8,
        (Math.random() - 0.5) * 2.2,
        0.42 + Math.random() * 0.45,
        0.18 + Math.random() * 0.14,
      );
    }
  }

  /** エンジン・残骸からの白煙（HP70%以下）〜濃いグレー/黒煙（HP45%以下・発火・残骸）を1粒放出 */
  public emitEngineSmoke(
    worldX: number,
    worldY: number,
    worldZ: number,
    darkness01: number,
    intensity = 1,
    inheritVx = 0,
    inheritVz = 0,
    windInfluence = 1.0,
    riseSpeedMul = 1.0,
  ): void {
    const dark = Math.max(0, Math.min(1, darkness01));
    const shade = 0.9 - dark * 0.78 + (Math.random() - 0.5) * 0.05;
    const clampedShade = Math.max(0.07, Math.min(0.95, shade));
    const life = (0.95 + Math.random() * 0.85) * (0.85 + dark * 0.45);
    this.spawnCloudParticle(
      this.smokePool,
      worldX + (Math.random() - 0.5) * (0.28 + dark * 0.24),
      worldY + Math.random() * 0.18,
      worldZ + (Math.random() - 0.5) * (0.28 + dark * 0.24),
      inheritVx * 0.26 + (Math.random() - 0.5) * 0.65,
      (1.1 + Math.random() * 1.15 * intensity) * riseSpeedMul,
      inheritVz * 0.26 + (Math.random() - 0.5) * 0.65,
      life,
      (0.28 + Math.random() * 0.2) * intensity,
      (1.15 + Math.random() * 1.05) * intensity * (0.9 + dark * 0.4),
      (0.32 + dark * 0.46) * Math.min(1.25, intensity),
      clampedShade,
      clampedShade * (1 - dark * 0.025),
      clampedShade * (1 + (1 - dark) * 0.03),
      1.35,
      0.65 * riseSpeedMul,
      windInfluence,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 1.1,
    );
  }

  /** 発火カウントダウン中および炎上残骸の多層炎パーティクルを放出（加算合成） */
  public emitFireFlame(
    worldX: number,
    worldY: number,
    worldZ: number,
    scale = 1,
    hotCoreBias = 0.5,
  ): void {
    const hot = Math.max(0, Math.min(1, Math.random() * 0.65 + hotCoreBias * 0.35));
    const r = 1.0;
    const g = 0.45 + hot * 0.52;
    const b = 0.1 + hot * 0.32;
    this.spawnCloudParticle(
      this.firePool,
      worldX + (Math.random() - 0.5) * 0.48 * scale,
      worldY + Math.random() * 0.22,
      worldZ + (Math.random() - 0.5) * 0.52 * scale,
      (Math.random() - 0.5) * 0.95,
      2.0 + Math.random() * 2.6 * scale,
      (Math.random() - 0.5) * 0.95,
      0.32 + Math.random() * 0.34,
      (0.5 + Math.random() * 0.36) * scale,
      (0.95 + Math.random() * 0.65) * scale,
      0.86,
      r,
      g,
      b,
      2.1,
      1.35,
      0.35,
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 1.8,
    );
  }

  /** 中傷（HP45%以下）走行中の路面オイル漏れ痕／爆発焦げ跡を1つ残す（リングバッファ上書き） */
  public stampOilDrop(
    worldX: number,
    groundY: number,
    worldZ: number,
    scale = 0.65,
    isCharMark = false,
  ): void {
    const slot = this.oilCursor;
    this.oilCursor = (this.oilCursor + 1) % MAX_OIL_DECALS;

    const sx = scale * (0.85 + Math.random() * 0.38);
    const sz = scale * (0.9 + Math.random() * 0.55);
    this.oilDummy.position.set(
      worldX + (Math.random() - 0.5) * (isCharMark ? 0.12 : 0.22),
      groundY + (isCharMark ? 0.02 : 0.019),
      worldZ + (Math.random() - 0.5) * (isCharMark ? 0.12 : 0.22),
    );
    this.oilDummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.oilDummy.scale.set(sx, 1, sz);
    this.oilDummy.updateMatrix();

    this.oilMesh.setMatrixAt(slot, this.oilDummy.matrix);
    this.oilColorScratch.setHex(isCharMark ? 0x151313 : 0xffffff);
    this.oilMesh.setColorAt(slot, this.oilColorScratch);
    this.oilMesh.instanceMatrix.needsUpdate = true;
    if (this.oilMesh.instanceColor) {
      this.oilMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 5-B2: 大爆発の瞬間演出
   * - 巨大火球バースト（白熱コア＋オレンジ外炎）
   * - 立ち昇る爆発黒煙プルーム
   * - 速度配向の金属火花＆火の粉乱舞
   * - タイヤ・ボンネット片・バンパー片・金属破片の放射状飛散＆地面バウンド＆煙の尾（計16〜22個）
   * - 地面付近へ広がる半透明衝撃波リング＋路面焦げ跡
   * - 0.25秒で鋭く減衰する強いオレンジ閃光 PointLight
   */
  public triggerExplosion(
    worldX: number,
    groundY: number,
    worldZ: number,
    isBike = false,
  ): void {
    const baseY = groundY + 0.78;

    // 1. 巨大な火球バースト（72 粒：白熱コア + 多層オレンジ炎）
    for (let i = 0; i < 72; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.68;
      const spd = 2.0 + Math.random() * 10.5;
      const isCore = i < 22;
      this.spawnCloudParticle(
        this.firePool,
        worldX + (Math.random() - 0.5) * 0.9,
        baseY + (Math.random() - 0.3) * 0.65,
        worldZ + (Math.random() - 0.5) * 0.9,
        Math.cos(theta) * Math.sin(phi) * spd,
        1.8 + Math.cos(phi) * spd * 0.9 + Math.random() * 2.8,
        Math.sin(theta) * Math.sin(phi) * spd,
        isCore ? 0.34 + Math.random() * 0.28 : 0.6 + Math.random() * 0.58,
        isCore ? 1.25 + Math.random() * 0.65 : 0.95 + Math.random() * 0.6,
        isCore ? 2.6 + Math.random() * 0.95 : 3.2 + Math.random() * 1.5,
        isCore ? 0.98 : 0.86,
        1.0,
        isCore ? 0.94 : 0.44 + Math.random() * 0.36,
        isCore ? 0.62 : 0.08,
        2.5,
        1.5,
        0.2,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 2.4,
      );
    }

    // 2. 高く巻き上がる爆発黒煙プルーム（52 粒）
    for (let i = 0; i < 52; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 6.4;
      const shade = 0.07 + Math.random() * 0.13;
      this.spawnCloudParticle(
        this.smokePool,
        worldX + (Math.random() - 0.5) * 1.35,
        baseY + Math.random() * 0.75,
        worldZ + (Math.random() - 0.5) * 1.35,
        Math.cos(ang) * spd,
        3.0 + Math.random() * 5.8,
        Math.sin(ang) * spd,
        1.6 + Math.random() * 1.4,
        1.05 + Math.random() * 0.65,
        3.8 + Math.random() * 2.4,
        0.78,
        shade,
        shade * 0.96,
        shade * 0.94,
        1.75,
        1.05,
        0.85,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 1.4,
      );
    }

    // 3. 四方へ放射状に飛び散る高温火花（76 粒）
    for (let i = 0; i < 76; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5.5 + Math.random() * 16.0;
      this.spawnSpark(
        worldX + (Math.random() - 0.5) * 0.85,
        baseY + Math.random() * 0.65,
        worldZ + (Math.random() - 0.5) * 0.85,
        Math.cos(ang) * spd,
        4.6 + Math.random() * 10.2,
        Math.sin(ang) * spd,
        0.5 + Math.random() * 0.72,
        0.3 + Math.random() * 0.24,
      );
    }

    // 4. 5-B2: 部品の飛散とバウンド（タイヤ・ボンネット片・バンパー片・大小金属破片 計16〜22個、一部煙の尾付き）
    const tireCount = isBike ? 2 : 3;
    const panelCount = isBike ? 2 : 4;
    const bumperCount = isBike ? 2 : 3;
    const shardCount = isBike ? 10 : 12;

    for (let i = 0; i < tireCount; i += 1) {
      const ang = (i / tireCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
      const spd = 5.2 + Math.random() * 5.2;
      const sc = isBike ? 0.85 : 1.05 + Math.random() * 0.16;
      this.spawnDebris(
        DEBRIS_KIND_TIRE,
        worldX + Math.cos(ang) * 0.55,
        groundY + 0.55 + Math.random() * 0.35,
        worldZ + Math.sin(ang) * 0.55,
        groundY,
        Math.cos(ang) * spd,
        5.5 + Math.random() * 4.5,
        Math.sin(ang) * spd,
        sc,
        sc,
        sc,
        0.32 * sc,
        0.52,
        true,
      );
    }

    for (let i = 0; i < panelCount; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4.6 + Math.random() * 6.8;
      this.spawnDebris(
        DEBRIS_KIND_PANEL,
        worldX + (Math.random() - 0.5) * 0.8,
        groundY + 0.85 + Math.random() * 0.4,
        worldZ + (Math.random() - 0.5) * 0.8,
        groundY,
        Math.cos(ang) * spd,
        6.4 + Math.random() * 5.6,
        Math.sin(ang) * spd,
        0.75 + Math.random() * 0.55,
        0.8 + Math.random() * 0.4,
        0.7 + Math.random() * 0.55,
        0.16,
        0.38,
        i < 3,
      );
    }

    for (let i = 0; i < bumperCount; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5.0 + Math.random() * 6.2;
      this.spawnDebris(
        DEBRIS_KIND_BUMPER,
        worldX + (Math.random() - 0.5) * 0.7,
        groundY + 0.65 + Math.random() * 0.35,
        worldZ + (Math.random() - 0.5) * 0.7,
        groundY,
        Math.cos(ang) * spd,
        5.2 + Math.random() * 4.8,
        Math.sin(ang) * spd,
        0.78 + Math.random() * 0.48,
        0.8 + Math.random() * 0.45,
        0.8 + Math.random() * 0.45,
        0.13,
        0.42,
        i === 0,
      );
    }

    for (let i = 0; i < shardCount; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5.8 + Math.random() * 9.5;
      const sx = 0.55 + Math.random() * 1.15;
      const sy = 0.35 + Math.random() * 0.8;
      const sz = 0.55 + Math.random() * 1.25;
      this.spawnDebris(
        DEBRIS_KIND_SHARD,
        worldX + (Math.random() - 0.5) * 0.9,
        groundY + 0.7 + Math.random() * 0.5,
        worldZ + (Math.random() - 0.5) * 0.9,
        groundY,
        Math.cos(ang) * spd,
        5.8 + Math.random() * 6.8,
        Math.sin(ang) * spd,
        sx,
        sy,
        sz,
        0.09,
        0.4,
        i < 2,
      );
    }

    // 5. 地面の爆発焦げ跡デカール
    this.stampOilDrop(worldX, groundY, worldZ, isBike ? 2.5 : 3.6, true);

    // 6. 衝撃波リング & 0.25秒で鋭く減衰するオレンジ閃光フラッシュ PointLight
    this.shockwaveMesh.position.set(worldX, groundY + 0.14, worldZ);
    this.shockwaveMesh.scale.set(1.3, 1, 1.3);
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.opacity = 0.95;
    this.shockwaveDuration = 0.48;
    this.shockwaveTimer = this.shockwaveDuration;

    this.flashLight.position.set(worldX, groundY + 2.3, worldZ);
    this.flashPeakIntensity = 185;
    this.flashTimer = this.flashDuration;
    this.flashLight.intensity = this.flashPeakIntensity;
  }

  /**
   * 5-B2: 炎上継続中の残骸（または発火車両）による揺らぐ赤オレンジ PointLight を更新する。
   * 常設 1 基のみを再利用し、複数台が同時に燃えていても最も強い（近い）火源へフォーカスする。
   */
  public setWreckFireLight(
    worldX: number,
    worldY: number,
    worldZ: number,
    intensity01: number,
  ): void {
    const clamped = Math.max(0, Math.min(1, intensity01));
    this.wreckFireTargetIntensity = clamped;
    if (clamped > 0.01) {
      this.wreckFireLight.position.set(worldX, worldY, worldZ);
    }
  }

  private spawnSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    baseSize: number,
  ): void {
    const i = this.sparkCursor;
    this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
    this.sparkX[i] = x;
    this.sparkY[i] = y;
    this.sparkZ[i] = z;
    this.sparkVX[i] = vx;
    this.sparkVY[i] = vy;
    this.sparkVZ[i] = vz;
    this.sparkLife[i] = maxLife;
    this.sparkMaxLife[i] = maxLife;
    this.sparkBaseSize[i] = baseSize;
    this.activeSparkCount = Math.min(MAX_SPARKS, this.activeSparkCount + 1);
  }

  private spawnDebris(
    kind: number,
    x: number,
    y: number,
    z: number,
    groundY: number,
    vx: number,
    vy: number,
    vz: number,
    sx: number,
    sy: number,
    sz: number,
    radius: number,
    restitution: number,
    leavesSmoke: boolean,
  ): void {
    const cap = this.debrisCaps[kind];
    const subSlot = this.debrisCursors[kind];
    this.debrisCursors[kind] = (subSlot + 1) % cap;
    const idx = this.debrisSlotBase[kind] + subSlot;

    const maxLife = 7.6 + Math.random() * 1.4;
    this.debrisLife[idx] = maxLife;
    this.debrisKind[idx] = kind;
    this.debrisSubSlot[idx] = subSlot;
    this.debrisX[idx] = x;
    this.debrisY[idx] = y;
    this.debrisZ[idx] = z;
    this.debrisGroundY[idx] = groundY;
    this.debrisVX[idx] = vx;
    this.debrisVY[idx] = vy;
    this.debrisVZ[idx] = vz;
    this.debrisRX[idx] = Math.random() * Math.PI * 2;
    this.debrisRY[idx] = Math.random() * Math.PI * 2;
    this.debrisRZ[idx] = Math.random() * Math.PI * 2;
    this.debrisVRX[idx] = (Math.random() - 0.5) * 14.0;
    this.debrisVRY[idx] = (Math.random() - 0.5) * 12.0;
    this.debrisVRZ[idx] = (Math.random() - 0.5) * 14.0;
    this.debrisSX[idx] = sx;
    this.debrisSY[idx] = sy;
    this.debrisSZ[idx] = sz;
    this.debrisRadius[idx] = radius;
    this.debrisRestitution[idx] = restitution;
    this.debrisBounces[idx] = 0;
    this.debrisTrailFlag[idx] = leavesSmoke ? 1 : 0;
    this.debrisTrailTimer[idx] = 0.04;
    this.activeDebrisCount = Math.min(MAX_DEBRIS, this.activeDebrisCount + 1);
  }

  private spawnCloudParticle(
    pool: ParticlePool,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    sizeStart: number,
    sizeEnd: number,
    alphaPeak: number,
    r: number,
    g: number,
    b: number,
    drag: number,
    riseAccel: number,
    windScale: number,
    initialAngle: number,
    spinVel: number,
  ): void {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.capacity;
    const base = i * 3;
    pool.posArray[base] = x;
    pool.posArray[base + 1] = y;
    pool.posArray[base + 2] = z;
    pool.vx[i] = vx;
    pool.vy[i] = vy;
    pool.vz[i] = vz;
    pool.life[i] = maxLife;
    pool.maxLife[i] = maxLife;
    pool.sizeStart[i] = sizeStart;
    pool.sizeEnd[i] = sizeEnd;
    pool.alphaPeak[i] = alphaPeak;
    pool.drag[i] = drag;
    pool.riseAccel[i] = riseAccel;
    pool.windScale[i] = windScale;
    pool.angleArray[i] = initialAngle;
    pool.spinVel[i] = spinVel;
    pool.baseR[i] = r;
    pool.baseG[i] = g;
    pool.baseB[i] = b;
    pool.colorArray[base] = r;
    pool.colorArray[base + 1] = g;
    pool.colorArray[base + 2] = b;
    pool.sizeArray[i] = sizeStart;
    pool.alphaArray[i] = alphaPeak;
    pool.activeCount = Math.min(pool.capacity, pool.activeCount + 1);
  }

  public update(dt: number, dpr = 1): void {
    const clampedDt = Math.min(dt, 0.05);
    this.envClock += clampedDt;

    // 緩やかな街の風（白煙・黒煙が自然に流れる）
    const gust = 1 + 0.25 * Math.sin(this.envClock * 0.75);
    const windX = 1.15 * gust;
    const windZ = 0.55 * gust;

    this.updateDebris(clampedDt);
    this.updateSparks(clampedDt, dpr);
    this.updateCloudPool(this.smokePool, clampedDt, dpr, windX, windZ);
    this.updateCloudPool(this.firePool, clampedDt, dpr, windX, windZ);

    // 衝撃波リング更新
    if (this.shockwaveTimer > 0) {
      this.shockwaveTimer = Math.max(0, this.shockwaveTimer - clampedDt);
      const t = 1 - this.shockwaveTimer / this.shockwaveDuration;
      const radius = 1.4 + t * 14.2;
      this.shockwaveMesh.scale.set(radius, 1, radius);
      this.shockwaveMat.opacity = (1 - t) * (1 - t) * 0.95;
      if (this.shockwaveTimer <= 0) {
        this.shockwaveMesh.visible = false;
      }
    }

    // 爆発閃光フラッシュライト（0.25秒で鋭く減衰）
    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - clampedDt);
      const frac = this.flashTimer / this.flashDuration;
      this.flashLight.intensity = this.flashPeakIntensity * frac * frac;
      if (this.flashTimer <= 0) {
        this.flashLight.intensity = 0;
      }
    } else if (this.flashLight.intensity !== 0) {
      this.flashLight.intensity = 0;
    }

    // 炎上残骸の揺らぐ赤オレンジ PointLight（路面・周囲建物への照り返し）
    if (this.wreckFireTargetIntensity > 0.01) {
      const t = this.envClock;
      const flicker =
        0.74 +
        0.16 * Math.sin(t * 17.3) +
        0.1 * Math.sin(t * 29.7 + 1.1) +
        0.08 * Math.sin(t * 43.1 + 2.4);
      this.wreckFireLight.intensity =
        this.wreckFireTargetIntensity * Math.max(0.42, flicker) * 34;
    } else if (this.wreckFireLight.intensity !== 0) {
      this.wreckFireLight.intensity = 0;
    }
  }

  private updateDebris(dt: number): void {
    if (this.activeDebrisCount === 0) return;

    const gravity = -16.5;
    let totalAlive = 0;
    const kindAlive = [0, 0, 0, 0];
    const kindDirty = [false, false, false, false];
    const dummy = this.debrisDummy;

    for (let i = 0; i < MAX_DEBRIS; i += 1) {
      let life = this.debrisLife[i];
      if (life <= 0) continue;

      const kind = this.debrisKind[i];
      const subSlot = this.debrisSubSlot[i];
      life -= dt;
      this.debrisLife[i] = life;
      kindDirty[kind] = true;

      if (life <= 0) {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.debrisMeshes[kind].setMatrixAt(subSlot, dummy.matrix);
        continue;
      }

      totalAlive += 1;
      kindAlive[kind] += 1;

      let x = this.debrisX[i];
      let y = this.debrisY[i];
      let z = this.debrisZ[i];
      let vx = this.debrisVX[i];
      let vy = this.debrisVY[i];
      let vz = this.debrisVZ[i];
      const groundFloor = this.debrisGroundY[i] + this.debrisRadius[i];

      // 空気抵抗 & 重力
      const airDrag = Math.exp(-0.22 * dt);
      vx *= airDrag;
      vz *= airDrag;
      vy += gravity * dt;

      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      // 地面バウンド（1〜2回跳ねてから転がり減速）
      if (y <= groundFloor) {
        y = groundFloor;
        if (Math.abs(vy) > 1.35 && this.debrisBounces[i] < 2) {
          this.debrisBounces[i] += 1;
          vy = Math.abs(vy) * this.debrisRestitution[i];
          const horizDamp = kind === DEBRIS_KIND_TIRE ? 0.8 : 0.64;
          vx *= horizDamp;
          vz *= horizDamp;
          this.debrisVRX[i] *= 0.72;
          this.debrisVRY[i] *= 0.72;
          this.debrisVRZ[i] *= 0.72;
        } else {
          vy = 0;
          const groundFriction = Math.exp(
            -(kind === DEBRIS_KIND_TIRE ? 1.8 : 4.2) * dt,
          );
          vx *= groundFriction;
          vz *= groundFriction;
          this.debrisVRX[i] *= groundFriction;
          this.debrisVRY[i] *= groundFriction;
          this.debrisVRZ[i] *= groundFriction;
        }
      }

      this.debrisX[i] = x;
      this.debrisY[i] = y;
      this.debrisZ[i] = z;
      this.debrisVX[i] = vx;
      this.debrisVY[i] = vy;
      this.debrisVZ[i] = vz;

      this.debrisRX[i] += this.debrisVRX[i] * dt;
      this.debrisRY[i] += this.debrisVRY[i] * dt;
      this.debrisRZ[i] += this.debrisVRZ[i] * dt;

      // 飛散中の高温破片から細い煙の尾を引く
      if (this.debrisTrailFlag[i] === 1) {
        const speedSq = vx * vx + vy * vy + vz * vz;
        if (speedSq > 2.8) {
          this.debrisTrailTimer[i] -= dt;
          if (this.debrisTrailTimer[i] <= 0) {
            this.debrisTrailTimer[i] = 0.055;
            this.emitEngineSmoke(x, y, z, 0.86, 0.48, vx * 0.12, vz * 0.12, 0.4, 0.55);
          }
        }
      }

      // 消滅直前 1.2 秒で自然に縮小フェードアウト
      const fadeScale = life < 1.2 ? Math.max(0.001, life / 1.2) : 1.0;
      dummy.position.set(x, y, z);
      dummy.rotation.set(this.debrisRX[i], this.debrisRY[i], this.debrisRZ[i]);
      dummy.scale.set(
        this.debrisSX[i] * fadeScale,
        this.debrisSY[i] * fadeScale,
        this.debrisSZ[i] * fadeScale,
      );
      dummy.updateMatrix();
      this.debrisMeshes[kind].setMatrixAt(subSlot, dummy.matrix);
    }

    this.activeDebrisCount = totalAlive;
    for (let k = 0; k < 4; k += 1) {
      if (kindDirty[k]) {
        this.debrisMeshes[k].instanceMatrix.needsUpdate = true;
      }
      this.debrisMeshes[k].visible = kindAlive[k] > 0;
    }
  }

  private updateSparks(dt: number, dpr: number): void {
    if (this.activeSparkCount === 0) {
      if (this.sparkPoints.visible) this.sparkPoints.visible = false;
      return;
    }

    this.sparkMat.uniforms.uPixelRatio.value = Math.min(1.5, Math.max(0.75, dpr));

    let alive = 0;
    const pos = this.sparkPosArray;
    const vel = this.sparkVelArray;
    const col = this.sparkColorArray;
    const sizes = this.sparkSizeArray;
    const alphas = this.sparkAlphaArray;
    const gravity = -15.5;
    const dragFactor = Math.exp(-1.7 * dt);

    for (let i = 0; i < MAX_SPARKS; i += 1) {
      let life = this.sparkLife[i];
      if (life <= 0) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }

      life -= dt;
      this.sparkLife[i] = life;
      if (life <= 0) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }

      alive += 1;
      let vx = this.sparkVX[i] * dragFactor;
      let vy = this.sparkVY[i] + gravity * dt;
      let vz = this.sparkVZ[i] * dragFactor;

      let x = this.sparkX[i] + vx * dt;
      let y = this.sparkY[i] + vy * dt;
      let z = this.sparkZ[i] + vz * dt;

      if (y < 0.03) {
        y = 0.03;
        vy = Math.abs(vy) * 0.44;
        vx *= 0.74;
        vz *= 0.74;
      }

      this.sparkX[i] = x;
      this.sparkY[i] = y;
      this.sparkZ[i] = z;
      this.sparkVX[i] = vx;
      this.sparkVY[i] = vy;
      this.sparkVZ[i] = vz;

      const base = i * 3;
      pos[base] = x;
      pos[base + 1] = y;
      pos[base + 2] = z;
      vel[base] = vx;
      vel[base + 1] = vy;
      vel[base + 2] = vz;

      const ratio = life / Math.max(0.01, this.sparkMaxLife[i]);
      const speed = Math.hypot(vx, vy, vz);
      sizes[i] = this.sparkBaseSize[i] * (0.65 + Math.min(1.1, speed * 0.09)) * (0.5 + 0.5 * ratio);
      alphas[i] = Math.min(1, ratio * 1.35);

      // 白熱黄 -> 鮮やかなオレンジ赤へ遷移
      col[base] = 1.0;
      col[base + 1] = 0.35 + 0.65 * ratio;
      col[base + 2] = 0.1 + 0.5 * ratio * ratio;
    }

    this.activeSparkCount = alive;
    this.sparkPoints.visible = alive > 0;
    this.sparkPosAttr.needsUpdate = true;
    this.sparkVelAttr.needsUpdate = true;
    this.sparkColorAttr.needsUpdate = true;
    this.sparkSizeAttr.needsUpdate = true;
    this.sparkAlphaAttr.needsUpdate = true;
  }

  private updateCloudPool(
    pool: ParticlePool,
    dt: number,
    dpr: number,
    windX: number,
    windZ: number,
  ): void {
    if (pool.activeCount === 0) {
      if (pool.points.visible) pool.points.visible = false;
      return;
    }

    pool.material.uniforms.uPixelRatio.value = Math.min(1.5, Math.max(0.75, dpr));

    let alive = 0;
    const cap = pool.capacity;
    const pos = pool.posArray;
    const col = pool.colorArray;
    const isFire = pool.isFire;

    for (let i = 0; i < cap; i += 1) {
      let life = pool.life[i];
      if (life <= 0) {
        pool.alphaArray[i] = 0;
        pool.sizeArray[i] = 0;
        continue;
      }

      life -= dt;
      pool.life[i] = life;
      if (life <= 0) {
        pool.alphaArray[i] = 0;
        pool.sizeArray[i] = 0;
        continue;
      }

      alive += 1;
      const dragFactor = Math.exp(-pool.drag[i] * dt);
      const ws = pool.windScale[i];
      pool.vx[i] = pool.vx[i] * dragFactor + windX * ws * (1 - dragFactor);
      pool.vz[i] = pool.vz[i] * dragFactor + windZ * ws * (1 - dragFactor);
      pool.vy[i] = pool.vy[i] * Math.exp(-0.45 * dt) + pool.riseAccel[i] * dt;

      const base = i * 3;
      pos[base] += pool.vx[i] * dt;
      pos[base + 1] += pool.vy[i] * dt;
      pos[base + 2] += pool.vz[i] * dt;
      pool.angleArray[i] += pool.spinVel[i] * dt;

      const progress = 1 - life / Math.max(0.01, pool.maxLife[i]);
      pool.sizeArray[i] =
        pool.sizeStart[i] + (pool.sizeEnd[i] - pool.sizeStart[i]) * progress;

      if (isFire) {
        // 炎は白黄の高温コアからオレンジ〜赤橙へ冷えながら消散
        const cool = Math.min(1, progress * 1.25);
        col[base] = pool.baseR[i];
        col[base + 1] = pool.baseG[i] * (1 - cool * 0.62);
        col[base + 2] = pool.baseB[i] * (1 - cool * 0.92);
        const fadeIn = Math.min(1, progress / 0.12);
        const fadeOut = 1 - progress;
        pool.alphaArray[i] = pool.alphaPeak[i] * fadeIn * Math.pow(fadeOut, 1.55);
      } else {
        const fadeIn = Math.min(1, progress / 0.16);
        const fadeOut = 1 - progress;
        pool.alphaArray[i] = pool.alphaPeak[i] * fadeIn * fadeOut * fadeOut;
      }
    }

    pool.activeCount = alive;
    pool.points.visible = alive > 0;
    pool.posAttr.needsUpdate = true;
    pool.colorAttr.needsUpdate = true;
    pool.sizeAttr.needsUpdate = true;
    pool.alphaAttr.needsUpdate = true;
    pool.angleAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.sparkPoints);
    this.sparkGeo.dispose();
    this.sparkMat.dispose();

    this.scene.remove(this.smokePool.points);
    this.smokePool.geometry.dispose();
    this.smokePool.material.dispose();

    this.scene.remove(this.firePool.points);
    this.firePool.geometry.dispose();
    this.firePool.material.dispose();

    for (let i = 0; i < this.debrisMeshes.length; i += 1) {
      this.scene.remove(this.debrisMeshes[i]);
      this.debrisGeos[i].dispose();
      this.debrisMats[i].dispose();
    }

    this.scene.remove(this.oilMesh);
    this.oilGeo.dispose();
    this.oilMat.dispose();

    this.scene.remove(this.shockwaveMesh);
    this.shockwaveGeo.dispose();
    this.shockwaveMat.dispose();

    this.scene.remove(this.flashLight);
    this.scene.remove(this.wreckFireLight);

    this.flameTexture.dispose();
    this.smokeTexture.dispose();
    this.sparkTexture.dispose();
    this.oilTexture.dispose();
    this.shockwaveTexture.dispose();
  }
}
