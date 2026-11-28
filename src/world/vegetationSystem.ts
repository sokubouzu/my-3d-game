import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import { CITY_METRICS } from './collisionWorld';

export type TreeSpecies = 'zelkova' | 'broadleaf';

export interface VegetationTreePlacement {
  id: string;
  x: number;
  z: number;
  baseY: number;
  scale: number;
  yaw: number;
  hasPit: boolean;
  species: TreeSpecies;
  tintHex: number;
}

export interface RealisticLawnPbrBundle {
  material: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
}

export interface RealisticTreesResult {
  vegetationMaterials: THREE.MeshStandardMaterial[];
  totalTrianglesPerSpecies: Record<TreeSpecies, number>;
}

export interface G2bGrassHandle {
  group: THREE.Group;
  dispose: () => void;
}

const OPTIMIZED_GRASS_GLB_URL =
  './assets/props/optimized/simple_grass_chunks_opt.glb';

// ===========================================================================
// 決定的擬似乱数＆テクスチャヘルパー
// ===========================================================================

function createPrng(initialSeed: number): () => number {
  let s = initialSeed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 2D 高さマップ（Float32Array 0..1）からシームレスなタンジェント空間法線マップを生成する。
 */
function createNormalTextureFromHeight(
  heights: Float32Array,
  size: number,
  strength: number,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const mask = size - 1;
  const isPow2 = (size & mask) === 0;
  const idx = (x: number, y: number) => {
    const wx = isPow2 ? x & mask : ((x % size) + size) % size;
    const wy = isPow2 ? y & mask : ((y % size) + size) % size;
    return wy * size + wx;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tl = heights[idx(x - 1, y - 1)];
      const t = heights[idx(x, y - 1)];
      const tr = heights[idx(x + 1, y - 1)];
      const l = heights[idx(x - 1, y)];
      const r = heights[idx(x + 1, y)];
      const bl = heights[idx(x - 1, y + 1)];
      const b = heights[idx(x, y + 1)];
      const br = heights[idx(x + 1, y + 1)];

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const out = (y * size + x) * 4;
      data[out] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
      data[out + 1] = Math.max(
        0,
        Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)),
      );
      data[out + 2] = Math.max(
        0,
        Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)),
      );
      data[out + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 2D 粗さ値（0..1）からグレースケール RoughnessMap を生成する。
 */
function createRoughnessTextureFromField(
  roughnessField: Float32Array,
  size: number,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const v = Math.max(
      0,
      Math.min(255, Math.round(roughnessField[i] * 255)),
    );
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * アルファカットアウト用キャンバスに対し、透明ピクセルの RGB を近傍不透明葉色で埋める
 * （ミップマップ縮小時の白フチ・黒フチを完全に防止）。
 */
function applyAlphaBleedToCanvas(
  ctx: CanvasRenderingContext2D,
  size: number,
  fallbackR: number,
  fallbackG: number,
  fallbackB: number,
  passes = 10,
): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const total = size * size;
  const valid = new Uint8Array(total);
  const nextValid = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    if (d[i * 4 + 3] >= 28) {
      valid[i] = 1;
    }
  }

  for (let p = 0; p < passes; p += 1) {
    nextValid.set(valid);
    for (let y = 0; y < size; y += 1) {
      const row = y * size;
      for (let x = 0; x < size; x += 1) {
        const i = row + x;
        if (valid[i]) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let cnt = 0;
        if (x > 0 && valid[i - 1]) {
          const o = (i - 1) * 4;
          sr += d[o];
          sg += d[o + 1];
          sb += d[o + 2];
          cnt += 1;
        }
        if (x + 1 < size && valid[i + 1]) {
          const o = (i + 1) * 4;
          sr += d[o];
          sg += d[o + 1];
          sb += d[o + 2];
          cnt += 1;
        }
        if (y > 0 && valid[i - size]) {
          const o = (i - size) * 4;
          sr += d[o];
          sg += d[o + 1];
          sb += d[o + 2];
          cnt += 1;
        }
        if (y + 1 < size && valid[i + size]) {
          const o = (i + size) * 4;
          sr += d[o];
          sg += d[o + 1];
          sb += d[o + 2];
          cnt += 1;
        }
        if (cnt > 0) {
          const o = i * 4;
          d[o] = (sr / cnt) | 0;
          d[o + 1] = (sg / cnt) | 0;
          d[o + 2] = (sb / cnt) | 0;
          nextValid[i] = 1;
        }
      }
    }
    valid.set(nextValid);
  }

  for (let i = 0; i < total; i += 1) {
    if (!valid[i]) {
      const o = i * 4;
      d[o] = fallbackR;
      d[o + 1] = fallbackG;
      d[o + 2] = fallbackB;
    }
  }

  ctx.putImageData(img, 0, 0);
}

// ===========================================================================
// 1. 高精細プロシージャル PBR 公園芝生（1024px BaseColor + 512px Normal / Roughness）
// ===========================================================================

