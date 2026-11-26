import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import { CollisionWorld } from './collisionWorld';
import {
  JAPANESE_CITY_PLACEMENTS,
  type CityAssetPlacement,
} from './cityLayout';

export interface CityBuildProgress {
  loadedCount: number;
  totalCount: number;
  failedCount: number;
  colliderCount: number;
}

export interface CityBuilderHandle {
  group: THREE.Group;
  setNightFactor: (factor: number) => void;
  dispose: () => void;
}

const MAX_CONCURRENT_LOADS = 3;
const WINDOW_MATERIAL_PATTERN = /(window|glass|cristal|ventana|vitre|shoji)/i;
const WARM_WINDOW_EMISSIVE = new THREE.Color(0xffcc7a);
const UNLIT_EMISSIVE = new THREE.Color(0x000000);

interface TrackedEmissiveMaterial {
  mat: THREE.MeshStandardMaterial;
  kind: 'window' | 'nativeEmissive';
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

/**
 * 1-D: 承認済み GLB アセットをバウンディングボックス自動スケーリング＆接地（Y=0 / 歩道高）で
 * 日本の街区として配置し、簡略化 OBB コリジョンを登録するビルダー。
 */
export function buildJapaneseCity(
  scene: THREE.Scene,
  collisionWorld: CollisionWorld,
  maxAnisotropy: number,
  onProgress?: (progress: CityBuildProgress) => void,
  onVehicleTemplateLoaded?: (root: THREE.Object3D) => void,
): CityBuilderHandle {
  const cityGroup = new THREE.Group();
  cityGroup.name = 'JapaneseCityRoot';
  scene.add(cityGroup);

  const gltfLoader = getGltfLoader();
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));

  let isDisposed = false;
  let loadedCount = 0;
  let failedCount = 0;
  const totalCount = JAPANESE_CITY_PLACEMENTS.length;

  // 同一 URL の GLB を重複ダウンロードしないためのテンプレート Promise キャッシュ
  const templatePromises = new Map<string, Promise<THREE.Group>>();
  const loadedTemplates: THREE.Group[] = [];
  const trackedEmissives: TrackedEmissiveMaterial[] = [];
  const trackedMatSet = new Set<THREE.Material>();
  let currentNightFactor = 0;

  const applyNightFactorToMaterial = (
    entry: TrackedEmissiveMaterial,
    factor: number,
  ): void => {
    if (entry.kind === 'window') {
      if (factor > 0.03) {
        entry.mat.emissive.copy(WARM_WINDOW_EMISSIVE);
        entry.mat.emissiveIntensity = factor * 0.78;
      } else {
        entry.mat.emissive.copy(UNLIT_EMISSIVE);
        entry.mat.emissiveIntensity = 0;
      }
    } else {
      entry.mat.emissive.copy(entry.baseEmissive);
      entry.mat.emissiveIntensity =
        entry.baseIntensity * (0.4 + factor * 1.05);
    }
  };

  const emitProgress = () => {
    if (isDisposed || !onProgress) return;
    onProgress({
      loadedCount,
      totalCount,
      failedCount,
      colliderCount: collisionWorld.getColliderCount(),
    });
  };

  // 1. ロード完了前のすり抜け防止のため、暫定フットプリントのコライダーを事前登録 (Y = 0 基準)
  for (const placement of JAPANESE_CITY_PLACEMENTS) {
    if (placement.hasCollision && placement.placeholderFootprint) {
      const fp = placement.placeholderFootprint;
      collisionWorld.upsertCollider(
        placement.instanceId,
        placement.x,
        placement.z,
        fp.width,
        fp.depth,
        placement.rotationY,
        0,
        fp.height,
      );
    }
  }
  emitProgress();

  // 2. 優先度順にソートして、同時ロード数制限（最大3並列）で非同期ロード＆配置
  const queue = [...JAPANESE_CITY_PLACEMENTS].sort(
    (a, b) => a.priority - b.priority,
  );

  const loadTemplate = (
    url: string,
    category: CityAssetPlacement['category'],
  ): Promise<THREE.Group> => {
    const existing = templatePromises.get(url);
    if (existing) return existing;

    const promise = gltfLoader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      // テクスチャ異方性とミップマップ設定を M1 iPad Air 向けに最適化 & 夜間窓/看板発光対象を収集
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const mat of materials) {
          if (!mat) continue;
          const stdMat = mat as THREE.MeshStandardMaterial;
          if (stdMat.map) stdMat.map.anisotropy = anisotropy;
          if (stdMat.normalMap) stdMat.normalMap.anisotropy = anisotropy;
          if (stdMat.roughnessMap) stdMat.roughnessMap.anisotropy = anisotropy;

          if (
            (category === 'buildings' || category === 'props') &&
            stdMat instanceof THREE.MeshStandardMaterial &&
            !trackedMatSet.has(stdMat)
          ) {
            const hasNativeEmissive =
              stdMat.emissiveMap !== null ||
              stdMat.emissive.r + stdMat.emissive.g + stdMat.emissive.b > 0.05;
            const isWindowMat =
              WINDOW_MATERIAL_PATTERN.test(stdMat.name) ||
              WINDOW_MATERIAL_PATTERN.test(obj.name);

            if (hasNativeEmissive) {
              trackedMatSet.add(stdMat);
              const entry: TrackedEmissiveMaterial = {
                mat: stdMat,
                kind: 'nativeEmissive',
                baseEmissive: stdMat.emissive.clone(),
                baseIntensity: Math.max(0.8, stdMat.emissiveIntensity || 1.0),
              };
              trackedEmissives.push(entry);
              applyNightFactorToMaterial(entry, currentNightFactor);
            } else if (isWindowMat) {
              trackedMatSet.add(stdMat);
              const entry: TrackedEmissiveMaterial = {
                mat: stdMat,
                kind: 'window',
                baseEmissive: UNLIT_EMISSIVE.clone(),
                baseIntensity: 0,
              };
              trackedEmissives.push(entry);
              applyNightFactorToMaterial(entry, currentNightFactor);
            }
          }
        }
      });
      loadedTemplates.push(root);
      if (category === 'vehicles') {
        onVehicleTemplateLoaded?.(root);
      }
      return root;
    });

    templatePromises.set(url, promise);
    return promise;
  };

  const placeInstance = async (placement: CityAssetPlacement): Promise<void> => {
    try {
      const template = await loadTemplate(placement.url, placement.category);
      if (isDisposed) return;

      const instanceModel = template.clone(true);
      normalizeAndAttachModel(
        instanceModel,
        placement,
        cityGroup,
        collisionWorld,
      );
      loadedCount += 1;
    } catch (err: unknown) {
      failedCount += 1;
      console.warn(
        `[CityBuilder] Failed to load ${placement.assetId} (${placement.url}):`,
        err,
      );
    } finally {
      emitProgress();
    }
  };

  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (!isDisposed && nextIndex < queue.length) {
      const current = queue[nextIndex];
      nextIndex += 1;
      await placeInstance(current);
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_LOADS, queue.length);
  for (let i = 0; i < workerCount; i += 1) {
    void runWorker();
  }

  return {
    group: cityGroup,
    setNightFactor: (factor: number) => {
      const clamped = Math.max(0, Math.min(1, factor));
      if (Math.abs(clamped - currentNightFactor) < 0.005) return;
      currentNightFactor = clamped;
      for (let i = 0; i < trackedEmissives.length; i += 1) {
        applyNightFactorToMaterial(trackedEmissives[i], clamped);
      }
    },
    dispose: () => {
      isDisposed = true;
      trackedEmissives.length = 0;
      trackedMatSet.clear();
      for (const placement of JAPANESE_CITY_PLACEMENTS) {
        collisionWorld.removeCollider(placement.instanceId);
      }
      scene.remove(cityGroup);

      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      const disposedTextures = new Set<THREE.Texture>();

      const disposeObject = (root: THREE.Object3D) => {
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.geometry && !disposedGeometries.has(obj.geometry)) {
            disposedGeometries.add(obj.geometry);
            obj.geometry.dispose();
          }
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const mat of mats) {
            if (!mat || disposedMaterials.has(mat)) continue;
            disposedMaterials.add(mat);
            const stdMat = mat as THREE.MeshStandardMaterial;
            const maps: Array<THREE.Texture | null | undefined> = [
              stdMat.map,
              stdMat.normalMap,
              stdMat.roughnessMap,
              stdMat.metalnessMap,
              stdMat.emissiveMap,
              stdMat.aoMap,
              stdMat.alphaMap,
            ];
            for (const tex of maps) {
              if (tex && !disposedTextures.has(tex)) {
                disposedTextures.add(tex);
                tex.dispose();
              }
            }
            mat.dispose();
          }
        });
      };

      disposeObject(cityGroup);
      for (const tpl of loadedTemplates) {
        disposeObject(tpl);
      }
      loadedTemplates.length = 0;
      templatePromises.clear();
    },
  };
}

