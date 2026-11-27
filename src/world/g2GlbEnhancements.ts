import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import type { CollisionWorld } from './collisionWorld';
import { EXPANDED_BENCH_PLACEMENTS } from './expandedWorld';

export interface G2EnhancementsOptions {
  /** park_bench.glb の差し替え構築完了時に呼ばれる（簡易ベンチ非表示化） */
  onParkBenchesLoaded?: () => void;
}

export interface G2EnhancementsHandle {
  group: THREE.Group;
  setNightFactor: (factor: number) => void;
  dispose: () => void;
}

interface TrackedEmissive {
  mat: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  dayIntensity: number;
  nightIntensity: number;
}

const UNLIT_COLOR = new THREE.Color(0x000000);
const SKYLINE_NIGHT_GLOW = new THREE.Color(0xffd28c);

const BENCH_URL = './assets/props/park_bench.glb';
const PARK_FACILITY_URL = './assets/props/park_facility_asset.glb';
const GAS_STATION_URL = './assets/buildings/small_red_gas_station.glb';
const SKYLINE_URL = './assets/buildings/super_low-poly_background_buildings.glb';
const ROAD_PACK_URL = './assets/props/road_pack_not_including_the_road.glb';

/**
 * PHASE 5-G2: 既存エリアの GLB 差し替え＆景観リアル化システム。
 * - M1 iPad Air (8GB) 最適化: 全5素材ともテクスチャ <= 512px、castShadow = false、
 *   EXT_mesh_gpu_instancing 除去済み、ベンチは InstancedMesh 2ドローコール化。
 * - 既存の昼夜切替（setNightFactor）および OBB コリジョン／カメラ遮蔽に完全連動。
 */