export function createRealisticLawnPbr(
  anisotropy: number,
  repeatX: number,
  repeatY: number,
): RealisticLawnPbrBundle {
  const colorSize = 1024;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = colorSize;
  mapCanvas.height = colorSize;
  const ctx = mapCanvas.getContext('2d');

  const pbrSize = 512;
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = pbrSize;
  heightCanvas.height = pbrSize;
  const hCtx = heightCanvas.getContext('2d');

  const rand = createPrng(92041);

  if (ctx && hCtx) {
    // 1. 下層の土壌＋枯芝サッチ層（自然で単色に見えない深いベース）
    ctx.fillStyle = '#334c26';
    ctx.fillRect(0, 0, colorSize, colorSize);
    hCtx.fillStyle = '#262626';
    hCtx.fillRect(0, 0, pbrSize, pbrSize);

    const drawWrappedCircle = (
      targetCtx: CanvasRenderingContext2D,
      sz: number,
      x: number,
      y: number,
      r: number,
      fill: string,
    ) => {
      targetCtx.fillStyle = fill;
      for (let ox = -1; ox <= 1; ox += 1) {
        const cx = x + ox * sz;
        if (cx + r < 0 || cx - r > sz) continue;
        for (let oy = -1; oy <= 1; oy += 1) {
          const cy = y + oy * sz;
          if (cy + r < 0 || cy - r > sz) continue;
          targetCtx.beginPath();
          targetCtx.arc(cx, cy, r, 0, Math.PI * 2);
          targetCtx.fill();
        }
      }
    };

    // 2. シームレスな有機パッチ（日向の若芝・日陰の深緑・わずかな土と枯れ葉ムラ）
    for (let i = 0; i < 240; i += 1) {
      const x = rand() * colorSize;
      const y = rand() * colorSize;
      const r = 24 + rand() * 68;
      const kind = rand();
      const col =
        kind < 0.42
          ? 'rgba(76, 118, 46, 0.22)'
          : kind < 0.78
            ? 'rgba(38, 68, 28, 0.24)'
            : 'rgba(92, 84, 52, 0.14)';
      drawWrappedCircle(ctx, colorSize, x, y, r, col);
      drawWrappedCircle(
        hCtx,
        pbrSize,
        x * 0.5,
        y * 0.5,
        r * 0.5,
        kind < 0.42 ? 'rgba(130, 130, 130, 0.20)' : 'rgba(60, 60, 60, 0.18)',
      );
    }

    // 3. 芝の葉群（カーブした細い草の葉を3層重ね：下層暗め → 中層緑 → 上層日向ハイライト）
    const bladeCount = 19000;
    ctx.lineCap = 'round';
    hCtx.lineCap = 'round';
    for (let i = 0; i < bladeCount; i += 1) {
      const layer = i < 6500 ? 0 : i < 14500 ? 1 : 2;
      const x = rand() * colorSize;
      const y = rand() * colorSize;
      const len = (layer === 0 ? 7 : layer === 1 ? 10 : 12) + rand() * 9;
      const ang = rand() * Math.PI * 2;
      const bend = (rand() - 0.5) * 0.85;
      const mx = x + Math.cos(ang) * len * 0.55;
      const my = y + Math.sin(ang) * len * 0.55;
      const ex = x + Math.cos(ang + bend) * len;
      const ey = y + Math.sin(ang + bend) * len;

      const isDry = rand() < 0.085;
      let rCol: number;
      let gCol: number;
      let bCol: number;
      if (isDry) {
        const v = 98 + rand() * 44;
        rCol = Math.floor(v * 1.12);
        gCol = Math.floor(v * 1.0);
        bCol = Math.floor(v * 0.58);
      } else if (layer === 0) {
        gCol = Math.floor(62 + rand() * 28);
        rCol = Math.floor(gCol * 0.64);
        bCol = Math.floor(gCol * 0.42);
      } else if (layer === 1) {
        gCol = Math.floor(92 + rand() * 38);
        rCol = Math.floor(gCol * 0.63 + rand() * 10);
        bCol = Math.floor(gCol * 0.4);
      } else {
        gCol = Math.floor(118 + rand() * 42);
        rCol = Math.floor(gCol * 0.68 + rand() * 12);
        bCol = Math.floor(gCol * 0.42);
      }

      const lw = layer === 0 ? 1.8 : layer === 1 ? 1.45 : 1.15;
      ctx.strokeStyle = `rgb(${rCol},${gCol},${bCol})`;
      ctx.lineWidth = lw;

      const hVal = layer === 0 ? 108 : layer === 1 ? 172 : 232;
      hCtx.strokeStyle = `rgb(${hVal},${hVal},${hVal})`;
      hCtx.lineWidth = lw * 0.65;

      // シームレス境界ラップ描画
      const margin = 22;
      const oxList = x < margin ? [0, 1] : x > colorSize - margin ? [0, -1] : [0];
      const oyList = y < margin ? [0, 1] : y > colorSize - margin ? [0, -1] : [0];
      for (const ox of oxList) {
        for (const oy of oyList) {
          const dx = ox * colorSize;
          const dy = oy * colorSize;
          ctx.beginPath();
          ctx.moveTo(x + dx, y + dy);
          ctx.quadraticCurveTo(mx + dx, my + dy, ex + dx, ey + dy);
          ctx.stroke();

          if (i % 2 === 0) {
            hCtx.beginPath();
            hCtx.moveTo((x + dx) * 0.5, (y + dy) * 0.5);
            hCtx.quadraticCurveTo(
              (mx + dx) * 0.5,
              (my + dy) * 0.5,
              (ex + dx) * 0.5,
              (ey + dy) * 0.5,
            );
            hCtx.stroke();
          }
        }
      }
    }

    // 4. ごくわずかなクローバー・野草の小点アクセント
    for (let i = 0; i < 160; i += 1) {
      const cx = rand() * colorSize;
      const cy = rand() * colorSize;
      for (let k = 0; k < 3; k += 1) {
        const a = (k / 3) * Math.PI * 2 + rand() * 0.5;
        drawWrappedCircle(
          ctx,
          colorSize,
          cx + Math.cos(a) * 3.5,
          cy + Math.sin(a) * 3.5,
          2.2 + rand() * 1.4,
          'rgba(104, 146, 68, 0.72)',
        );
      }
    }
  }

  const baseColorTex = new THREE.CanvasTexture(mapCanvas);
  baseColorTex.wrapS = THREE.RepeatWrapping;
  baseColorTex.wrapT = THREE.RepeatWrapping;
  baseColorTex.repeat.set(repeatX, repeatY);
  baseColorTex.anisotropy = anisotropy;
  baseColorTex.colorSpace = THREE.SRGBColorSpace;
  baseColorTex.needsUpdate = true;

  // 高さマップから法線マップ＆ラフネスマップを合成
  const heights = new Float32Array(pbrSize * pbrSize);
  const roughs = new Float32Array(pbrSize * pbrSize);
  if (hCtx) {
    const hImg = hCtx.getImageData(0, 0, pbrSize, pbrSize).data;
    for (let i = 0; i < pbrSize * pbrSize; i += 1) {
      const h = hImg[i * 4] / 255;
      heights[i] = h;
      // 草の穂先はわずかに光沢(0.78)、下層の土・枯草はマット(0.96)
      roughs[i] = 0.96 - h * 0.18;
    }
  }

  const normalTex = createNormalTextureFromHeight(
    heights,
    pbrSize,
    1.55,
    anisotropy,
    repeatX,
    repeatY,
  );
  const roughTex = createRoughnessTextureFromField(
    roughs,
    pbrSize,
    anisotropy,
    repeatX,
    repeatY,
  );

  const material = new THREE.MeshStandardMaterial({
    map: baseColorTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: roughTex,
    roughness: 0.94,
    metalness: 0.0,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });

  return {
    material,
    textures: [baseColorTex, normalTex, roughTex],
  };
}

// ===========================================================================
// 2. 高精細プロシージャル PBR 樹皮（512px BaseColor + Normal + Roughness）
// ===========================================================================

function createRealisticBarkPbr(anisotropy: number): {
  material: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
} {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext('2d');

  const rand = createPrng(51337);

  if (ctx && hCtx) {
    // 日本のケヤキ・クスノキ系の落ち着いた灰褐色樹皮ベース
    ctx.fillStyle = '#534a40';
    ctx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#888888';
    hCtx.fillRect(0, 0, size, size);

    // 縦方向の樹皮の畝（うね）と裂け目を多層描画（シームレスラップ）
    for (let i = 0; i < 480; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 3 + rand() * 11;
      const h = 42 + rand() * 130;
      const isFurrow = rand() < 0.45;
      const base = isFurrow ? 42 + rand() * 26 : 82 + rand() * 38;
      const r = Math.floor(base + 11);
      const g = Math.floor(base + 5);
      const b = Math.floor(base - 3);
      const col = `rgba(${r},${g},${b},${isFurrow ? 0.55 : 0.44})`;
      const hVal = isFurrow ? Math.floor(32 + rand() * 44) : Math.floor(155 + rand() * 75);
      const hCol = `rgba(${hVal},${hVal},${hVal},0.55)`;

      for (let oy = -1; oy <= 1; oy += 1) {
        const ry = y + oy * size;
        if (ry + h < 0 || ry > size) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, ry, w, h);
        hCtx.fillStyle = hCol;
        hCtx.fillRect(x, ry, w, h);
      }
    }

    // 細かい縦筋・亀裂・皮目（横方向の微細ライン）
    for (let i = 0; i < 900; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 14 + rand() * 52;
      const drift = (rand() - 0.5) * 8;
      const dark = rand() < 0.62;
      ctx.strokeStyle = dark
        ? 'rgba(26, 22, 18, 0.52)'
        : 'rgba(128, 118, 104, 0.36)';
      ctx.lineWidth = 1 + rand() * 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + drift, y + len);
      ctx.stroke();

      hCtx.strokeStyle = dark
        ? 'rgba(18, 18, 18, 0.6)'
        : 'rgba(225, 225, 225, 0.42)';
      hCtx.lineWidth = ctx.lineWidth;
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x + drift, y + len);
      hCtx.stroke();
    }

    // ごく控えめな横皮目（ケヤキ特有の表情）＆苔のニュアンス
    for (let i = 0; i < 160; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const lw = 8 + rand() * 18;
      ctx.fillStyle =
        rand() < 0.78
          ? 'rgba(138, 126, 110, 0.28)'
          : 'rgba(66, 86, 52, 0.24)';
      ctx.fillRect(x, y, lw, 2 + rand() * 2);
    }
  }

  const mapTex = new THREE.CanvasTexture(canvas);
  mapTex.wrapS = THREE.RepeatWrapping;
  mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.repeat.set(1.5, 3.0);
  mapTex.anisotropy = anisotropy;
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.needsUpdate = true;

  const heights = new Float32Array(size * size);
  const roughs = new Float32Array(size * size);
  if (hCtx) {
    const hImg = hCtx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < size * size; i += 1) {
      const h = hImg[i * 4] / 255;
      heights[i] = h;
      roughs[i] = 0.96 - h * 0.11;
    }
  }

  const normalTex = createNormalTextureFromHeight(
    heights,
    size,
    1.85,
    anisotropy,
    1.5,
    3.0,
  );
  const roughTex = createRoughnessTextureFromField(
    roughs,
    size,
    anisotropy,
    1.5,
    3.0,
  );

  const material = new THREE.MeshStandardMaterial({
    map: mapTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: roughTex,
    roughness: 0.94,
    metalness: 0.0,
    vertexColors: true,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });

  return { material, textures: [mapTex, normalTex, roughTex] };
}

