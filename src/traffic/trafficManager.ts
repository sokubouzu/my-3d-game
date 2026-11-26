import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import {
  computeObbObbSeparation,
  type CollisionWorld,
  type ObbBox2D,
  type ObbSeparationResult,
} from '../world/collisionWorld';
import { createJapaneseRoadNetwork, type RoadSegment } from './roadNetwork';
import {
  TRAFFIC_VEHICLE_CONFIGS,
  type TrafficVehicleConfig,
} from './trafficConfig';
import type { TrafficLightController } from './trafficLights';
import { TrafficVehicle, type TrafficObstacle } from './trafficVehicle';

export interface TrafficStatus {
  loadedCount: number;
  totalCount: number;
  failedCount: number;
}

/**
 * 3-A / 3-B: 街区の AI 交通車両（4台）のロード・自動走行・信号停止・衝突回避・OBB分離・破棄を統括するマネージャー。
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
  private readonly playerObstacle: TrafficObstacle = {
    id: 'player_foot',
    kind: 'player',
    x: 0,
    z: 0,
    yaw: 0,
    halfW: 0.45,
    halfD: 0.45,
  };
  private readonly scratchObbA: ObbBox2D = {
    cx: 0,
    cz: 0,
    halfW: 0.9,
    halfD: 2.3,
    cos: 1,
    sin: 0,
  };
  private readonly scratchObbB: ObbBox2D = {
    cx: 0,
    cz: 0,
    halfW: 0.9,
    halfD: 2.3,
    cos: 1,
    sin: 0,
  };
  private readonly scratchSep: ObbSeparationResult = {
    overlapped: false,
    pushX: 0,
    pushZ: 0,
    penetration: 0,
  };

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

  /** AI歩行者などが参照するための AI 交通車両スナップショットを out へ追記（ゼロアロケーション） */
  public appendVehicleObstacles(out: TrafficObstacle[]): void {
    for (let i = 0; i < this.vehicles.length; i += 1) {
      out.push(this.vehicles[i].getObstacleSnapshot());
    }
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
   * 1. プレイヤー・AI歩行者・運転可能車両2台・他のAI車両・信号をすべて前方検知対象に含める。
   * 2. 更新後、万が一車体 OBB 同士が接触・重なりを起こした場合は SAT 最小侵入深度で確実に押し戻す。
   */
  public update(
    dt: number,
    playerPos: THREE.Vector3 | null,
    drivableVehicles: readonly TrafficObstacle[],
    pedestrianObstacles?: readonly TrafficObstacle[],
    trafficLights?: TrafficLightController,
  ): void {
    if (this.isDisposed || this.vehicles.length === 0) return;

    this.obstacleBuffer.length = 0;

    if (playerPos) {
      this.playerObstacle.x = playerPos.x;
      this.playerObstacle.z = playerPos.z;
      this.obstacleBuffer.push(this.playerObstacle);
    }

    if (pedestrianObstacles) {
      for (let i = 0; i < pedestrianObstacles.length; i += 1) {
        this.obstacleBuffer.push(pedestrianObstacles[i]);
      }
    }

    for (let i = 0; i < drivableVehicles.length; i += 1) {
      this.obstacleBuffer.push(drivableVehicles[i]);
    }

    for (let i = 0; i < this.vehicles.length; i += 1) {
      this.obstacleBuffer.push(this.vehicles[i].getObstacleSnapshot());
    }

    for (let i = 0; i < this.vehicles.length; i += 1) {
      this.vehicles[i].update(dt, this.obstacleBuffer, trafficLights);
    }

    // 3-B: 車両同士のめり込み防止 — 2D OBB vs OBB SAT 最小侵入深度分離パス（最大3回反復）
    this.resolveVehicleOverlaps(drivableVehicles);
  }

  private resolveVehicleOverlaps(
    drivableVehicles: readonly TrafficObstacle[],
  ): void {
    const obbA = this.scratchObbA;
    const obbB = this.scratchObbB;
    const sep = this.scratchSep;
    const safetyMargin = 0.08;

    for (let iter = 0; iter < 3; iter += 1) {
      let anySeparated = false;

      // 1. AI 車両同士の OBB 重なり分離
      for (let i = 0; i < this.vehicles.length; i += 1) {
        const va = this.vehicles[i];
        for (let j = i + 1; j < this.vehicles.length; j += 1) {
          const vb = this.vehicles[j];
          va.fillObb(obbA);
          vb.fillObb(obbB);

          if (computeObbObbSeparation(obbA, obbB, sep, safetyMargin)) {
            const halfX = sep.pushX * 0.52;
            const halfZ = sep.pushZ * 0.52;
            va.applySeparationPush(halfX, halfZ, false);
            vb.applySeparationPush(-halfX, -halfZ, false);
            anySeparated = true;
          }
        }
      }

      // 2. AI 車両 vs 運転可能車両（自車含む）の OBB 重なり分離
      for (let i = 0; i < this.vehicles.length; i += 1) {
        const va = this.vehicles[i];
        va.fillObb(obbA);
        for (let d = 0; d < drivableVehicles.length; d += 1) {
          const dv = drivableVehicles[d];
          obbB.cx = dv.x;
          obbB.cz = dv.z;
          obbB.halfW = dv.halfW;
          obbB.halfD = dv.halfD;
          obbB.cos = Math.cos(dv.yaw);
          obbB.sin = Math.sin(dv.yaw);

          if (computeObbObbSeparation(obbA, obbB, sep, safetyMargin)) {
            va.applySeparationPush(sep.pushX, sep.pushZ, true);
            va.fillObb(obbA);
            anySeparated = true;
          }
        }
      }

      if (!anySeparated) break;
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
