import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { CITY_METRICS } from './collisionWorld';

export type MaterialSourceState = 'procedural' | 'polyhaven-1k';

export interface EnvironmentStatus {
  asphalt: MaterialSourceState;
  pavement: MaterialSourceState;
  sky: MaterialSourceState;
}

export interface CityEnvironmentHandle {
  status: EnvironmentStatus;
  dispose: () => void;
}

interface PolyHavenTextureUrls {
  diffuse: string;
  normal: string;
  roughness: string;
}

interface ProceduralPbrTextures {
  diffuse: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

const POLY_HAVEN_API_BASE = 'https://api.polyhaven.com/files';

/**
 * 1-E: Poly Haven 公式 CC0 1K 素材 (asphalt_01 / concrete_pavement /
 * kloofendal_38d_partly_cloudy_puresky) の取得・適用および
 * オフライン/取得失敗時の高品質プロシージャル PBR フォールバック、
 * ならびに日本の街区（車道・歩道・交差点・横断歩道・車線）を構築する。
 */
export function createCityEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onStatusChange?: (status: EnvironmentStatus) => void,
): CityEnvironmentHandle {
  const envGroup = new THREE.Group();
  envGroup.name = 'JapaneseCityEnvironment';
  scene.add(envGroup);

  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const status: EnvironmentStatus = {
    asphalt: 'procedural',
    pavement: 'procedural',
    sky: 'procedural',
  };

  let isDisposed = false;
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];
  const disposableTextures: THREE.Texture[] = [];

  const notifyStatus = () => {
    if (!isDisposed && onStatusChange) {
      onStatusChange({ ...status });
    }
  };

  // =========================================================================
  // 1. 初期ライティング環境 (軽量 RoomEnvironment PMREM + 青空フォールバック)
  // =========================================================================
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const roomEnv = new RoomEnvironment();
  let currentEnvTarget: THREE.WebGLRenderTarget = pmremGenerator.fromScene(
    roomEnv,
    0.04,
  );
  roomEnv.dispose();
  scene.environment = currentEnvTarget.texture;
  scene.background = new THREE.Color(0x9ec4e6);
  scene.fog = new THREE.Fog(0xb8d4eb, 55, 195);

  // プロシージャル青空スカイドーム (HDRI ロード前または失敗時の自然な空)
  const skyDomeGeo = new THREE.SphereGeometry(185, 24, 16);
  const skyDomeTex = createProceduralSkyTexture();
  const skyDomeMat = new THREE.MeshBasicMaterial({
    map: skyDomeTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  envGroup.add(skyDome);
  disposableGeometries.push(skyDomeGeo);
  disposableMaterials.push(skyDomeMat);
  disposableTextures.push(skyDomeTex);

  // =========================================================================
  // 2. 車道アスファルト (160m x 160m, Y = 0) & 歩道コンクリート (4街区, Y = 0.12)
  // =========================================================================
  const citySize = CITY_METRICS.cityHalfSize * 2; // 160m
  const roadHalf = CITY_METRICS.roadHalfWidth; // 6m
  const sidewalkH = CITY_METRICS.sidewalkHeight; // 0.12m
  const blockSize = CITY_METRICS.cityHalfSize - roadHalf; // 74m
  const blockCenterOffset = roadHalf + blockSize * 0.5; // 43m

  const procAsphalt = createProceduralAsphaltTextures(maxAniso);
  disposableTextures.push(
    procAsphalt.diffuse,
    procAsphalt.roughness,
    procAsphalt.bump,
  );

  const asphaltMaterial = new THREE.MeshStandardMaterial({
    map: procAsphalt.diffuse,
    roughnessMap: procAsphalt.roughness,
    bumpMap: procAsphalt.bump,
    bumpScale: 0.03,
    roughness: 0.92,
    metalness: 0.04,
  });
  disposableMaterials.push(asphaltMaterial);

  const roadGeo = new THREE.PlaneGeometry(citySize, citySize);
  const roadMesh = new THREE.Mesh(roadGeo, asphaltMaterial);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.y = 0;
  roadMesh.receiveShadow = true;
  envGroup.add(roadMesh);
  disposableGeometries.push(roadGeo);

  // 歩道・街区地面 (コンクリート舗装)
  const procPavement = createProceduralPavementTextures(maxAniso);
  disposableTextures.push(
    procPavement.diffuse,
    procPavement.roughness,
    procPavement.bump,
  );

  const pavementMaterial = new THREE.MeshStandardMaterial({
    map: procPavement.diffuse,
    roughnessMap: procPavement.roughness,
    bumpMap: procPavement.bump,
    bumpScale: 0.025,
    roughness: 0.86,
    metalness: 0.04,
  });
  disposableMaterials.push(pavementMaterial);

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6,
    roughness: 0.88,
    metalness: 0.05,
  });
  disposableMaterials.push(curbMaterial);

  const blockGeo = new THREE.BoxGeometry(blockSize, sidewalkH, blockSize);
  disposableGeometries.push(blockGeo);

  const quadrants: ReadonlyArray<[number, number]> = [
    [-blockCenterOffset, -blockCenterOffset],
    [blockCenterOffset, -blockCenterOffset],
    [-blockCenterOffset, blockCenterOffset],
    [blockCenterOffset, blockCenterOffset],
  ];

  for (const [qx, qz] of quadrants) {
    const blockMesh = new THREE.Mesh(blockGeo, [
      curbMaterial,
      curbMaterial,
      pavementMaterial,
      curbMaterial,
      curbMaterial,
      curbMaterial,
    ]);
    blockMesh.position.set(qx, sidewalkH * 0.5, qz);
    blockMesh.receiveShadow = true;
    envGroup.add(blockMesh);
  }

  // =========================================================================
  // 3. 日本の道路標示 (横断歩道・停止線・中央線・車道外側線)
  // =========================================================================
  buildJapaneseRoadMarkings(
    envGroup,
    disposableGeometries,
    disposableMaterials,
  );

  // =========================================================================
  // 4. Poly Haven 公式 CC0 1K 素材の非同期取得＆ホットスワップ
  // =========================================================================
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  const applyPolyHavenTextureSet = async (
    assetId: string,
    material: THREE.MeshStandardMaterial,
    repeatX: number,
    repeatY: number,
    fallbackUrls: PolyHavenTextureUrls,
    statusKey: 'asphalt' | 'pavement',
  ): Promise<void> => {
    const urls =
      (await resolvePolyHavenTextureUrls(assetId)) ?? fallbackUrls;
    if (isDisposed) return;

    try {
      const [diffTex, norTex, roughTex] = await Promise.all([
        loadRepeatedTexture(
          textureLoader,
          urls.diffuse,
          repeatX,
          repeatY,
          maxAniso,
          THREE.SRGBColorSpace,
        ),
        loadRepeatedTexture(
          textureLoader,
          urls.normal,
          repeatX,
          repeatY,
          maxAniso,
          THREE.NoColorSpace,
        ),
        loadRepeatedTexture(
          textureLoader,
          urls.roughness,
          repeatX,
          repeatY,
          maxAniso,
          THREE.NoColorSpace,
        ),
      ]);

      if (isDisposed) {
        diffTex.dispose();
        norTex.dispose();
        roughTex.dispose();
        return;
      }

      disposableTextures.push(diffTex, norTex, roughTex);
      material.map = diffTex;
      material.normalMap = norTex;
      material.normalScale.set(0.85, 0.85);
      material.roughnessMap = roughTex;
      material.bumpMap = null;
      material.needsUpdate = true;

      status[statusKey] = 'polyhaven-1k';
      notifyStatus();
    } catch {
      // オフライン・CORS失敗時は初期のプロシージャル PBR をそのまま維持
    }
  };

  void applyPolyHavenTextureSet(
    'asphalt_01',
    asphaltMaterial,
    32,
    32,
    {
      diffuse:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_diff_1k.jpg',
      normal:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_nor_gl_1k.jpg',
      roughness:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_rough_1k.jpg',
    },
    'asphalt',
  );

  void applyPolyHavenTextureSet(
    'concrete_pavement',
    pavementMaterial,
    18,
    18,
    {
      diffuse:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_pavement/concrete_pavement_diff_1k.jpg',
      normal:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_pavement/concrete_pavement_nor_gl_1k.jpg',
      roughness:
        'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_pavement/concrete_pavement_rough_1k.jpg',
    },
    'pavement',
  );

  // Poly Haven 1K HDRI (kloofendal_38d_partly_cloudy_puresky)
  void (async () => {
    const hdriUrl =
      (await resolvePolyHavenHdriUrl('kloofendal_38d_partly_cloudy_puresky')) ??
      'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_38d_partly_cloudy_puresky_1k.hdr';
    if (isDisposed) return;

    const rgbeLoader = new RGBELoader();
    rgbeLoader.setCrossOrigin('anonymous');

    try {
      const hdrTexture = await rgbeLoader.loadAsync(hdriUrl);
      if (isDisposed) {
        hdrTexture.dispose();
        return;
      }

      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      const nextEnvTarget = pmremGenerator.fromEquirectangular(hdrTexture);
      const prevEnvTarget = currentEnvTarget;
      currentEnvTarget = nextEnvTarget;

      scene.environment = currentEnvTarget.texture;
      scene.background = hdrTexture;
      skyDome.visible = false;

      disposableTextures.push(hdrTexture);
      prevEnvTarget.dispose();

      status.sky = 'polyhaven-1k';
      notifyStatus();
    } catch {
      // 取得失敗時はプロシージャル青空ドーム + RoomEnvironment PMREM を維持
    }
  })();

  notifyStatus();

  return {
    status,
    dispose: () => {
      isDisposed = true;
      scene.remove(envGroup);
      currentEnvTarget.dispose();
      pmremGenerator.dispose();
      for (const g of disposableGeometries) g.dispose();
      for (const m of disposableMaterials) m.dispose();
      for (const t of disposableTextures) t.dispose();
    },
  };
}