// ===========================================================================
// 3. 高精細プロシージャル アルファ葉枝カード PBR（512px RGBA + Normal + Roughness）
// ===========================================================================

function createRealisticLeafCardPbr(
  species: TreeSpecies,
  anisotropy: number,
): {
  material: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');

  const hCanvas = document.createElement('canvas');
  hCanvas.width = size;
  hCanvas.height = size;
  const hCtx = hCanvas.getContext('2d');

  const rand = createPrng(species === 'zelkova' ? 40119 : 77823);

  if (ctx && hCtx) {
    ctx.clearRect(0, 0, size, size);
    hCtx.fillStyle = '#404040';
    hCtx.fillRect(0, 0, size, size);

    // 1枚のリアルな植物の葉（葉脈・明暗グラデーション・高さ立体感付き）を描画
    const drawBotanicalLeaf = (
      x: number,
      y: number,
      angle: number,
      len: number,
      wid: number,
      shadeBoost: number,
    ) => {
      const baseH = species === 'zelkova' ? 104 + (rand() - 0.5) * 18 : 114 + (rand() - 0.5) * 20;
      const sat = species === 'zelkova' ? 40 + rand() * 14 : 44 + rand() * 14;
      const light =
        (species === 'zelkova' ? 30 : 27) + shadeBoost * 11 + rand() * 9;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const grad = ctx.createLinearGradient(0, 0, 0, -len);
      grad.addColorStop(0, `hsl(${baseH - 4}, ${sat}%, ${Math.max(15, light - 7)}%)`);
      grad.addColorStop(0.55, `hsl(${baseH}, ${sat + 3}%, ${light}%)`);
      grad.addColorStop(1, `hsl(${baseH + 5}, ${sat + 4}%, ${Math.min(54, light + 8)}%)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-wid, -len * 0.28, -wid * 0.82, -len * 0.76, 0, -len);
      ctx.bezierCurveTo(wid * 0.82, -len * 0.76, wid, -len * 0.28, 0, 0);
      ctx.closePath();
      ctx.fill();

      // 葉縁の繊細な輪郭陰影
      ctx.strokeStyle = `hsla(${baseH - 6}, ${sat}%, ${Math.max(12, light - 13)}%, 0.55)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 主葉脈（中央の明るい筋）
      ctx.strokeStyle = `hsla(${baseH + 8}, ${sat + 6}%, ${Math.min(62, light + 14)}%, 0.62)`;
      ctx.lineWidth = Math.max(1.0, wid * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -len * 0.05);
      ctx.lineTo(0, -len * 0.88);
      ctx.stroke();

      // 側脈（細い V 字葉脈）
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `hsla(${baseH + 6}, ${sat}%, ${Math.min(58, light + 10)}%, 0.35)`;
      for (let v = 0.24; v <= 0.74; v += 0.22) {
        const vy = -len * v;
        const vw = wid * (1 - Math.abs(v - 0.45) * 1.1) * 0.65;
        ctx.beginPath();
        ctx.moveTo(0, vy);
        ctx.lineTo(-vw, vy - len * 0.11);
        ctx.moveTo(0, vy);
        ctx.lineTo(vw, vy - len * 0.11);
        ctx.stroke();
      }
      ctx.restore();

      // 高さマップ（葉の中央が盛り上がり縁に向かってカーブ＋葉ごとの微細傾斜）
      hCtx.save();
      hCtx.translate(x, y);
      hCtx.rotate(angle);
      const hv = Math.floor(150 + shadeBoost * 65);
      const hGrad = hCtx.createLinearGradient(-wid, 0, wid, -len);
      hGrad.addColorStop(0, `rgb(${hv - 35},${hv - 35},${hv - 35})`);
      hGrad.addColorStop(0.5, `rgb(${Math.min(250, hv + 25)},${Math.min(250, hv + 25)},${Math.min(250, hv + 25)})`);
      hGrad.addColorStop(1, `rgb(${hv - 20},${hv - 20},${hv - 20})`);
      hCtx.fillStyle = hGrad;
      hCtx.beginPath();
      hCtx.moveTo(0, 0);
      hCtx.bezierCurveTo(-wid, -len * 0.28, -wid * 0.82, -len * 0.76, 0, -len);
      hCtx.bezierCurveTo(wid * 0.82, -len * 0.76, wid, -len * 0.28, 0, 0);
      hCtx.closePath();
      hCtx.fill();
      hCtx.restore();
    };

    // 放射状に分岐する小枝（ボタニカルな枝ぶり）を描画
    interface TwigSeg {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      ang: number;
    }
    const twigs: TwigSeg[] = [];

    const drawTwig = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      width0: number,
      width1: number,
    ) => {
      const ang = Math.atan2(x1 - x0, -(y1 - y0));
      twigs.push({ x0, y0, x1, y1, ang });
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, '#4f4134');
      grad.addColorStop(1, '#5d543c');
      ctx.strokeStyle = grad;
      ctx.lineWidth = (width0 + width1) * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };

    // 中央から放射状に広がる5本のメイン小枝＋分岐枝（カードのどこから見ても自然な葉密度）
    const cx = size * 0.5;
    const baseY = size * 0.88;
    drawTwig(cx, baseY, cx + (rand() - 0.5) * 20, size * 0.24, 7.5, 2.5);
    drawTwig(cx, size * 0.72, size * 0.2, size * 0.36, 5.2, 2.0);
    drawTwig(cx, size * 0.72, size * 0.8, size * 0.36, 5.2, 2.0);
    drawTwig(cx, size * 0.52, size * 0.16, size * 0.62, 4.4, 1.8);
    drawTwig(cx, size * 0.52, size * 0.84, size * 0.62, 4.4, 1.8);
    drawTwig(cx, size * 0.44, size * 0.28, size * 0.16, 4.0, 1.6);
    drawTwig(cx, size * 0.44, size * 0.72, size * 0.16, 4.0, 1.6);

    // 背面層（暗め）→ 中間層 → 前面層（明るめ）の3パスで葉を茂らせる
    const leafLenBase = species === 'zelkova' ? 54 : 68;
    const leafWidBase = species === 'zelkova' ? 19 : 29;
    const leavesPerTwig = species === 'zelkova' ? 16 : 12;

    for (let pass = 0; pass < 3; pass += 1) {
      const shadeBoost = pass === 0 ? -0.45 : pass === 1 ? 0.15 : 0.65;
      for (const tw of twigs) {
        const count = pass === 1 ? leavesPerTwig : Math.floor(leavesPerTwig * 0.7);
        for (let k = 0; k < count; k += 1) {
          const t = 0.15 + (k / Math.max(1, count - 1)) * 0.85;
          const jitter = (rand() - 0.5) * 26;
          const lx = tw.x0 + (tw.x1 - tw.x0) * t + jitter;
          const ly = tw.y0 + (tw.y1 - tw.y0) * t + (rand() - 0.5) * 24;
          const side = k % 2 === 0 ? 1 : -1;
          const spread = (0.38 + rand() * 0.78) * side;
          const len = leafLenBase * (0.72 + rand() * 0.52);
          const wid = leafWidBase * (0.76 + rand() * 0.44);
          // キャンバス縁で切れないよう内側へマージン確保
          if (lx < 42 || lx > size - 42 || ly < 52 || ly > size - 36) continue;
          drawBotanicalLeaf(lx, ly, tw.ang + spread, len, wid, shadeBoost);
        }
      }
    }

    // 透明ピクセルへ葉色をブリード拡散させ、ミップマップ白フチを完全に防止
    applyAlphaBleedToCanvas(
      ctx,
      size,
      species === 'zelkova' ? 68 : 54,
      species === 'zelkova' ? 98 : 88,
      species === 'zelkova' ? 46 : 42,
      12,
    );
  }

  const baseColorTex = new THREE.CanvasTexture(colorCanvas);
  baseColorTex.anisotropy = anisotropy;
  baseColorTex.colorSpace = THREE.SRGBColorSpace;
  baseColorTex.wrapS = THREE.ClampToEdgeWrapping;
  baseColorTex.wrapT = THREE.ClampToEdgeWrapping;
  baseColorTex.needsUpdate = true;

  const heights = new Float32Array(size * size);
  const roughs = new Float32Array(size * size);
  if (hCtx) {
    const hImg = hCtx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < size * size; i += 1) {
      const h = hImg[i * 4] / 255;
      heights[i] = h;
      // 葉の表面は自然な微光沢(0.64..0.80)、暗い隙間・小枝はマット(0.90)
      roughs[i] = 0.88 - h * 0.24;
    }
  }

  const normalTex = createNormalTextureFromHeight(
    heights,
    size,
    1.15,
    anisotropy,
    1,
    1,
  );
  normalTex.wrapS = THREE.ClampToEdgeWrapping;
  normalTex.wrapT = THREE.ClampToEdgeWrapping;

  const roughTex = createRoughnessTextureFromField(
    roughs,
    size,
    anisotropy,
    1,
    1,
  );
  roughTex.wrapS = THREE.ClampToEdgeWrapping;
  roughTex.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.MeshStandardMaterial({
    map: baseColorTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: roughTex,
    roughness: 0.86,
    metalness: 0.0,
    alphaTest: 0.4,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });

  return { material, textures: [baseColorTex, normalTex, roughTex] };
}

