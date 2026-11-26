import * as THREE from 'three';

const MAX_SPARKS = 180;
const MAX_SMOKE = 220;
const MAX_FIRE = 180;
const MAX_OIL_DECALS = 96;

interface ParticlePool {
  readonly capacity: number;
  cursor: number;
  activeCount: number;
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
  readonly posArray: Float32Array;
  readonly colorArray: Float32Array;
  readonly sizeArray: Float32Array;
  readonly alphaArray: Float32Array;
  readonly posAttr: THREE.BufferAttribute;
  readonly colorAttr: THREE.BufferAttribute;
  readonly sizeAttr: THREE.BufferAttribute;
  readonly alphaAttr: THREE.BufferAttribute;
  readonly points: THREE.Points;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(0.8, -mvPosition.z);
    gl_PointSize = clamp(aSize * uPixelRatio * (270.0 / dist), 0.0, 128.0);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.004) discard;
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * vAlpha;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vColor * tex.rgb, alpha);
  }
`;

function createSoftCloudTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.32, 'rgba(255,255,255,0.82)');
    grad.addColorStop(0.68, 'rgba(245,245,245,0.28)');
    grad.addColorStop(1.0, 'rgba(240,240,240,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
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

    // 有機的な黒いオイルしみ本体（複数楕円ブレンド）
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
      grad.addColorStop(0, 'rgba(10, 10, 12, 0.92)');
      grad.addColorStop(0.62, 'rgba(16, 17, 22, 0.72)');
      grad.addColorStop(1, 'rgba(16, 17, 22, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // かすかな油膜の青紫光沢ハイライト
    const sheenGrad = ctx.createRadialGradient(
      cx - size * 0.06,
      cy - size * 0.05,
      2,
      cx,
      cy,
      size * 0.26,
    );
    sheenGrad.addColorStop(0, 'rgba(84, 110, 155, 0.22)');
    sheenGrad.addColorStop(0.5, 'rgba(110, 74, 128, 0.12)');
    sheenGrad.addColorStop(1, 'rgba(40, 48, 60, 0.0)');
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // 周囲の細かい飛沫ドロップ
    for (let i = 0; i < 12; i += 1) {
      const ang = rand() * Math.PI * 2;
      const dist = size * (0.24 + rand() * 0.2);
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist;
      const dr = 1.5 + rand() * 3.5;
      ctx.fillStyle = `rgba(12, 12, 15, ${0.45 + rand() * 0.35})`;
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
    const grad = ctx.createRadialGradient(half, half, half * 0.45, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 220, 150, 0.0)');
    grad.addColorStop(0.58, 'rgba(255, 196, 108, 0.25)');
    grad.addColorStop(0.78, 'rgba(255, 236, 185, 0.92)');
    grad.addColorStop(0.92, 'rgba(255, 140, 48, 0.42)');
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
 * PHASE 5-B: 全車両で共有する軽量ダメージエフェクト＆路面オイル漏れデカールシステム。
 * - M1 iPad Air 60FPS 維持設計:
 *   - 火花: 1ドローコール固定バッファ LineSegments (180本)
 *   - 煙: 1ドローコール固定バッファ Points + カスタムシェーダ (220粒)
 *   - 炎/爆発火球: 1ドローコール固定バッファ Points + カスタムシェーダ (180粒)
 *   - オイル漏れ痕/焦げ跡: 1ドローコール固定容量96枚のリングバッファ InstancedMesh
 *   - 爆発フラッシュ: 常設 PointLight 1基 (castShadow=false、通常時 intensity=0)
 *   - 毎フレームのアロケーションゼロ
 */
export class VehicleDamageEffects {
  private readonly scene: THREE.Scene;
  private readonly cloudTexture: THREE.CanvasTexture;
  private readonly oilTexture: THREE.CanvasTexture;
  private readonly shockwaveTexture: THREE.CanvasTexture;

  // 火花ラインプール
  private readonly sparkLife = new Float32Array(MAX_SPARKS);
  private readonly sparkMaxLife = new Float32Array(MAX_SPARKS);
  private readonly sparkX = new Float32Array(MAX_SPARKS);
  private readonly sparkY = new Float32Array(MAX_SPARKS);
  private readonly sparkZ = new Float32Array(MAX_SPARKS);
  private readonly sparkVX = new Float32Array(MAX_SPARKS);
  private readonly sparkVY = new Float32Array(MAX_SPARKS);
  private readonly sparkVZ = new Float32Array(MAX_SPARKS);
  private readonly sparkPosArray: Float32Array;
  private readonly sparkColorArray: Float32Array;
  private readonly sparkPosAttr: THREE.BufferAttribute;
  private readonly sparkColorAttr: THREE.BufferAttribute;
  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkMat: THREE.LineBasicMaterial;
  private readonly sparkLines: THREE.LineSegments;
  private sparkCursor = 0;
  private activeSparkCount = 0;

  // 煙＆炎ポイントプール
  private readonly smokePool: ParticlePool;
  private readonly firePool: ParticlePool;

  // 路面オイル漏れ＆爆発焦げ跡デカール（リングバッファ InstancedMesh）
  private readonly oilGeo: THREE.PlaneGeometry;
  private readonly oilMat: THREE.MeshBasicMaterial;
  private readonly oilMesh: THREE.InstancedMesh;
  private oilCursor = 0;
  private readonly oilDummy = new THREE.Object3D();
  private readonly oilColorScratch = new THREE.Color();

  // 爆発衝撃波リング + 常設フラッシュライト
  private readonly shockwaveGeo: THREE.PlaneGeometry;
  private readonly shockwaveMat: THREE.MeshBasicMaterial;
  private readonly shockwaveMesh: THREE.Mesh;
  private shockwaveTimer = 0;
  private shockwaveDuration = 0.45;
  private readonly flashLight: THREE.PointLight;
  private flashIntensity = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.cloudTexture = createSoftCloudTexture(64);
    this.oilTexture = createOilStainTexture(128);
    this.shockwaveTexture = createShockwaveTexture(128);

    // 1. 火花 LineSegments（1ドローコール）
    this.sparkPosArray = new Float32Array(MAX_SPARKS * 2 * 3);
    this.sparkColorArray = new Float32Array(MAX_SPARKS * 2 * 3);
    this.sparkPosAttr = new THREE.BufferAttribute(this.sparkPosArray, 3);
    this.sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkColorAttr = new THREE.BufferAttribute(this.sparkColorArray, 3);
    this.sparkColorAttr.setUsage(THREE.DynamicDrawUsage);

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', this.sparkPosAttr);
    this.sparkGeo.setAttribute('color', this.sparkColorAttr);

    this.sparkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.sparkLines = new THREE.LineSegments(this.sparkGeo, this.sparkMat);
    this.sparkLines.name = 'VehicleDamageSparks';
    this.sparkLines.castShadow = false;
    this.sparkLines.receiveShadow = false;
    this.sparkLines.frustumCulled = false;
    this.sparkLines.visible = false;
    this.scene.add(this.sparkLines);

    // 2. 煙プール（NormalBlending・1ドローコール）
    this.smokePool = this.createParticlePool(
      MAX_SMOKE,
      THREE.NormalBlending,
      'VehicleDamageSmoke',
      1,
    );

    // 3. 炎・火球プール（AdditiveBlending・1ドローコール）
    this.firePool = this.createParticlePool(
      MAX_FIRE,
      THREE.AdditiveBlending,
      'VehicleDamageFire',
      2,
    );

    // 4. 路面オイル漏れ＆焦げ跡リングバッファ InstancedMesh（1ドローコール）
    this.oilGeo = new THREE.PlaneGeometry(1, 1);
    this.oilGeo.rotateX(-Math.PI * 0.5);
    this.oilMat = new THREE.MeshBasicMaterial({
      map: this.oilTexture,
      transparent: true,
      opacity: 0.86,
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

    // 初期状態は全スロット非表示（スケール0）
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

    // 5. 爆発衝撃波リング + 常設爆発フラッシュライト（castShadow = false）
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

    this.flashLight = new THREE.PointLight(0xff8a2b, 0, 34, 1.5);
    this.flashLight.castShadow = false;
    this.flashLight.position.set(0, -50, 0);
    this.scene.add(this.flashLight);
  }

  private createParticlePool(
    capacity: number,
    blending: THREE.Blending,
    name: string,
    renderOrder: number,
  ): ParticlePool {
    const posArray = new Float32Array(capacity * 3);
    const colorArray = new Float32Array(capacity * 3);
    const sizeArray = new Float32Array(capacity);
    const alphaArray = new Float32Array(capacity);

    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.BufferAttribute(colorArray, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(sizeArray, 1);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(alphaArray, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('color', colorAttr);
    geometry.setAttribute('aSize', sizeAttr);
    geometry.setAttribute('aAlpha', alphaAttr);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.cloudTexture },
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
      posArray,
      colorArray,
      sizeArray,
      alphaArray,
      posAttr,
      colorAttr,
      sizeAttr,
      alphaAttr,
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
    const count = Math.round(12 + Math.max(0, Math.min(1, intensity01)) * 30);
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
      );
    }
  }

  /** 耐久 40% 以下のエンジン付近から散る小さな電気・金属火花 */
  public emitDamageSparks(worldX: number, worldY: number, worldZ: number): void {
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 3.6;
      this.spawnSpark(
        worldX + (Math.random() - 0.5) * 0.32,
        worldY + (Math.random() - 0.5) * 0.16,
        worldZ + (Math.random() - 0.5) * 0.32,
        Math.cos(ang) * spd,
        1.6 + Math.random() * 2.8,
        Math.sin(ang) * spd,
        0.2 + Math.random() * 0.26,
      );
    }
  }

  /** エンジン付近からの白煙（70%以下）または黒煙（40%以下・発火・残骸）を1粒放出 */
  public emitEngineSmoke(
    worldX: number,
    worldY: number,
    worldZ: number,
    darkness01: number,
    intensity = 1,
    inheritVx = 0,
    inheritVz = 0,
  ): void {
    const dark = Math.max(0, Math.min(1, darkness01));
    const shade = 0.86 - dark * 0.72 + (Math.random() - 0.5) * 0.06;
    const clampedShade = Math.max(0.08, Math.min(0.92, shade));
    this.spawnCloudParticle(
      this.smokePool,
      worldX + (Math.random() - 0.5) * 0.34,
      worldY + Math.random() * 0.16,
      worldZ + (Math.random() - 0.5) * 0.34,
      inheritVx * 0.28 + (Math.random() - 0.5) * 0.75,
      1.15 + Math.random() * 1.15 * intensity,
      inheritVz * 0.28 + (Math.random() - 0.5) * 0.75,
      0.75 + Math.random() * 0.55,
      (0.32 + Math.random() * 0.22) * intensity,
      (1.15 + Math.random() * 0.85) * intensity,
      (0.28 + dark * 0.38) * Math.min(1.2, intensity),
      clampedShade,
      clampedShade * (1 - dark * 0.03),
      clampedShade * (1 + (1 - dark) * 0.04),
      1.6,
      0.55,
    );
  }

  /** 発火カウントダウン中および残骸残り火の炎パーティクルを放出 */
  public emitFireFlame(
    worldX: number,
    worldY: number,
    worldZ: number,
    scale = 1,
  ): void {
    const hot = Math.random();
    const r = 1.0;
    const g = 0.38 + hot * 0.52;
    const b = 0.06 + hot * 0.18;
    this.spawnCloudParticle(
      this.firePool,
      worldX + (Math.random() - 0.5) * 0.58 * scale,
      worldY + Math.random() * 0.24,
      worldZ + (Math.random() - 0.5) * 0.65 * scale,
      (Math.random() - 0.5) * 1.1,
      1.8 + Math.random() * 2.4 * scale,
      (Math.random() - 0.5) * 1.1,
      0.3 + Math.random() * 0.32,
      (0.45 + Math.random() * 0.32) * scale,
      (0.85 + Math.random() * 0.55) * scale,
      0.78,
      r,
      g,
      b,
      2.2,
      1.2,
    );
  }

  /** 耐久 40% 以下の走行中に路面へ黒いオイル漏れ痕を1つ残す（リングバッファ上書き） */
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
      worldX + (Math.random() - 0.5) * (isCharMark ? 0.1 : 0.22),
      groundY + (isCharMark ? 0.02 : 0.019),
      worldZ + (Math.random() - 0.5) * (isCharMark ? 0.1 : 0.22),
    );
    this.oilDummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.oilDummy.scale.set(sx, 1, sz);
    this.oilDummy.updateMatrix();

    this.oilMesh.setMatrixAt(slot, this.oilDummy.matrix);
    this.oilColorScratch.setHex(isCharMark ? 0x161414 : 0xffffff);
    this.oilMesh.setColorAt(slot, this.oilColorScratch);
    this.oilMesh.instanceMatrix.needsUpdate = true;
    if (this.oilMesh.instanceColor) {
      this.oilMesh.instanceColor.needsUpdate = true;
    }
  }

  /** 大爆発エフェクト（巨大火球・爆風黒煙・火花乱舞・衝撃波リング・爆発フラッシュ・路面焦げ跡） */
  public triggerExplosion(worldX: number, groundY: number, worldZ: number): void {
    const baseY = groundY + 0.75;

    // 1. 巨大な火球バースト（約 64 粒）
    for (let i = 0; i < 64; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.65;
      const spd = 2.2 + Math.random() * 9.5;
      const isCore = i < 18;
      this.spawnCloudParticle(
        this.firePool,
        worldX + (Math.random() - 0.5) * 0.85,
        baseY + (Math.random() - 0.3) * 0.6,
        worldZ + (Math.random() - 0.5) * 0.85,
        Math.cos(theta) * Math.sin(phi) * spd,
        1.5 + Math.cos(phi) * spd * 0.85 + Math.random() * 2.5,
        Math.sin(theta) * Math.sin(phi) * spd,
        isCore ? 0.35 + Math.random() * 0.3 : 0.55 + Math.random() * 0.55,
        isCore ? 1.15 + Math.random() * 0.6 : 0.85 + Math.random() * 0.55,
        isCore ? 2.4 + Math.random() * 0.9 : 2.9 + Math.random() * 1.4,
        isCore ? 0.96 : 0.82,
        1.0,
        isCore ? 0.86 : 0.36 + Math.random() * 0.34,
        isCore ? 0.45 : 0.05,
        2.6,
        1.4,
      );
    }

    // 2. 立ち昇る爆発黒煙（約 46 粒）
    for (let i = 0; i < 46; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 5.8;
      const shade = 0.08 + Math.random() * 0.14;
      this.spawnCloudParticle(
        this.smokePool,
        worldX + (Math.random() - 0.5) * 1.2,
        baseY + Math.random() * 0.7,
        worldZ + (Math.random() - 0.5) * 1.2,
        Math.cos(ang) * spd,
        2.6 + Math.random() * 5.2,
        Math.sin(ang) * spd,
        1.3 + Math.random() * 1.2,
        0.95 + Math.random() * 0.6,
        3.4 + Math.random() * 2.1,
        0.74,
        shade,
        shade * 0.96,
        shade * 0.94,
        1.9,
        0.85,
      );
    }

    // 3. 四方へ飛び散る金属火花・火の粉（約 72 本）
    for (let i = 0; i < 72; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5.0 + Math.random() * 15.0;
      this.spawnSpark(
        worldX + (Math.random() - 0.5) * 0.8,
        baseY + Math.random() * 0.6,
        worldZ + (Math.random() - 0.5) * 0.8,
        Math.cos(ang) * spd,
        4.2 + Math.random() * 9.5,
        Math.sin(ang) * spd,
        0.48 + Math.random() * 0.65,
      );
    }

    // 4. 地面の爆発焦げ跡デカール
    this.stampOilDrop(worldX, groundY, worldZ, 3.2, true);

    // 5. 衝撃波リング & 一時的爆発フラッシュ光
    this.shockwaveMesh.position.set(worldX, groundY + 0.14, worldZ);
    this.shockwaveMesh.scale.set(1.2, 1, 1.2);
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.opacity = 0.92;
    this.shockwaveDuration = 0.48;
    this.shockwaveTimer = this.shockwaveDuration;

    this.flashLight.position.set(worldX, groundY + 2.2, worldZ);
    this.flashIntensity = 135;
    this.flashLight.intensity = this.flashIntensity;
  }

  private spawnSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
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
    this.activeSparkCount = Math.min(MAX_SPARKS, this.activeSparkCount + 1);
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
    pool.colorArray[base] = r;
    pool.colorArray[base + 1] = g;
    pool.colorArray[base + 2] = b;
    pool.sizeArray[i] = sizeStart;
    pool.alphaArray[i] = alphaPeak;
    pool.activeCount = Math.min(pool.capacity, pool.activeCount + 1);
  }

  public update(dt: number, dpr = 1): void {
    const clampedDt = Math.min(dt, 0.05);

    this.updateSparks(clampedDt);
    this.updateCloudPool(this.smokePool, clampedDt, dpr);
    this.updateCloudPool(this.firePool, clampedDt, dpr);

    // 衝撃波リング更新
    if (this.shockwaveTimer > 0) {
      this.shockwaveTimer = Math.max(0, this.shockwaveTimer - clampedDt);
      const t = 1 - this.shockwaveTimer / this.shockwaveDuration;
      const radius = 1.4 + t * 12.5;
      this.shockwaveMesh.scale.set(radius, 1, radius);
      this.shockwaveMat.opacity = (1 - t) * (1 - t) * 0.92;
      if (this.shockwaveTimer <= 0) {
        this.shockwaveMesh.visible = false;
      }
    }

    // 爆発フラッシュライト減衰
    if (this.flashIntensity > 0.05) {
      this.flashIntensity *= Math.exp(-8.5 * clampedDt);
      this.flashLight.intensity = this.flashIntensity;
    } else if (this.flashLight.intensity !== 0) {
      this.flashIntensity = 0;
      this.flashLight.intensity = 0;
    }
  }

  private updateSparks(dt: number): void {
    if (this.activeSparkCount === 0) {
      if (this.sparkLines.visible) this.sparkLines.visible = false;
      return;
    }

    let alive = 0;
    const pos = this.sparkPosArray;
    const col = this.sparkColorArray;
    const gravity = -15.5;
    const dragFactor = Math.exp(-1.8 * dt);

    for (let i = 0; i < MAX_SPARKS; i += 1) {
      let life = this.sparkLife[i];
      const base = i * 6;
      if (life <= 0) {
        pos[base] = 0;
        pos[base + 1] = -200;
        pos[base + 2] = 0;
        pos[base + 3] = 0;
        pos[base + 4] = -200;
        pos[base + 5] = 0;
        continue;
      }

      life -= dt;
      this.sparkLife[i] = life;
      if (life <= 0) {
        pos[base + 1] = -200;
        pos[base + 4] = -200;
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
        vy = Math.abs(vy) * 0.42;
        vx *= 0.72;
        vz *= 0.72;
      }

      this.sparkX[i] = x;
      this.sparkY[i] = y;
      this.sparkZ[i] = z;
      this.sparkVX[i] = vx;
      this.sparkVY[i] = vy;
      this.sparkVZ[i] = vz;

      const ratio = life / Math.max(0.01, this.sparkMaxLife[i]);
      const tailDt = 0.032;

      // 先端
      pos[base] = x;
      pos[base + 1] = y;
      pos[base + 2] = z;
      // 軌跡尾
      pos[base + 3] = x - vx * tailDt;
      pos[base + 4] = Math.max(0.02, y - vy * tailDt);
      pos[base + 5] = z - vz * tailDt;

      // 白熱黄 -> オレンジ赤へ減光
      col[base] = 1.0 * ratio;
      col[base + 1] = (0.52 + 0.48 * ratio) * ratio;
      col[base + 2] = 0.25 * ratio * ratio;

      col[base + 3] = 0.9 * ratio;
      col[base + 4] = 0.28 * ratio * ratio;
      col[base + 5] = 0.04 * ratio * ratio;
    }

    this.activeSparkCount = alive;
    this.sparkLines.visible = alive > 0;
    this.sparkPosAttr.needsUpdate = true;
    this.sparkColorAttr.needsUpdate = true;
  }

  private updateCloudPool(pool: ParticlePool, dt: number, dpr: number): void {
    if (pool.activeCount === 0) {
      if (pool.points.visible) pool.points.visible = false;
      return;
    }

    pool.material.uniforms.uPixelRatio.value = Math.min(1.5, Math.max(0.75, dpr));

    let alive = 0;
    const cap = pool.capacity;
    const pos = pool.posArray;

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
      pool.vx[i] *= dragFactor;
      pool.vz[i] *= dragFactor;
      pool.vy[i] = pool.vy[i] * Math.exp(-0.5 * dt) + pool.riseAccel[i] * dt;

      const base = i * 3;
      pos[base] += pool.vx[i] * dt;
      pos[base + 1] += pool.vy[i] * dt;
      pos[base + 2] += pool.vz[i] * dt;

      const progress = 1 - life / Math.max(0.01, pool.maxLife[i]);
      pool.sizeArray[i] =
        pool.sizeStart[i] + (pool.sizeEnd[i] - pool.sizeStart[i]) * progress;

      // 素早く出現して滑らかに消散するフェードカーブ
      const fadeIn = Math.min(1, progress / 0.14);
      const fadeOut = 1 - progress;
      pool.alphaArray[i] = pool.alphaPeak[i] * fadeIn * fadeOut * fadeOut;
    }

    pool.activeCount = alive;
    pool.points.visible = alive > 0;
    pool.posAttr.needsUpdate = true;
    pool.colorAttr.needsUpdate = true;
    pool.sizeAttr.needsUpdate = true;
    pool.alphaAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.scene.remove(this.sparkLines);
    this.sparkGeo.dispose();
    this.sparkMat.dispose();

    this.scene.remove(this.smokePool.points);
    this.smokePool.geometry.dispose();
    this.smokePool.material.dispose();

    this.scene.remove(this.firePool.points);
    this.firePool.geometry.dispose();
    this.firePool.material.dispose();

    this.scene.remove(this.oilMesh);
    this.oilGeo.dispose();
    this.oilMat.dispose();

    this.scene.remove(this.shockwaveMesh);
    this.shockwaveGeo.dispose();
    this.shockwaveMat.dispose();

    this.scene.remove(this.flashLight);

    this.cloudTexture.dispose();
    this.oilTexture.dispose();
    this.shockwaveTexture.dispose();
  }
}