export function buildG2GlbEnhancements(
  scene: THREE.Scene,
  collisionWorld: CollisionWorld,
  maxAnisotropy: number,
  options: G2EnhancementsOptions = {},
): G2EnhancementsHandle {
  const root = new THREE.Group();
  root.name = 'Phase5G2GlbEnhancements';
  scene.add(root);

  const gltfLoader = getGltfLoader();
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));

  let isDisposed = false;
  let currentNightFactor = 0;

  const colliderIds: string[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const loadedRoots: THREE.Object3D[] = [];
  const trackedEmissives: TrackedEmissive[] = [];
  const trackedMatSet = new Set<THREE.Material>();

  // ガソリンスタンド・キャノピー下代表光源（1基のみ・castShadow = false）
  const gasStationLight = new THREE.PointLight(0xfff0d4, 0, 36, 1.45);
  gasStationLight.position.set(-109, 4.5, -76);
  gasStationLight.castShadow = false;
  root.add(gasStationLight);

  const registerCollider = (
    id: string,
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rotationY: number,
    minY: number,
    maxY: number,
  ): void => {
    collisionWorld.upsertCollider(
      id,
      cx,
      cz,
      width,
      depth,
      rotationY,
      minY,
      maxY,
    );
    colliderIds.push(id);
  };

  const optimizeObjectMaterials = (obj: THREE.Object3D, receiveShadow: boolean): void => {
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = receiveShadow;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        const std = mat as THREE.MeshStandardMaterial;
        if (std.map) std.map.anisotropy = anisotropy;
        if (std.normalMap) std.normalMap.anisotropy = anisotropy;
        if (std.roughnessMap) std.roughnessMap.anisotropy = anisotropy;
        if (std.emissiveMap) std.emissiveMap.anisotropy = anisotropy;
      }
    });
  };

  const applyEmissiveEntry = (entry: TrackedEmissive, factor: number): void => {
    const intensity =
      entry.dayIntensity + (entry.nightIntensity - entry.dayIntensity) * factor;
    if (intensity > 0.005) {
      entry.mat.emissive.copy(entry.baseColor);
      entry.mat.emissiveIntensity = intensity;
    } else {
      entry.mat.emissive.copy(UNLIT_COLOR);
      entry.mat.emissiveIntensity = 0;
    }
  };

  const trackEmissive = (
    mat: THREE.MeshStandardMaterial,
    baseColor: THREE.Color,
    dayIntensity: number,
    nightIntensity: number,
  ): void => {
    if (trackedMatSet.has(mat)) return;
    trackedMatSet.add(mat);
    const entry: TrackedEmissive = {
      mat,
      baseColor: baseColor.clone(),
      dayIntensity,
      nightIntensity,
    };
    trackedEmissives.push(entry);
    applyEmissiveEntry(entry, currentNightFactor);
  };

  // =========================================================================
  // 1. 公園・駅前広場ベンチの GLB 差し替え (park_bench.glb -> InstancedMesh 2DC)
  // =========================================================================
  const loadParkBenches = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(BENCH_URL);
      if (isDisposed) return;

      const template = gltf.scene;
      loadedRoots.push(template);
      template.updateMatrixWorld(true);
      optimizeObjectMaterials(template, true);

      const bounds = new THREE.Box3().setFromObject(template);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);

      if (size.x < 1e-4 || size.y < 1e-4) return;

      // 幅を 1.92m へ正規化し、座面・背もたれが見栄えする 0.72m 高へ微調整
      const scaleXZ = 1.92 / size.x;
      const scaleY = Math.max(scaleXZ, 0.72 / size.y);

      const normMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(-center.x * scaleXZ, -bounds.min.y * scaleY, -center.z * scaleXZ),
        new THREE.Quaternion(),
        new THREE.Vector3(scaleXZ, scaleY, scaleXZ),
      );

      const benchGroup = new THREE.Group();
      benchGroup.name = 'G2GlbParkBenches';

      const dummy = new THREE.Object3D();
      const meshes: THREE.Mesh[] = [];
      template.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) {
          meshes.push(obj);
        }
      });

      for (const srcMesh of meshes) {
        const bakedGeo = srcMesh.geometry.clone();
        const combined = new THREE.Matrix4().multiplyMatrices(
          normMatrix,
          srcMesh.matrixWorld,
        );
        bakedGeo.applyMatrix4(combined);
        bakedGeo.computeBoundingBox();
        bakedGeo.computeBoundingSphere();
        ownedGeometries.push(bakedGeo);

        const inst = new THREE.InstancedMesh(
          bakedGeo,
          srcMesh.material,
          EXPANDED_BENCH_PLACEMENTS.length,
        );
        inst.castShadow = false;
        inst.receiveShadow = true;
        inst.frustumCulled = false;

        for (let i = 0; i < EXPANDED_BENCH_PLACEMENTS.length; i += 1) {
          const b = EXPANDED_BENCH_PLACEMENTS[i];
          dummy.position.set(b.x, 0, b.z);
          dummy.rotation.set(0, b.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
        benchGroup.add(inst);
      }

      if (benchGroup.children.length > 0) {
        root.add(benchGroup);
        options.onParkBenchesLoaded?.();
      }
    } catch (err: unknown) {
      console.warn('[G2] Failed to load park_bench.glb:', err);
    }
  };

  // =========================================================================
  // 2. さくら中央公園の遊具・東屋・公園灯 (park_facility_asset.glb)
  // =========================================================================
  const loadParkFacilities = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(PARK_FACILITY_URL);
      if (isDisposed) return;

      const template = gltf.scene;
      loadedRoots.push(template);
      template.updateMatrixWorld(true);
      optimizeObjectMaterials(template, true);

      // 照明ノードのマテリアルを夜間発光へ連動
      template.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          const isLight =
            mat.name.toLowerCase() === 'light' ||
            mat.emissiveMap !== null ||
            mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.2;
          if (isLight) {
            trackEmissive(mat, new THREE.Color(0xffe6b3), 0.08, 1.8);
          }
        }
      });

      const extractGroupByPrefix = (prefix: string): THREE.Group | null => {
        const container = new THREE.Group();
        let count = 0;
        template.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.name.startsWith(prefix)) {
            const m = new THREE.Mesh(obj.geometry, obj.material);
            m.castShadow = false;
            m.receiveShadow = true;
            m.applyMatrix4(obj.matrixWorld);
            container.add(m);
            count += 1;
          }
        });
        if (count === 0) return null;

        container.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(container);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const pivot = new THREE.Group();
        container.position.set(-center.x, -box.min.y, -center.z);
        pivot.add(container);
        pivot.updateMatrixWorld(true);
        return pivot;
      };

      const placeFacility = (
        id: string,
        sourcePivot: THREE.Group | null,
        x: number,
        z: number,
        yaw: number,
        targetHeight: number,
        maxFootprint: number,
        colliderShrink: number,
      ): void => {
        if (!sourcePivot) return;
        const clone = sourcePivot.clone(true);
        clone.updateMatrixWorld(true);
        const rawBox = new THREE.Box3().setFromObject(clone);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);
        if (rawSize.y < 1e-4) return;

        let scale = targetHeight / rawSize.y;
        const maxHoriz = Math.max(rawSize.x, rawSize.z);
        if (maxHoriz * scale > maxFootprint) {
          scale = maxFootprint / maxHoriz;
        }
        clone.scale.setScalar(scale);

        const wrapper = new THREE.Group();
        wrapper.name = id;
        wrapper.position.set(x, 0, z);
        wrapper.rotation.y = yaw;
        wrapper.add(clone);
        root.add(wrapper);

        const finalW = Math.max(0.4, rawSize.x * scale * colliderShrink);
        const finalD = Math.max(0.4, rawSize.z * scale * colliderShrink);
        const finalH = Math.max(0.5, rawSize.y * scale);
        registerCollider(id, x, z, finalW, finalD, yaw, 0, finalH);
      };

      const swingPivot = extractGroupByPrefix('swing_D_');
      const sliderPivot = extractGroupByPrefix('slider_2_');
      const restPivot = extractGroupByPrefix('rest_2_');
      const lampPivot = extractGroupByPrefix('Lamp_light_');

      // さくら中央公園の芝生4象限（樹木 25/39, 71/85・遊歩道・コイン・噴水と完全非干渉）
      placeFacility('g2_park_swing_nw', swingPivot, 32, -108.8, 0, 2.7, 6.4, 0.88);
      placeFacility('g2_park_slider_ne', sliderPivot, 78, -108.8, Math.PI, 2.8, 8.6, 0.88);
      placeFacility('g2_park_gazebo_sw', restPivot, 32, -95.2, 0, 3.4, 4.8, 0.84);
      placeFacility('g2_park_gazebo_se', restPivot, 78, -95.2, Math.PI, 3.4, 4.8, 0.84);
      // 北側ゲート両脇のアクセント公園灯（幅8mゲート x=51..59 の両縁）
      placeFacility('g2_park_gate_lamp_w', lampPivot, 50.4, -119.0, 0, 3.0, 1.2, 0.75);
      placeFacility('g2_park_gate_lamp_e', lampPivot, 59.6, -119.0, 0, 3.0, 1.2, 0.75);
    } catch (err: unknown) {
      console.warn('[G2] Failed to load park_facility_asset.glb:', err);
    }
  };

  // =========================================================================
  // 3. 外周西道路沿い ガソリンスタンド (small_red_gas_station.glb)
  // =========================================================================
  const loadGasStation = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(GAS_STATION_URL);
      if (isDisposed) return;

      const model = gltf.scene;
      loadedRoots.push(model);
      model.updateMatrixWorld(true);
      optimizeObjectMaterials(model, true);

      // 接地基準は Plane_asphalt_0（無い場合は Plane.001_walls_0）から正確に取得し、
      // 傾いた補助ノードによる浮き・沈みを完全に防止する。
      let groundY = 0;
      let wallsHeight = 6.4;
      model.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const name = obj.name;
        if (name === 'Plane_asphalt_0') {
          const b = new THREE.Box3().setFromObject(obj);
          groundY = b.max.y;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.polygonOffset = true;
              mat.polygonOffsetFactor = -1;
              mat.polygonOffsetUnits = -1;
            }
          }
        } else if (name === 'Plane.001_walls_0') {
          const b = new THREE.Box3().setFromObject(obj);
          wallsHeight = Math.max(1.0, b.max.y - b.min.y);
        }

        // キャノピー照明・給油機ディスプレイ・看板の夜間発光を昼夜切替へ連動
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          const hasNativeEmissive =
            mat.emissiveMap !== null ||
            mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05;
          if (hasNativeEmissive) {
            const baseCol =
              mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05
                ? mat.emissive.clone()
                : new THREE.Color(0xfff2d6);
            const isCeilingGlow = name.includes('glowin');
            trackEmissive(
              mat,
              baseCol,
              isCeilingGlow ? 0.12 : 0.16,
              isCeilingGlow ? 1.75 : 1.35,
            );
          }
        }
      });

      const scale = 5.15 / wallsHeight; // キャノピー実高 ~5.15m（車両が下を通過可能）
      model.scale.setScalar(scale);
      model.position.set(0, -groundY * scale + 0.012, 0);

      // 外周西ストレート沿いの広い空き地 (-101, -76) に配置、キャノピーを西側道路向き (rotationY = Math.PI)
      const stationX = -101;
      const stationZ = -76;
      const stationYaw = Math.PI;
      const wrapper = new THREE.Group();
      wrapper.name = 'G2GasStation';
      wrapper.position.set(stationX, 0, stationZ);
      wrapper.rotation.y = stationYaw;
      wrapper.add(model);
      root.add(wrapper);

      // ドライブイン走行を妨げない分割 OBB コライダー（店舗棟 ＋ 給油機アイランド）
      const cosY = Math.cos(stationYaw);
      const sinY = Math.sin(stationYaw);
      const toWorldXZ = (lx: number, lz: number): [number, number] => [
        stationX + lx * cosY + lz * sinY,
        stationZ - lx * sinY + lz * cosY,
      ];

      // 店舗建屋 OBB (ローカル X: -15.4..-5.4, Z: -11.2..+11.7)
      const [shopWx, shopWz] = toWorldXZ(-10.4 * scale, 0.25 * scale);
      registerCollider(
        'g2_gas_station_shop',
        shopWx,
        shopWz,
        9.6 * scale,
        22.2 * scale,
        stationYaw,
        0,
        5.2,
      );

      // 給油機アイランド OBB (ローカル X: +4.2..+16.1, Z: -3.5..+3.5)
      const [pumpWx, pumpWz] = toWorldXZ(10.15 * scale, 0);
      registerCollider(
        'g2_gas_station_pumps',
        pumpWx,
        pumpWz,
        11.2 * scale,
        6.2 * scale,
        stationYaw,
        0,
        2.5,
      );
    } catch (err: unknown) {
      console.warn('[G2] Failed to load small_red_gas_station.glb:', err);
    }
  };

  // =========================================================================
  // 4. マップ外周の遠景ビル群スカイライン (super_low-poly_background_buildings.glb)
  // =========================================================================
  const loadSkyline = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(SKYLINE_URL);
      if (isDisposed) return;

      const template = gltf.scene;
      loadedRoots.push(template);
      template.updateMatrixWorld(true);
      optimizeObjectMaterials(template, false);

      // 遠景ビル群の窓ファサードを夜間にほんのり発光させ、夜景の奥行きを演出
      template.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          const mn = mat.name.toLowerCase();
          if (mn.includes('facade') || mn.includes('night') || mn === 'empty') {
            trackEmissive(mat, SKYLINE_NIGHT_GLOW, 0.0, 0.34);
          }
        }
      });

      const bounds = new THREE.Box3().setFromObject(template);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);
      if (size.x < 1e-4) return;

      const scale = 275 / size.x; // 横幅 275m・高さ約 62m の遠景パノラマ
      const skylineGroup = new THREE.Group();
      skylineGroup.name = 'G2HorizonSkyline';

      const sides: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
        { x: 0, z: -218, yaw: 0 },
        { x: 0, z: 218, yaw: Math.PI },
        { x: -218, z: 0, yaw: Math.PI / 2 },
        { x: 218, z: 0, yaw: -Math.PI / 2 },
      ];

      for (let i = 0; i < sides.length; i += 1) {
        const s = sides[i];
        const clone = template.clone(true);
        clone.scale.setScalar(scale);
        clone.position.set(
          -center.x * scale,
          -bounds.min.y * scale - 0.35,
          -center.z * scale,
        );
        const holder = new THREE.Group();
        holder.position.set(s.x, 0, s.z);
        holder.rotation.y = s.yaw;
        holder.add(clone);
        skylineGroup.add(holder);
      }

      root.add(skylineGroup);
    } catch (err: unknown) {
      console.warn('[G2] Failed to load super_low-poly_background_buildings.glb:', err);
    }
  };

  // =========================================================================
  // 5. 高精細道路小物抜粋 (road_pack_not_including_the_road.glb: 街灯・スチール柵)
  // =========================================================================
  const loadRoadPackProps = async (): Promise<void> => {
    try {
      const gltf = await gltfLoader.loadAsync(ROAD_PACK_URL);
      if (isDisposed) return;

      const template = gltf.scene;
      loadedRoots.push(template);
      template.updateMatrixWorld(true);
      optimizeObjectMaterials(template, true);

      const found: {
        lamp: THREE.Mesh | null;
        railing: THREE.Mesh | null;
      } = {
        lamp: null,
        railing: null,
      };

      template.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.name.startsWith('StreetLampDouble')) {
          found.lamp = obj;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              trackEmissive(mat, new THREE.Color(0xffe6b3), 0.06, 1.65);
            }
          }
        } else if (obj.name.startsWith('RailingDouble')) {
          found.railing = obj;
        }
      });

      const makeNormalizedPivot = (
        src: THREE.Mesh,
        targetHeight: number,
      ): { pivot: THREE.Group; size: THREE.Vector3 } | null => {
        const box = new THREE.Box3().setFromObject(src);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        if (size.y < 1e-4) return null;

        const scale = targetHeight / size.y;
        const m = new THREE.Mesh(src.geometry, src.material);
        m.castShadow = false;
        m.receiveShadow = true;
        m.applyMatrix4(src.matrixWorld);

        const inner = new THREE.Group();
        inner.add(m);
        inner.position.set(-center.x, -box.min.y, -center.z);

        const pivot = new THREE.Group();
        pivot.scale.setScalar(scale);
        pivot.add(inner);
        return { pivot, size: size.multiplyScalar(scale) };
      };

      // 5-A. 大型ダブル街灯（駅前広場ゲート・ガソリンスタンド前・外周東T字路のランドマーク4基）
      if (found.lamp) {
        const built = makeNormalizedPivot(found.lamp, 7.4);
        if (built) {
          const lampSpots: ReadonlyArray<{ id: string; x: number; z: number; yaw: number }> = [
            { id: 'g2_road_lamp_plaza_w', x: -31, z: 83.2, yaw: 0 },
            { id: 'g2_road_lamp_plaza_e', x: 31, z: 83.2, yaw: 0 },
            { id: 'g2_road_lamp_gas_sw', x: -119.5, z: -56.5, yaw: Math.PI / 2 },
            { id: 'g2_road_lamp_east_t', x: 119.5, z: -14.5, yaw: Math.PI / 2 },
          ];
          for (const spot of lampSpots) {
            const inst = built.pivot.clone(true);
            const holder = new THREE.Group();
            holder.name = spot.id;
            holder.position.set(spot.x, 0, spot.z);
            holder.rotation.y = spot.yaw;
            holder.add(inst);
            root.add(holder);
            registerCollider(spot.id, spot.x, spot.z, 0.7, 0.7, spot.yaw, 0, 7.4);
          }
        }
      }

      // 5-B. スチール反射板付きガードレール（ガソリンスタンド縁・広場外縁・外周東アプローチ6箇所）
      if (found.railing) {
        const built = makeNormalizedPivot(found.railing, 1.05);
        if (built) {
          const railW = built.size.x;
          const railD = Math.min(1.2, built.size.z);
          const railSpots: ReadonlyArray<{ id: string; x: number; z: number; yaw: number }> = [
            { id: 'g2_road_rail_gas_n', x: -120.5, z: -91, yaw: Math.PI / 2 },
            { id: 'g2_road_rail_gas_s', x: -120.5, z: -61, yaw: Math.PI / 2 },
            { id: 'g2_road_rail_plaza_w', x: -35, z: 121.8, yaw: 0 },
            { id: 'g2_road_rail_plaza_e', x: 35, z: 121.8, yaw: 0 },
            { id: 'g2_road_rail_east_n', x: 120.5, z: -24, yaw: Math.PI / 2 },
            { id: 'g2_road_rail_east_s', x: 120.5, z: 24, yaw: Math.PI / 2 },
          ];
          for (const spot of railSpots) {
            const inst = built.pivot.clone(true);
            const holder = new THREE.Group();
            holder.name = spot.id;
            holder.position.set(spot.x, 0, spot.z);
            holder.rotation.y = spot.yaw;
            holder.add(inst);
            root.add(holder);
            registerCollider(
              spot.id,
              spot.x,
              spot.z,
              railW * 0.94,
              railD,
              spot.yaw,
              0,
              1.1,
            );
          }
        }
      }
    } catch (err: unknown) {
      console.warn('[G2] Failed to load road_pack_not_including_the_road.glb:', err);
    }
  };

  // 軽量優先順に非同期ロード開始（メインスレッド非ブロック・合計約 5.2MB）
  void loadParkBenches();
  void loadRoadPackProps();
  void loadParkFacilities();
  void loadGasStation();
  void loadSkyline();

  let lastNightFactor = -1;
  const setNightFactor = (factor: number): void => {
    const clamped = Math.max(0, Math.min(1, factor));
    if (Math.abs(clamped - lastNightFactor) < 0.004) return;
    lastNightFactor = clamped;
    currentNightFactor = clamped;

    for (let i = 0; i < trackedEmissives.length; i += 1) {
      applyEmissiveEntry(trackedEmissives[i], clamped);
    }
    gasStationLight.intensity = clamped * 36;
  };

  setNightFactor(0);

  return {
    group: root,
    setNightFactor,
    dispose: () => {
      isDisposed = true;
      for (const id of colliderIds) {
        collisionWorld.removeCollider(id);
      }
      colliderIds.length = 0;
      trackedEmissives.length = 0;
      trackedMatSet.clear();
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
            const maps: Array<THREE.Texture | null | undefined> = [
              std.map,
              std.normalMap,
              std.roughnessMap,
              std.metalnessMap,
              std.aoMap,
              std.emissiveMap,
            ];
            for (const tex of maps) {
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
      for (const r of loadedRoots) {
        disposeTree(r);
      }
      loadedRoots.length = 0;
    },
  };
}