// ===========================================================================
// 4. 多層カーブ葉カード＋リアル分岐幹ジオメトリ生成（球体・箱モデル完全排除）
// ===========================================================================

interface RawMeshBuilder {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function createRawMeshBuilder(): RawMeshBuilder {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    indices: [],
  };
}

function finalizeRawMesh(b: RawMeshBuilder): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(b.positions, 3),
  );
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.colors, 3));
  geo.setIndex(b.indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 複数制御点に沿った有機的テーパー幹／枝チューブをメッシュビルダーへ追加する。
 */
function appendBranchTube(
  b: RawMeshBuilder,
  points: readonly THREE.Vector3[],
  radii: readonly number[],
  radialSegs: number,
  vScale: number,
  aoBottom: number,
  aoTop: number,
): void {
  const rings = points.length;
  const baseVert = b.positions.length / 3;
  const tangent = new THREE.Vector3();
  const prevNormal = new THREE.Vector3(1, 0, 0);
  const binormal = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  let accumLen = 0;

  for (let r = 0; r < rings; r += 1) {
    const p = points[r];
    if (r > 0) {
      accumLen += p.distanceTo(points[r - 1]);
    }
    if (r === 0) {
      tangent.subVectors(points[1], points[0]).normalize();
    } else if (r === rings - 1) {
      tangent.subVectors(points[r], points[r - 1]).normalize();
    } else {
      tangent.subVectors(points[r + 1], points[r - 1]).normalize();
    }

    if (Math.abs(tangent.dot(prevNormal)) > 0.92) {
      prevNormal.set(0, 0, 1);
    }
    binormal.crossVectors(tangent, prevNormal).normalize();
    normal.crossVectors(binormal, tangent).normalize();
    prevNormal.copy(normal);

    const rad = radii[r];
    const tFrac = r / Math.max(1, rings - 1);
    const ao = aoBottom + (aoTop - aoBottom) * tFrac;
    const vCoord = accumLen * vScale;

    for (let s = 0; s <= radialSegs; s += 1) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // 根元のみ自然な根張り（ルートフレア）を付与
      const flare =
        r === 0 ? 1.0 + Math.sin(theta * 5.0) * 0.14 : 1.0;
      const nx = normal.x * cosT + binormal.x * sinT;
      const ny = normal.y * cosT + binormal.y * sinT;
      const nz = normal.z * cosT + binormal.z * sinT;

      vPos.set(
        p.x + nx * rad * flare,
        p.y + ny * rad * flare,
        p.z + nz * rad * flare,
      );
      b.positions.push(vPos.x, vPos.y, vPos.z);
      b.normals.push(nx, ny, nz);
      b.uvs.push(u, vCoord);
      b.colors.push(ao, ao, ao);
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < rings - 1; r += 1) {
    for (let s = 0; s < radialSegs; s += 1) {
      const i0 = baseVert + r * stride + s;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      b.indices.push(i0, i1, i2, i1, i3, i2);
    }
  }
}

/**
 * わずかに湾曲・カップ形状を持たせた 2x2 サブディビジョン葉カード（8 Tris）を追加する。
 * 樹冠中心からの外向き球面法線ブレンド＋内部AO頂点カラーにより、全方向から自然な立体感を実現。
 */
function appendCurvedLeafCard(
  b: RawMeshBuilder,
  center: THREE.Vector3,
  euler: THREE.Euler,
  width: number,
  height: number,
  archDepth: number,
  canopyCenter: THREE.Vector3,
  canopyRadius: number,
): void {
  const baseVert = b.positions.length / 3;
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const localPos = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const localNorm = new THREE.Vector3();
  const sphereNorm = new THREE.Vector3();

  // 3x3 頂点グリッド（中央がふっくら膨らみ端が垂れる有機カーブカード）
  for (let iy = 0; iy <= 2; iy += 1) {
    const v = iy / 2;
    const ny = (v - 0.5) * 2; // -1..+1
    for (let ix = 0; ix <= 2; ix += 1) {
      const u = ix / 2;
      const nx = (u - 0.5) * 2; // -1..+1
      const cup = (1 - nx * nx * 0.65) * (1 - ny * ny * 0.55) * archDepth;
      localPos.set(nx * width * 0.5, ny * height * 0.5, cup);
      localPos.applyQuaternion(quat);
      worldPos.copy(center).add(localPos);

      // カード自身の法線と樹冠外向き球面法線を 28:72 でブレンド（AAA フォーリッジライティング）
      localNorm.set(nx * 0.35, ny * 0.28, 1.0).normalize().applyQuaternion(quat);
      sphereNorm.subVectors(worldPos, canopyCenter);
      if (sphereNorm.lengthSq() > 1e-5) {
        sphereNorm.normalize();
      } else {
        sphereNorm.set(0, 1, 0);
      }
      const fnx = sphereNorm.x * 0.72 + localNorm.x * 0.28;
      const fny = sphereNorm.y * 0.72 + localNorm.y * 0.28;
      const fnz = sphereNorm.z * 0.72 + localNorm.z * 0.28;
      const invL = 1 / Math.max(1e-5, Math.hypot(fnx, fny, fnz));

      // 樹冠内部ほど暗く、外側・上部ほど明るい自然な擬似セルフシャドウ AO
      const distNorm = Math.min(
        1.15,
        worldPos.distanceTo(canopyCenter) / Math.max(0.5, canopyRadius),
      );
      const heightShade = Math.max(
        0,
        Math.min(1, (worldPos.y - (canopyCenter.y - canopyRadius * 0.85)) / (canopyRadius * 1.65)),
      );
      const ao = Math.min(
        1.06,
        Math.max(0.58, 0.56 + distNorm * 0.34 + heightShade * 0.16),
      );

      b.positions.push(worldPos.x, worldPos.y, worldPos.z);
      b.normals.push(fnx * invL, fny * invL, fnz * invL);
      b.uvs.push(u, v);
      b.colors.push(ao, ao, ao);
    }
  }

  for (let iy = 0; iy < 2; iy += 1) {
    for (let ix = 0; ix < 2; ix += 1) {
      const i0 = baseVert + iy * 3 + ix;
      const i1 = i0 + 1;
      const i2 = i0 + 3;
      const i3 = i2 + 1;
      b.indices.push(i0, i1, i2, i1, i3, i2);
    }
  }
}

function buildRealisticTreeSpeciesGeometry(species: TreeSpecies): {
  trunkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
  triangleCount: number;
} {
  const trunkBuilder = createRawMeshBuilder();
  const foliageBuilder = createRawMeshBuilder();
  const rand = createPrng(species === 'zelkova' ? 10887 : 29311);

  const isZelkova = species === 'zelkova';
  const forkY = isZelkova ? 2.45 : 2.25;
  const canopyCenter = new THREE.Vector3(0, isZelkova ? 4.45 : 4.65, 0);
  const canopyRadius = isZelkova ? 2.15 : 2.65;

  // 1. 主幹（根張り付き・わずかに有機的に湾曲、地下 -0.08m まで延長して浮き防止）
  const leanX = (rand() - 0.5) * 0.14;
  const leanZ = (rand() - 0.5) * 0.14;
  const trunkPts = [
    new THREE.Vector3(0, -0.08, 0),
    new THREE.Vector3(leanX * 0.2, 0.45, leanZ * 0.2),
    new THREE.Vector3(leanX * 0.65, 1.35, leanZ * 0.55),
    new THREE.Vector3(leanX, forkY, leanZ),
    new THREE.Vector3(leanX * 1.15, forkY + 0.95, leanZ * 1.15),
  ];
  const trunkRadii = isZelkova
    ? [0.25, 0.19, 0.165, 0.145, 0.085]
    : [0.31, 0.24, 0.205, 0.18, 0.105];
  appendBranchTube(trunkBuilder, trunkPts, trunkRadii, 8, 0.55, 0.72, 0.92);

  // 2. 主枝（5本）＋ 亜枝（各2本）と葉カード配置クラスター中心
  interface FoliageCluster {
    pos: THREE.Vector3;
    size: number;
  }
  const clusters: FoliageCluster[] = [];

  const primaryCount = isZelkova ? 5 : 6;
  for (let i = 0; i < primaryCount; i += 1) {
    const az = (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.34;
    const reach = (isZelkova ? 1.18 : 1.52) + rand() * 0.38;
    const rise = (isZelkova ? 1.65 : 1.85) + rand() * 0.58;
    const startY = forkY - 0.15 + (i % 2) * 0.26;
    const p0 = new THREE.Vector3(leanX * 0.95, startY, leanZ * 0.95);
    const p1 = new THREE.Vector3(
      p0.x + Math.cos(az) * reach * 0.48,
      startY + rise * 0.55,
      p0.z + Math.sin(az) * reach * 0.48,
    );
    const p2 = new THREE.Vector3(
      p0.x + Math.cos(az) * reach,
      startY + rise,
      p0.z + Math.sin(az) * reach,
    );
    appendBranchTube(
      trunkBuilder,
      [p0, p1, p2],
      isZelkova ? [0.105, 0.068, 0.032] : [0.125, 0.082, 0.038],
      6,
      0.7,
      0.74,
      0.86,
    );

    // 主枝の先端に葉クラスター
    clusters.push({
      pos: p2.clone().add(new THREE.Vector3(0, 0.16, 0)),
      size: isZelkova ? 1.52 : 1.82,
    });

    // 左右へ分岐する亜枝（2本ずつ）
    for (let s = -1; s <= 1; s += 2) {
      const subAz = az + s * (0.52 + rand() * 0.3);
      const subReach = (isZelkova ? 0.62 : 0.78) + rand() * 0.25;
      const subRise = (isZelkova ? 0.62 : 0.75) + rand() * 0.35;
      const sp0 = p1.clone().lerp(p2, 0.32);
      const sp1 = new THREE.Vector3(
        sp0.x + Math.cos(subAz) * subReach,
        sp0.y + subRise,
        sp0.z + Math.sin(subAz) * subReach,
      );
      // 街路樹（zelkova）は車道干渉防止のため最大水平半径と最低高さを厳密クランプ
      if (isZelkova) {
        const horiz = Math.hypot(sp1.x, sp1.z);
        if (horiz > 1.72) {
          sp1.x *= 1.72 / horiz;
          sp1.z *= 1.72 / horiz;
        }
        sp1.y = Math.max(3.35, sp1.y);
      } else {
        sp1.y = Math.max(3.2, sp1.y);
      }
      appendBranchTube(
        trunkBuilder,
        [sp0, sp1],
        [0.052, 0.022],
        5,
        0.8,
        0.78,
        0.88,
      );
      clusters.push({
        pos: sp1.clone(),
        size: isZelkova ? 1.32 : 1.58,
      });
    }
  }

  // 樹冠頂部クラウン用クラスター（自然な丸みと高さのボリューム）
  const crownTopY = isZelkova ? 5.25 : 5.75;
  clusters.push({
    pos: new THREE.Vector3(leanX, crownTopY, leanZ),
    size: isZelkova ? 1.65 : 1.98,
  });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const r = isZelkova ? 0.62 : 0.84;
    clusters.push({
      pos: new THREE.Vector3(
        leanX + Math.cos(a) * r,
        crownTopY - 0.36 + (rand() - 0.5) * 0.25,
        leanZ + Math.sin(a) * r,
      ),
      size: isZelkova ? 1.44 : 1.72,
    });
  }

  // 3. 各クラスターへ 3 枚の立体交差カーブ葉カードを生成（水平寄り＋斜め2枚）
  const euler = new THREE.Euler();
  for (let c = 0; c < clusters.length; c += 1) {
    const cl = clusters[c];
    const baseYaw = (c * 2.399963) % (Math.PI * 2); // 黄金角分散
    for (let k = 0; k < 3; k += 1) {
      const yaw = baseYaw + (k * Math.PI * 2) / 3 + (rand() - 0.5) * 0.26;
      const pitch =
        k === 0
          ? -Math.PI * 0.32 + (rand() - 0.5) * 0.22 // 上空から見下ろしても密に見える傘面
          : (rand() - 0.5) * 0.52 + 0.14; // 側面・見上げアングルで豊かな枝葉シルエット
      const roll = (rand() - 0.5) * 0.5;
      euler.set(pitch, yaw, roll, 'YXZ');

      const cardW = cl.size * (0.88 + rand() * 0.24);
      const cardH = cl.size * (0.86 + rand() * 0.22);
      const arch = cl.size * (0.16 + rand() * 0.08);
      const offsetPos = cl.pos.clone();
      offsetPos.x += (rand() - 0.5) * 0.24;
      offsetPos.y += (rand() - 0.5) * 0.22;
      offsetPos.z += (rand() - 0.5) * 0.24;

      // 街路樹の下端クリアランス確保（歩行者・車両頭上を完全にクリア）
      const minCenterY = isZelkova ? 3.45 : 3.25;
      if (offsetPos.y < minCenterY) {
        offsetPos.y = minCenterY;
      }

      appendCurvedLeafCard(
        foliageBuilder,
        offsetPos,
        euler,
        cardW,
        cardH,
        arch,
        canopyCenter,
        canopyRadius,
      );
    }
  }

  const trunkGeo = finalizeRawMesh(trunkBuilder);
  const foliageGeo = finalizeRawMesh(foliageBuilder);
  const triangleCount =
    trunkBuilder.indices.length / 3 + foliageBuilder.indices.length / 3;

  return { trunkGeo, foliageGeo, triangleCount };
}

/**
 * 街路樹の植樹桝（コンクリート縁石＋暗い培養土）の土壌テクスチャを生成する。
 */
function createTreePitSoilTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rand = createPrng(6421);
  if (ctx) {
    ctx.fillStyle = '#3c3127';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2400; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const v = Math.floor(38 + rand() * 44);
      ctx.fillStyle = `rgb(${v + 12}, ${v + 4}, ${v - 4})`;
      ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 既存の街路樹・公園樹木配置リストに対して、2種の多層アルファ葉カード樹木＋
 * リアル樹皮 PBR＋植樹桝（縁石＆土壌）を InstancedMesh（計6ドローコール）で構築する。
 * 既存の幹 OBB コライダーはそのまま維持する。
 */
export function buildRealisticInstancedTrees(
  parent: THREE.Group,
  trees: readonly VegetationTreePlacement[],
  aniso: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  trackTex: <T extends THREE.Texture>(t: T) => T,
  addCollider: (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ) => void,
): RealisticTreesResult {
  const barkPbr = createRealisticBarkPbr(aniso);
  for (const t of barkPbr.textures) trackTex(t);
  const barkMat = trackMat(barkPbr.material);

  const zelkovaLeafPbr = createRealisticLeafCardPbr('zelkova', aniso);
  for (const t of zelkovaLeafPbr.textures) trackTex(t);
  const zelkovaLeafMat = trackMat(zelkovaLeafPbr.material);

  const broadleafLeafPbr = createRealisticLeafCardPbr('broadleaf', aniso);
  for (const t of broadleafLeafPbr.textures) trackTex(t);
  const broadleafLeafMat = trackMat(broadleafLeafPbr.material);

  const zelkovaBuilt = buildRealisticTreeSpeciesGeometry('zelkova');
  const broadleafBuilt = buildRealisticTreeSpeciesGeometry('broadleaf');
  trackGeo(zelkovaBuilt.trunkGeo);
  trackGeo(zelkovaBuilt.foliageGeo);
  trackGeo(broadleafBuilt.trunkGeo);
  trackGeo(broadleafBuilt.foliageGeo);

  const zelkovaTrees = trees.filter((t) => t.species === 'zelkova');
  const broadleafTrees = trees.filter((t) => t.species === 'broadleaf');
  const pitTrees = trees.filter((t) => t.hasPit);

  const dummy = new THREE.Object3D();
  const colorScratch = new THREE.Color();

  const populateSpecies = (
    list: readonly VegetationTreePlacement[],
    trunkGeo: THREE.BufferGeometry,
    foliageGeo: THREE.BufferGeometry,
    foliageMat: THREE.MeshStandardMaterial,
    namePrefix: string,
  ) => {
    if (list.length === 0) return;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, barkMat, list.length);
    trunkInst.name = `${namePrefix}_Trunks`;
    trunkInst.castShadow = false;
    trunkInst.receiveShadow = true;
    trunkInst.frustumCulled = false;

    const foliageInst = new THREE.InstancedMesh(
      foliageGeo,
      foliageMat,
      list.length,
    );
    foliageInst.name = `${namePrefix}_Foliage`;
    foliageInst.castShadow = false;
    foliageInst.receiveShadow = true;
    foliageInst.frustumCulled = false;

    for (let i = 0; i < list.length; i += 1) {
      const t = list[i];
      const sc = t.scale;
      // わずかな縦横比率差で同一クローン感を解消
      const scXZ = sc * (0.94 + ((i * 37) % 13) * 0.01);
      const scY = sc * (0.96 + ((i * 53) % 11) * 0.01);

      dummy.position.set(t.x, t.baseY, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(scXZ, scY, scXZ);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      foliageInst.setMatrixAt(i, dummy.matrix);

      // 葉テクスチャ自体の色味を活かしつつ、個体ごとの自然な新緑・深緑・黄緑ニュアンスを付与
      colorScratch.setHex(t.tintHex);
      foliageInst.setColorAt(i, colorScratch);

      // 既存の幹 OBB コライダー（車両・徒歩衝突）を完全維持
      addCollider(
        t.id,
        t.x,
        t.z,
        0.44 * sc,
        0.44 * sc,
        0,
        t.baseY,
        t.baseY + 3.0 * sc,
      );
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    foliageInst.instanceMatrix.needsUpdate = true;
    if (foliageInst.instanceColor) {
      foliageInst.instanceColor.needsUpdate = true;
    }

    parent.add(trunkInst, foliageInst);
  };

  populateSpecies(
    zelkovaTrees,
    zelkovaBuilt.trunkGeo,
    zelkovaBuilt.foliageGeo,
    zelkovaLeafMat,
    'G2bZelkovaStreetTrees',
  );
  populateSpecies(
    broadleafTrees,
    broadleafBuilt.trunkGeo,
    broadleafBuilt.foliageGeo,
    broadleafLeafMat,
    'G2bBroadleafParkTrees',
  );

  // 街路樹の植樹桝（コンクリート外枠 ＋ 暗い培養土ベッド）
  if (pitTrees.length > 0) {
    const pitCurbMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a7874,
        roughness: 0.9,
        metalness: 0.04,
      }),
    );
    const soilTex = trackTex(createTreePitSoilTexture(aniso));
    const pitSoilMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: soilTex,
        roughness: 0.96,
        metalness: 0.0,
      }),
    );

    const pitCurbGeo = trackGeo(new THREE.BoxGeometry(1.36, 0.075, 1.36));
    const pitSoilGeo = trackGeo(new THREE.BoxGeometry(1.16, 0.085, 1.16));

    const pitCurbInst = new THREE.InstancedMesh(
      pitCurbGeo,
      pitCurbMat,
      pitTrees.length,
    );
    pitCurbInst.castShadow = false;
    pitCurbInst.receiveShadow = true;
    pitCurbInst.frustumCulled = false;

    const pitSoilInst = new THREE.InstancedMesh(
      pitSoilGeo,
      pitSoilMat,
      pitTrees.length,
    );
    pitSoilInst.castShadow = false;
    pitSoilInst.receiveShadow = true;
    pitSoilInst.frustumCulled = false;

    for (let i = 0; i < pitTrees.length; i += 1) {
      const t = pitTrees[i];
      dummy.position.set(t.x, t.baseY + 0.036, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pitCurbInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.baseY + 0.04, t.z);
      dummy.updateMatrix();
      pitSoilInst.setMatrixAt(i, dummy.matrix);
    }
    pitCurbInst.instanceMatrix.needsUpdate = true;
    pitSoilInst.instanceMatrix.needsUpdate = true;
    parent.add(pitCurbInst, pitSoilInst);
  }

  return {
    vegetationMaterials: [barkMat, zelkovaLeafMat, broadleafLeafMat],
    totalTrianglesPerSpecies: {
      zelkova: zelkovaBuilt.triangleCount,
      broadleaf: broadleafBuilt.triangleCount,
    },
  };
}

