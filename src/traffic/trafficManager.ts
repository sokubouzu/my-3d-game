import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import type { CollisionWorld } from '../world/collisionWorld';
import { createJapaneseRoadNetwork, type RoadSegment } from './roadNetwork';
import {
  TRAFFIC_VEHICLE_CONFIGS,
  type TrafficVehicleConfig,
} from './trafficConfig';
import { TrafficVehicle, type TrafficObstacle } from './trafficVehicle';

export interface TrafficStatus {
  loadedCount: number;
  totalCount: number;
  failedCount: number;
}

/**
 * 3-A: 街区の AI 交通車両（4台）のロード・自動走行・衝突回避・破棄を統括するマネージャー。
 * - 同一 GLB は URL ごとに1回だけロードして clone(true) することで M1 iPad Air のメモリを最適化。
 */
export class TrafficManager {
  private readonly scene: THREE.Scene;
  private readonly collisionWorld: CollisionWorld;
  private readonly maxAnisotropy: number;
  private readonly segments: Map<string, RoadSegment>;
  private readonly configs: readonly TrafficVehicleConfig[];
  private readonly onStatusChange?: (status: TrafficStatus) => void;

  private readonly templateCache = new Map<string, THREE.Object3D>();
  private readonly loadingPromises = new Map<string, Promise<THREE.Object3D>>();
  private readonly vehicles: TrafficVehicle[] = [];
  private readonly obstacleBuffer: TrafficObstacle[] = [];

  private failedCount = 0;
  private isDisposed = false;

  constructor(
    scene: THREE.Scene,
    collisionWorld: CollisionWorld,
    maxAnisotropy: number,
    onStatusChange?: (status: TrafficStatus) => void,
    configs: readonly TrafficVehicleConfig[] = TRAFFIC_VEHICLE_CONFIGS,
  ) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.maxAnisotropy = maxAnisotropy;
    this.segments = createJapaneseRoadNetwork();
    this.configs = configs;
    this.onStatusChange = onStatusChange;

    this.startLoadingAll();
  }

  public getStatus(): TrafficStatus {
    return {
      loadedCount: this.vehicles.length,
      totalCount: this.configs.length,
      failedCount: this.failedCount,
    };
  }

  private emitStatus(): void {
    if (!this.isDisposed && this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  private loadTemplate(url: string): Promise<THREE.Object3D> {
    const cached = this.templateCache.get(url);
    if (cached) return Promise.resolve(cached);

    const inflight = this.loadingPromises.get(url);
    if (inflight) return inflight;

    const gltfLoader = getGltfLoader();
    const promise = gltfLoader.loadAsync(url).then((gltf) => {
      this.templateCache.set(url, gltf.scene);
      this.loadingPromises.delete(url);
      return gltf.scene;
    });
    this.loadingPromises.set(url, promise);
    return promise;
  }

  private startLoadingAll(): void {
    this.emitStatus();
    this.configs.forEach((config, index) => {
      this.loadTemplate(config.url)
        .then((template) => {
          if (this.isDisposed) return;
          const cloned = template.clone(true);
          const vehicle = new TrafficVehicle(
            config,
            index,
            cloned,
            this.segments,
            this.collisionWorld,
            this.maxAnisotropy,
          );
          this.vehicles.push(vehicle);
          this.scene.add(vehicle.root);
          this.emitStatus();
        })
        .catch(() => {
          if (this.isDisposed) return;
          this.failedCount += 1;
          this.emitStatus();
        });
    });
  }

  /**
   * 毎フレーム全 AI 交通車両を更新する。
   * プレイヤー（徒歩時）・運転可能車両2台・他の AI 車両をすべて前方検知対象に含める。
   */
  public update(
    dt: number,
    playerPos: THREE.Vector3 | null,
    drivableVehicles: readonly TrafficObstacle[],
  ): void {
    if (this.isDisposed || this.vehicles.length === 0) return;

    this.obstacleBuffer.length = 0;

    if (playerPos) {
      this.obstacleBuffer.push({
        id: 'player_foot',
        kind: 'player',
        x: playerPos.x,
        z: playerPos.z,
        yaw: 0,
        halfW: 0.45,
        halfD: 0.45,
      });
    }

    for (const dv of drivableVehicles) {
      this.obstacleBuffer.push(dv);
    }

    for (const tv of this.vehicles) {
      this.obstacleBuffer.push(tv.getObstacleSnapshot());
    }

    for (const tv of this.vehicles) {
      tv.update(dt, this.obstacleBuffer);
    }
  }

  public dispose(): void {
    this.isDisposed = true;

    for (const tv of this.vehicles) {
      this.collisionWorld.removeCollider(tv.config.id);
      this.scene.remove(tv.root);
    }
    this.vehicles.length = 0;

    // テンプレート共有ジオメトリ・マテリアル・テクスチャを1回ずつ破棄
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    const disposedTextures = new Set<THREE.Texture>();

    for (const template of this.templateCache.values()) {
      template.traverse((obj) => {
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
    }
    this.templateCache.clear();
    this.loadingPromises.clear();
  }
}