/** Poly Haven REST API から 1K テクスチャ URL (Diffuse / Normal / Roughness) を解決 */
async function resolvePolyHavenTextureUrls(
  assetId: string,
): Promise<PolyHavenTextureUrls | null> {
  try {
    const res = await fetch(`${POLY_HAVEN_API_BASE}/${assetId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const diffuse = extractNestedUrl(data, ['Diffuse', '1k', 'jpg', 'url']) ??
      extractNestedUrl(data, ['Diffuse', '1k', 'png', 'url']);
    const normal = extractNestedUrl(data, ['nor_gl', '1k', 'jpg', 'url']) ??
      extractNestedUrl(data, ['nor_gl', '1k', 'png', 'url']);
    const roughness = extractNestedUrl(data, ['Rough', '1k', 'jpg', 'url']) ??
      extractNestedUrl(data, ['Rough', '1k', 'png', 'url']);

    if (diffuse && normal && roughness) {
      return { diffuse, normal, roughness };
    }
    return null;
  } catch {
    return null;
  }
}

/** Poly Haven REST API から 1K HDRI URL を解決 */
async function resolvePolyHavenHdriUrl(assetId: string): Promise<string | null> {
  try {
    const res = await fetch(`${POLY_HAVEN_API_BASE}/${assetId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return extractNestedUrl(data, ['hdri', '1k', 'hdr', 'url']);
  } catch {
    return null;
  }
}

function extractNestedUrl(
  root: Record<string, unknown>,
  keys: string[],
): string | null {
  let cursor: unknown = root;
  for (const key of keys) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor : null;
}

async function loadRepeatedTexture(
  loader: THREE.TextureLoader,
  url: string,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
): Promise<THREE.Texture> {
  const tex = await loader.loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 日本の交差点・横断歩道・停止線・中央線・車道外側線を構築 */
function buildJapaneseRoadMarkings(
  parent: THREE.Group,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): void {
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xeaecef,
    roughness: 0.72,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const yellowMat = new THREE.MeshStandardMaterial({
    color: 0xe3a82b,
    roughness: 0.7,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(whiteMat, yellowMat);

  const y = 0.012;
  const halfCity = CITY_METRICS.cityHalfSize; // 80
  const roadHalf = CITY_METRICS.roadHalfWidth; // 6

  const addStrip = (
    w: number,
    d: number,
    x: number,
    z: number,
    mat: THREE.Material,
  ) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  // 4方向の中央線 (オレンジ実線) と車道外側線 (白実線)
  const segStart = 12.0; // 横断歩道・停止線の外側から開始
  const segLen = halfCity - segStart;
  const segCenter = segStart + segLen * 0.5;
  const outerLineOffset = roadHalf - 0.35;

  // 南北道路 (北側・南側)
  for (const sign of [-1, 1]) {
    addStrip(0.18, segLen, 0, sign * segCenter, yellowMat);
    addStrip(0.16, segLen, -outerLineOffset, sign * segCenter, whiteMat);
    addStrip(0.16, segLen, outerLineOffset, sign * segCenter, whiteMat);
    // 停止線 (日本の左側通行: 交差点進入側)
    addStrip(
      roadHalf - 0.8,
      0.42,
      sign > 0 ? -roadHalf * 0.5 : roadHalf * 0.5,
      sign * 11.4,
      whiteMat,
    );
  }

  // 東西道路 (西側・東側)
  for (const sign of [-1, 1]) {
    addStrip(segLen, 0.18, sign * segCenter, 0, yellowMat);
    addStrip(segLen, 0.16, sign * segCenter, -outerLineOffset, whiteMat);
    addStrip(segLen, 0.16, sign * segCenter, outerLineOffset, whiteMat);
    // 停止線
    addStrip(
      0.42,
      roadHalf - 0.8,
      sign * 11.4,
      sign > 0 ? roadHalf * 0.5 : -roadHalf * 0.5,
      whiteMat,
    );
  }

  // 中央交差点の4方向横断歩道 (ゼブラストライプ)
  const stripeCount = 9;
  const stripeSpan = roadHalf * 2 - 1.4;
  const step = stripeSpan / stripeCount;

  for (let i = 0; i < stripeCount; i += 1) {
    const offset = -stripeSpan * 0.5 + step * (i + 0.5);
    // 北・南の横断歩道
    addStrip(0.55, 3.2, offset, -8.4, whiteMat);
    addStrip(0.55, 3.2, offset, 8.4, whiteMat);
    // 西・東の横断歩道
    addStrip(3.2, 0.55, -8.4, offset, whiteMat);
    addStrip(3.2, 0.55, 8.4, offset, whiteMat);
  }
}

/** プロシージャル アスファルト PBR テクスチャ (512x512, 取得失敗・初期表示用) */
function createProceduralAsphaltTextures(
  anisotropy: number,
): ProceduralPbrTextures {
  const size = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const diffCtx = diffCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  if (diffCtx && roughCtx && bumpCtx) {
    const diffImg = diffCtx.createImageData(size, size);
    const roughImg = roughCtx.createImageData(size, size);
    const bumpImg = bumpCtx.createImageData(size, size);

    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < size * size; i += 1) {
      const n = rand();
      const grain = (n - 0.5) * 34;
      const base = 54 + grain;
      const idx = i * 4;

      diffImg.data[idx] = Math.max(25, Math.min(95, base));
      diffImg.data[idx + 1] = Math.max(25, Math.min(97, base + 2));
      diffImg.data[idx + 2] = Math.max(28, Math.min(102, base + 5));
      diffImg.data[idx + 3] = 255;

      const rVal = Math.max(185, Math.min(248, 215 + grain * 0.9));
      roughImg.data[idx] = rVal;
      roughImg.data[idx + 1] = rVal;
      roughImg.data[idx + 2] = rVal;
      roughImg.data[idx + 3] = 255;

      const bVal = Math.max(40, Math.min(230, 128 + grain * 2.4));
      bumpImg.data[idx] = bVal;
      bumpImg.data[idx + 1] = bVal;
      bumpImg.data[idx + 2] = bVal;
      bumpImg.data[idx + 3] = 255;
    }

    diffCtx.putImageData(diffImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);
    bumpCtx.putImageData(bumpImg, 0, 0);
  }

  return {
    diffuse: makeCanvasTexture(diffCanvas, 32, 32, anisotropy, THREE.SRGBColorSpace),
    roughness: makeCanvasTexture(roughCanvas, 32, 32, anisotropy, THREE.NoColorSpace),
    bump: makeCanvasTexture(bumpCanvas, 32, 32, anisotropy, THREE.NoColorSpace),
  };
}

/** プロシージャル 歩道コンクリートタイル PBR テクスチャ (512x512, 取得失敗・初期表示用) */
function createProceduralPavementTextures(
  anisotropy: number,
): ProceduralPbrTextures {
  const size = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const diffCtx = diffCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  if (diffCtx && roughCtx && bumpCtx) {
    diffCtx.fillStyle = '#aeb3b8';
    diffCtx.fillRect(0, 0, size, size);
    roughCtx.fillStyle = '#d4d4d4';
    roughCtx.fillRect(0, 0, size, size);
    bumpCtx.fillStyle = '#c8c8c8';
    bumpCtx.fillRect(0, 0, size, size);

    // 4x4 歩道コンクリート平板タイルと目地
    const tiles = 4;
    const tileStep = size / tiles;
    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let ty = 0; ty < tiles; ty += 1) {
      for (let tx = 0; tx < tiles; tx += 1) {
        const shade = Math.round(166 + (rand() - 0.5) * 18);
        diffCtx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
        diffCtx.fillRect(
          tx * tileStep + 3,
          ty * tileStep + 3,
          tileStep - 6,
          tileStep - 6,
        );
      }
    }

    // 細かい砂粒ノイズ
    for (let i = 0; i < 4000; i += 1) {
      const px = Math.floor(rand() * size);
      const py = Math.floor(rand() * size);
      const delta = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
      diffCtx.fillStyle = delta;
      diffCtx.fillRect(px, py, 2, 2);
    }

    // 目地ライン
    diffCtx.strokeStyle = 'rgba(72, 76, 82, 0.75)';
    diffCtx.lineWidth = 4;
    bumpCtx.strokeStyle = '#303030';
    bumpCtx.lineWidth = 5;
    roughCtx.strokeStyle = '#f2f2f2';
    roughCtx.lineWidth = 5;

    for (let i = 0; i <= tiles; i += 1) {
      const pos = i * tileStep;
      for (const ctx of [diffCtx, bumpCtx, roughCtx]) {
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
        ctx.stroke();
      }
    }
  }

  return {
    diffuse: makeCanvasTexture(diffCanvas, 18, 18, anisotropy, THREE.SRGBColorSpace),
    roughness: makeCanvasTexture(roughCanvas, 18, 18, anisotropy, THREE.NoColorSpace),
    bump: makeCanvasTexture(bumpCanvas, 18, 18, anisotropy, THREE.NoColorSpace),
  };
}

/** プロシージャル青空グラデーションテクスチャ (HDRI 取得前・失敗時の背景補完) */
function createProceduralSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#3a78c2');
    grad.addColorStop(0.35, '#72ace0');
    grad.addColorStop(0.55, '#c4ddf2');
    grad.addColorStop(0.65, '#e8eff5');
    grad.addColorStop(1.0, '#9aa7b2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeCanvasTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}