// ===========================================================================
// 5. 救済・最適化済み草 GLB（simple_grass_chunks_opt.glb）の InstancedMesh 配置
// ===========================================================================

interface GrassSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  scaleXZ: number;
  scaleY: number;
  tintHex: number;
}

function isClearParkGrassSpot(x: number, z: number): boolean {
  const parkB = CITY_METRICS.parkBounds;
  if (
    x < parkB.minX + 0.65 ||
    x > parkB.maxX - 0.65 ||
    z < parkB.minZ + 0.65 ||
    z > parkB.maxZ - 0.65
  ) {
    return false;
  }

  const parkCx = (parkB.minX + parkB.maxX) * 0.5; // 55
  const parkCz = (parkB.minZ + parkB.maxZ) * 0.5; // -102

  // 東西・南北メイン遊歩道 (幅4.4m) と中央噴水広場 (半径8.6m) を避ける
  if (Math.abs(z - parkCz) < 2.55) return false;
  if (Math.abs(x - parkCx) < 2.55) return false;
  if (Math.hypot(x - parkCx, z - parkCz) < 8.85) return false;

  // 公園内周遊パス（loopN=-114.5, loopS=-89.5, loopW=21.5, loopE=88.5, 幅2.8m）を避ける
  const loopN = parkB.minZ + 5.5;
  const loopS = parkB.maxZ - 5.5;
  const loopW = parkB.minX + 7.5;
  const loopE = parkB.maxX - 7.5;
  if (x >= loopW - 1.7 && x <= loopE + 1.7) {
    if (Math.abs(z - loopN) < 1.75 || Math.abs(z - loopS) < 1.75) {
      return false;
    }
  }
  if (z >= loopN - 1.7 && z <= loopS + 1.7) {
    if (Math.abs(x - loopW) < 1.75 || Math.abs(x - loopE) < 1.75) {
      return false;
    }
  }

  // G2 公園遊具・東屋4象限の直下を避ける
  const facilities: ReadonlyArray<[number, number, number]> = [
    [32, -108.8, 3.6],
    [78, -108.8, 4.4],
    [32, -95.2, 3.0],
    [78, -95.2, 3.0],
  ];
  for (const [fx, fz, fr] of facilities) {
    if (Math.hypot(x - fx, z - fz) < fr) return false;
  }

  return true;
}