/**
 * 各単体モデルを空の親 THREE.Group (position.y = 0 固定) に包み、
 * スケール設定後に updateMatrixWorld(true) -> Box3 計測 -> 子モデル position.y = -box.min.y
 * で埋まりゼロ・浮きゼロ接地を行う。
 * また配置後に全ワールド Box3.min.y をチェックし、min.y > 0.5 の浮遊オブジェクトは除外する。
 */
function normalizeAndAttachModel(
  model: THREE.Object3D,
  placement: CityAssetPlacement,
  parentGroup: THREE.Group,
  collisionWorld: CollisionWorld,
): void {
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(model);
  if (rawBox.isEmpty()) {
    collisionWorld.removeCollider(placement.instanceId);
    return;
  }

  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawHorizMax = Math.max(rawSize.x, rawSize.z);

  let scale = 1.0;
  if (placement.fitMode === 'height') {
    if (rawSize.y > 0.0001) {
      scale = placement.targetSize / rawSize.y;
    }
  } else {
    if (rawHorizMax > 0.0001) {
      scale = placement.targetSize / rawHorizMax;
    }
  }

  // フットプリント上限でクランプ
  if (rawHorizMax > 0.0001 && rawHorizMax * scale > placement.maxFootprint) {
    scale = placement.maxFootprint / rawHorizMax;
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1.0;
  }

  // スケール適用後に必ず updateMatrixWorld(true) を実行してからワールド座標の Box3 を計測
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  const scaledSize = scaledBox.getSize(new THREE.Vector3());

  // 水平中心を原点揃え、子モデルの position.y = -box.min.y で Y = 0 厳密接地
  model.position.set(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
  model.updateMatrixWorld(true);

  // シャドウ設定
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = placement.castShadow;
    obj.receiveShadow = true;
  });

  // 空の親 THREE.Group に包んで配置 (親 Group の position.y は必ず 0 に固定)
  const wrapper = new THREE.Group();
  wrapper.name = placement.instanceId;
  wrapper.position.set(placement.x, 0, placement.z);
  wrapper.rotation.y = placement.rotationY;
  wrapper.add(model);
  parentGroup.add(wrapper);

  // 配置後のワールド座標 Box3 を最終チェック (min.y > 0.5 の浮遊オブジェクトは配置から削除)
  wrapper.updateMatrixWorld(true);
  const finalWorldBox = new THREE.Box3().setFromObject(wrapper);
  if (finalWorldBox.isEmpty() || finalWorldBox.min.y > 0.5) {
    console.warn(
      `[CityBuilder] Removed floating/invalid object ${placement.instanceId} (min.y=${finalWorldBox.min.y.toFixed(3)})`,
    );
    parentGroup.remove(wrapper);
    collisionWorld.removeCollider(placement.instanceId);
    return;
  }

  // 修正後の実測サイズで OBB コライダーを完全同期
  if (placement.hasCollision) {
    const shrink = placement.colliderShrink ?? 0.92;
    collisionWorld.upsertCollider(
      placement.instanceId,
      placement.x,
      placement.z,
      Math.max(0.4, scaledSize.x * shrink),
      Math.max(0.4, scaledSize.z * shrink),
      placement.rotationY,
      0,
      Math.max(0.5, finalWorldBox.max.y),
    );
  }
}