function buildGrassPlacements(
  trees: readonly VegetationTreePlacement[],
): {
  tallTufts: GrassSpot[];
  herbTufts: GrassSpot[];
  clumpPatches: GrassSpot[];
} {
  const tallTufts: GrassSpot[] = [];
  const herbTufts: GrassSpot[] = [];
  const clumpPatches: GrassSpot[] = [];
  const rand = createPrng(38219);
  const tints = [0xffffff, 0xf2fae8, 0xe4f3d8, 0xf6f6dc, 0xdcebd2, 0xeef7e4];

  const makeSpot = (
    x: number,
    y: number,
    z: number,
    scaleXZ: number,
    scaleY: number,
  ): GrassSpot => ({
    x,
    y,
    z,
    yaw: rand() * Math.PI * 2,
    tiltX: (rand() - 0.5) * 0.14,
    tiltZ: (rand() - 0.5) * 0.14,
    scaleXZ,
    scaleY,
    tintHex: tints[Math.floor(rand() * tints.length)],
  });

  // 1. 全街路樹・公園樹木の足元（植樹桝の内側＆公園の根元に2〜3株ずつ）
  for (let i = 0; i < trees.length; i += 1) {
    const t = trees[i];
    const baseY = t.hasPit ? t.baseY + 0.08 : t.baseY;
    const count = t.hasPit ? 2 : 3;
    for (let k = 0; k < count; k += 1) {
      const ang = (k / count) * Math.PI * 2 + rand() * 1.4;
      const dist = t.hasPit ? 0.30 + rand() * 0.17 : 0.42 + rand() * 0.55;
      const gx = t.x + Math.cos(ang) * dist;
      const gz = t.z + Math.sin(ang) * dist;
      if (k % 2 === 0) {
        tallTufts.push(
          makeSpot(
            gx,
            baseY,
            gz,
            t.hasPit ? 0.68 + rand() * 0.32 : 0.85 + rand() * 0.45,
            t.hasPit ? 0.58 + rand() * 0.28 : 0.72 + rand() * 0.38,
          ),
        );
      } else {
        herbTufts.push(
          makeSpot(
            gx,
            baseY,
            gz,
            t.hasPit ? 0.72 + rand() * 0.32 : 0.88 + rand() * 0.46,
            t.hasPit ? 0.75 + rand() * 0.3 : 0.85 + rand() * 0.42,
          ),
        );
      }
    }
  }

  // 2. さくら中央公園の芝生外縁（北縁・南縁・西縁・東縁、4方向ゲート回避）
  const parkB = CITY_METRICS.parkBounds;
  const parkCx = (parkB.minX + parkB.maxX) * 0.5;
  const parkCz = (parkB.minZ + parkB.maxZ) * 0.5;

  for (let x = parkB.minX + 2.2; x <= parkB.maxX - 2.2; x += 2.6) {
    // 北・南ゲート (x=51..59) を回避
    if (Math.abs(x - parkCx) < 4.6) continue;
    for (const edgeZ of [parkB.minZ + 1.15, parkB.maxZ - 1.15]) {
      const gx = x + (rand() - 0.5) * 1.1;
      const gz = edgeZ + (rand() - 0.5) * 0.55;
      if (!isClearParkGrassSpot(gx, gz)) continue;
      if (rand() < 0.52) {
        tallTufts.push(makeSpot(gx, 0, gz, 0.9 + rand() * 0.55, 0.78 + rand() * 0.42));
      } else {
        herbTufts.push(makeSpot(gx, 0, gz, 0.95 + rand() * 0.55, 0.85 + rand() * 0.45));
      }
    }
  }

  for (let z = parkB.minZ + 2.5; z <= parkB.maxZ - 2.5; z += 2.8) {
    // 東・西ゲート (z=-106..-98) を回避
    if (Math.abs(z - parkCz) < 4.8) continue;
    for (const edgeX of [parkB.minX + 1.15, parkB.maxX - 1.15]) {
      const gx = edgeX + (rand() - 0.5) * 0.55;
      const gz = z + (rand() - 0.5) * 1.1;
      if (!isClearParkGrassSpot(gx, gz)) continue;
      if (rand() < 0.5) {
        tallTufts.push(makeSpot(gx, 0, gz, 0.9 + rand() * 0.5, 0.75 + rand() * 0.38));
      } else {
        herbTufts.push(makeSpot(gx, 0, gz, 0.95 + rand() * 0.55, 0.85 + rand() * 0.4));
      }
    }
  }

  // 3. 公園内：中央噴水広場の外周芝生縁＆遊歩道沿いの自然クラスター
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    const r = 9.35 + rand() * 0.85;
    const gx = parkCx + Math.cos(a) * r;
    const gz = parkCz + Math.sin(a) * r;
    if (!isClearParkGrassSpot(gx, gz)) continue;
    if (i % 2 === 0) {
      herbTufts.push(makeSpot(gx, 0, gz, 0.92 + rand() * 0.42, 0.85 + rand() * 0.35));
    } else {
      tallTufts.push(makeSpot(gx, 0, gz, 0.85 + rand() * 0.38, 0.72 + rand() * 0.32));
    }
  }

  // 公園内周遊パス縁のランダム点在草
  for (let i = 0; i < 72; i += 1) {
    const gx = parkB.minX + 2.0 + rand() * (parkB.maxX - parkB.minX - 4.0);
    const gz = parkB.minZ + 2.0 + rand() * (parkB.maxZ - parkB.minZ - 4.0);
    if (!isClearParkGrassSpot(gx, gz)) continue;
    if (i % 2 === 0) {
      tallTufts.push(makeSpot(gx, 0, gz, 0.85 + rand() * 0.52, 0.68 + rand() * 0.38));
    } else {
      herbTufts.push(makeSpot(gx, 0, gz, 0.92 + rand() * 0.55, 0.8 + rand() * 0.42));
    }
  }

  // 4. 公園四隅・芝生縁のヒーロー草塊（4,551 Tris の濃密パッチを12箇所厳選配置）
  const heroClumpCoords: ReadonlyArray<[number, number]> = [
    [16.8, -117.8],
    [45.5, -117.8],
    [64.5, -117.8],
    [93.2, -117.8],
    [16.8, -86.2],
    [45.5, -86.2],
    [64.5, -86.2],
    [93.2, -86.2],
    [17.2, -106.5],
    [17.2, -97.5],
    [92.8, -106.5],
    [92.8, -97.5],
  ];
  for (const [cx, cz] of heroClumpCoords) {
    if (!isClearParkGrassSpot(cx, cz)) continue;
    clumpPatches.push(
      makeSpot(cx, 0, cz, 0.82 + rand() * 0.28, 0.72 + rand() * 0.24),
    );
  }

  // 5. 駅前ロータリー中央芝生アイランド縁（低木リング外側 r = 7.3..9.1m, Y = 0.25m）
  const rotC = CITY_METRICS.rotaryCenter;
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2 + (rand() - 0.5) * 0.1;
    const r = 7.35 + rand() * 1.7;
    const gx = rotC.x + Math.cos(a) * r;
    const gz = rotC.z + Math.sin(a) * r;
    if (i % 2 === 0) {
      tallTufts.push(makeSpot(gx, 0.25, gz, 0.78 + rand() * 0.36, 0.65 + rand() * 0.3));
    } else {
      herbTufts.push(makeSpot(gx, 0.25, gz, 0.88 + rand() * 0.38, 0.82 + rand() * 0.34));
    }
  }

  return { tallTufts, herbTufts, clumpPatches };
}

/**
 * PHASE 5-G2b: 救済・最適化済み草 GLB（simple_grass_chunks_opt.glb）を非同期ロードし、
 * 3つの InstancedMesh（tall tuft / herb tuft / park clump patch、計3ドローコール）として配置する。
 * 衝突判定なし・castShadow = false・視界を塞がない低草丈に正規化。
 */
export function buildG2bOptimizedGlbGrass(
  scene: THREE.Scene,
  trees: readonly VegetationTreePlacement[],
  maxAnisotropy: number,
  onMaterialLoaded?: (mat: THREE.MeshStandardMaterial) => void,
): G2bGrassHandle {
  const root = new THREE.Group();
  root.name = 'Phase5G2bOptimizedGlbGrass';
  scene.add(root);

  const gltfLoader = getGltfLoader();
  const aniso = Math.min(4, Math.max(1, maxAnisotropy));

  let isDisposed = false;
  let loadedScene: THREE.Object3D | null = null;
  const ownedGeometries: THREE.BufferGeometry[] = [];

  const loadGrass = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(OPTIMIZED_GRASS_GLB_URL);
      if (isDisposed) return;

      const template = gltf.scene;
      loadedScene = template;
      template.updateMatrixWorld(true);

      const meshesByName = new Map<string, THREE.Mesh>();
      const registeredMats = new Set<THREE.Material>();

      template.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
        meshesByName.set(obj.name, obj);
        obj.castShadow = false;
        obj.receiveShadow = true;

        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          mat.alphaTest = 0.36;
          mat.transparent = false;
          mat.depthWrite = true;
          mat.side = THREE.DoubleSide;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
          if (mat.map) mat.map.anisotropy = aniso;
          if (mat.normalMap) mat.normalMap.anisotropy = aniso;
          if (!registeredMats.has(mat)) {
            registeredMats.add(mat);
            onMaterialLoaded?.(mat);
          }
        }
      });

      const buildNormalizedBakedGeo = (
        srcMesh: THREE.Mesh,
        targetHeight: number,
        targetMaxWidth: number,
      ): THREE.BufferGeometry | null => {
        const baked = srcMesh.geometry.clone();
        baked.applyMatrix4(srcMesh.matrixWorld);
        baked.computeBoundingBox();
        const box = baked.boundingBox;
        if (!box) {
          baked.dispose();
          return null;
        }
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        if (size.y < 1e-4) {
          baked.dispose();
          return null;
        }

        const scaleY = targetHeight / size.y;
        const maxXZ = Math.max(size.x, size.z, 1e-4);
        const scaleXZ = Math.min(scaleY * 1.15, targetMaxWidth / maxXZ);

        // 底面を Y = -0.015m へわずかに埋め込み、浮きを完全に防止
        const normMat = new THREE.Matrix4().compose(
          new THREE.Vector3(
            -center.x * scaleXZ,
            -box.min.y * scaleY - 0.015,
            -center.z * scaleXZ,
          ),
          new THREE.Quaternion(),
          new THREE.Vector3(scaleXZ, scaleY, scaleXZ),
        );
        baked.applyMatrix4(normMat);
        baked.computeBoundingBox();
        baked.computeBoundingSphere();
        ownedGeometries.push(baked);
        return baked;
      };

      const placements = buildGrassPlacements(trees);
      const dummy = new THREE.Object3D();
      const colorScratch = new THREE.Color();

      const createInstancedLayer = (
        meshName: string,
        spots: readonly GrassSpot[],
        targetHeight: number,
        targetMaxWidth: number,
      ) => {
        if (spots.length === 0) return;
        const src = meshesByName.get(meshName);
        if (!src) return;
        const geo = buildNormalizedBakedGeo(src, targetHeight, targetMaxWidth);
        if (!geo) return;

        const inst = new THREE.InstancedMesh(geo, src.material, spots.length);
        inst.name = `G2b_${meshName}_Instanced`;
        inst.castShadow = false;
        inst.receiveShadow = true;
        inst.frustumCulled = false;

        for (let i = 0; i < spots.length; i += 1) {
          const sp = spots[i];
          dummy.position.set(sp.x, sp.y, sp.z);
          dummy.rotation.set(sp.tiltX, sp.yaw, sp.tiltZ, 'YXZ');
          dummy.scale.set(sp.scaleXZ, sp.scaleY, sp.scaleXZ);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          colorScratch.setHex(sp.tintHex);
          inst.setColorAt(i, colorScratch);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        root.add(inst);
      };

      // 視界を一切塞がない自然な草丈へ正規化（tall: ~0.36m, herb: ~0.18m, patch: ~0.42m）
      createInstancedLayer('grass_tuft_tall', placements.tallTufts, 0.36, 0.42);
      createInstancedLayer('grass_tuft_herb', placements.herbTufts, 0.18, 0.44);
      createInstancedLayer(
        'grass_clump_patch',
        placements.clumpPatches,
        0.42,
        2.35,
      );
    } catch (err: unknown) {
      console.warn('[G2b] Failed to load simple_grass_chunks_opt.glb:', err);
    }
  };

  void loadGrass();

  return {
    group: root,
    dispose: () => {
      isDisposed = true;
      scene.remove(root);

      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      const disposedTexs = new Set<THREE.Texture>();

      for (const g of ownedGeometries) {
        if (!disposedGeos.has(g)) {
          disposedGeos.add(g);
          g.dispose();
        }
      }
      ownedGeometries.length = 0;

      const disposeTree = (node: THREE.Object3D) => {
        node.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.geometry && !disposedGeos.has(obj.geometry)) {
            disposedGeos.add(obj.geometry);
            obj.geometry.dispose();
          }
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat || disposedMats.has(mat)) continue;
            disposedMats.add(mat);
            const std = mat as THREE.MeshStandardMaterial;
            for (const tex of [
              std.map,
              std.normalMap,
              std.roughnessMap,
              std.aoMap,
            ]) {
              if (tex && !disposedTexs.has(tex)) {
                disposedTexs.add(tex);
                tex.dispose();
              }
            }
            mat.dispose();
          }
        });
      };

      disposeTree(root);
      if (loadedScene) {
        disposeTree(loadedScene);
        loadedScene = null;
      }
    },
  };
}
