import * as THREE from 'three';
import { RENDER_CONFIG } from './config';
import { createWebGL2Renderer, type RendererBundle } from './renderer';
import { getGltfLoader, disposeLoaders } from './loaders';
import { InputManager } from '../input/inputManager';
import { loadPlayerModel, type LoadedPlayerModel } from '../player/playerModel';
import {
  PlayerController,
  type PlayerLocomotionState,
} from '../player/playerController';
import { ThirdPersonCamera } from '../camera/thirdPersonCamera';
import { CITY_METRICS, CollisionWorld } from '../world/collisionWorld';
import {
  createCityEnvironment,
  type EnvironmentStatus,
} from '../world/environment';
import {
  buildJapaneseCity,
  type CityBuildProgress,
} from '../world/cityBuilder';
import { StreetLightSystem } from '../world/streetLights';
import { buildExpandedWorld } from '../world/expandedWorld';
import { buildJapaneseStreetProps } from '../world/japaneseProps';
import { buildG2GlbEnhancements } from '../world/g2GlbEnhancements';
import { buildG2bOptimizedGlbGrass } from '../world/vegetationSystem';
import {
  TimeOfDayController,
  type TimeOfDayMode,
} from '../world/timeOfDay';
import {
  WeatherController,
  type WeatherMode,
} from '../world/weather';
import {
  DRIVABLE_VEHICLES,
  VehicleController,
  VehicleDamageEffects,
  loadHeroVehicle,
  type DriveSpeedMode,
  type LoadedHeroVehicle,
  type VehicleDamageState,
  type VehicleDamageTickResult,
  type VehicleGear,
  type VehicleType,
} from '../vehicle';
import {
  TRAFFIC_VEHICLE_CONFIGS,
  TrafficLightController,
  TrafficManager,
  type TrafficObstacle,
  type TrafficStatus,
} from '../traffic';
import {
  PEDESTRIAN_CONFIGS,
  PedestrianManager,
  type PedestrianStatus,
} from '../pedestrians';
import type { MinimapSnapshot } from '../ui/Minimap';
import {
  SoundManager,
  type VehicleAudioFrame,
} from '../audio/soundManager';
import {
  CoinCollectibleSystem,
  TIME_ATTACK_RETRY_POSE,
  TimeAttackSystem,
  findNearestSafeRoadPose,
  type CoinStatusSnapshot,
  type TimeAttackStatusSnapshot,
} from '../gameplay';

export type ControlMode = 'foot' | 'vehicle';

export interface EngineStatus {
  isWebGL2: boolean;
  dpr: number;
  dracoReady: boolean;
  fps: number;
  controlMode: ControlMode;
  canEnterVehicle: boolean;
  canExitVehicle: boolean;
  activeVehicleName: string | null;
  activeVehicleType: VehicleType | null;
  nearbyVehicleName: string | null;
  vehicleSpeedKmh: number;
  vehicleGear: VehicleGear;
  vehicleSpeedMode: DriveSpeedMode;
  vehicleSpeedLimitKmh: number;
  vehicleHp: number;
  vehicleDamageState: VehicleDamageState;
  vehicleBurnRemainingSec: number;
  ejectDamageFlashTimeMs: number;
  vehicleAlertMessage: string | null;
  vehicleAlertTone: 'danger' | 'info' | 'success';
  playerLoaded: boolean;
  playerError: string | null;
  playerHeight: number;
  jointCount: number;
  playerState: PlayerLocomotionState;
  animationName: string;
  speed: number;
  position: { x: number; y: number; z: number };
  cityLoadedCount: number;
  cityTotalCount: number;
  cityFailedCount: number;
  colliderCount: number;
  envStatus: EnvironmentStatus;
  heroVehicleLoaded: boolean;
  heroVehicleError: string | null;
  heroVehicleWheels: number;
  drivableVehicleCount: number;
  drivableVehicleTotal: number;
  trafficLoadedCount: number;
  trafficTotalCount: number;
  pedestrianLoadedCount: number;
  pedestrianTotalCount: number;
  trafficLightLabel: string;
  audioMuted: boolean;
  audioUnlocked: boolean;
  timeOfDay: TimeOfDayMode;
  weather: WeatherMode;
  coins: CoinStatusSnapshot;
  timeAttack: TimeAttackStatusSnapshot;
}

export interface GameEngineHandle {
  setTouchMove: (x: number, y: number) => void;
  addLookDelta: (dx: number, dy: number) => void;
  setTouchSprint: (active: boolean) => void;
  triggerJump: () => void;
  triggerInteract: () => void;
  setTouchVehicleSteer: (steer: number) => void;
  setTouchVehicleThrottle: (throttle: number) => void;
  setTouchVehicleBrake: (brake: number) => void;
  cycleVehicleSpeedMode: () => DriveSpeedMode | null;
  cycleTimeOfDay: () => TimeOfDayMode;
  cycleWeather: () => WeatherMode;
  respawnCoins: () => void;
  abortTimeAttack: () => void;
  retryTimeAttack: () => void;
  dismissTimeAttackResult: () => void;
  recoverActiveVehicle: () => boolean;
  getMinimapSnapshot: (out: MinimapSnapshot) => void;
  unlockAudio: () => void;
  toggleAudioMute: () => boolean;
  dispose: () => void;
}

/**
 * 1-D / 1-E / 2-B / 2-C: WebGL2 基盤 + プレイヤー操作 + 160m四方の日本の街区
 * + Poly Haven 1K PBR・HDRI 環境 + カメラ遮蔽回避 + 複数運転可能車両（Innova / Porsche 911 Turbo）
 */
export function startGameEngine(
  canvas: HTMLCanvasElement,
  onStatusUpdate: (status: EngineStatus) => void,
): GameEngineHandle {
  const rendererBundle: RendererBundle = createWebGL2Renderer(canvas);
  const { renderer, isWebGL2 } = rendererBundle;
  let currentDpr = rendererBundle.dpr;

  // DRACOLoader 初期化確認
  const gltfLoader = getGltfLoader();
  const dracoReady = Boolean(gltfLoader);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    560,
  );
  const tpsCamera = new ThirdPersonCamera(camera, {
    initialDistance: 4.2,
    initialPitch: 0.24,
    targetHeight: 1.42,
  });

  // 1-E: 軽量ライティング (M1 iPad Air 最適化: シャドウマップ 1024px、SSR/SSAO/DoF 無効)
  const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x5c6068, 0.72);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.55);
  dirLight.position.set(18, 30, 14);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(
    RENDER_CONFIG.shadowMapSize,
    RENDER_CONFIG.shadowMapSize,
  );
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.025;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 90;
  const shadowExtent = 24;
  dirLight.shadow.camera.left = -shadowExtent;
  dirLight.shadow.camera.right = shadowExtent;
  dirLight.shadow.camera.top = shadowExtent;
  dirLight.shadow.camera.bottom = -shadowExtent;
  scene.add(dirLight);
  scene.add(dirLight.target);

  // 1-D: 衝突判定ワールド (160m x 160m 街区 + 歩道段差 + 建物/車両/小物 OBB)
  const collisionWorld = new CollisionWorld(CITY_METRICS.worldHalfExtent);

  // 2-C: 徒歩・運転共通のカメラ遮蔽回避レイキャストを接続
  tpsCamera.setOcclusionRaycast(
    (ox, oy, oz, dx, dy, dz, maxDistance, ignoreId) =>
      collisionWorld.raycastCameraOcclusion(
        ox,
        oy,
        oz,
        dx,
        dy,
        dz,
        maxDistance,
        ignoreId,
      ),
  );

  let isDisposed = false;
  let controlMode: ControlMode = 'foot';
  let loadedPlayer: LoadedPlayerModel | null = null;
  let playerController: PlayerController | null = null;
  let playerError: string | null = null;

  const loadedVehicles: LoadedHeroVehicle[] = [];
  const vehicleControllers: VehicleController[] = [];
  let activeVehicle: VehicleController | null = null;
  let nearbyVehicle: VehicleController | null = null;
  let heroVehicleError: string | null = null;
  let canEnterVehicle = false;
  let canExitVehicle = false;
  const playerPos = new THREE.Vector3(0, 0, 0);
  const focusPos = new THREE.Vector3(0, 0, 0);

  let cityProgress: CityBuildProgress = {
    loadedCount: 0,
    totalCount: 0,
    failedCount: 0,
    colliderCount: 0,
  };
  let envStatus: EnvironmentStatus = {
    asphalt: 'procedural',
    pavement: 'procedural',
    sky: 'procedural',
  };
  let trafficStatus: TrafficStatus = {
    loadedCount: 0,
    totalCount: TRAFFIC_VEHICLE_CONFIGS.length,
    failedCount: 0,
  };
  let pedestrianStatus: PedestrianStatus = {
    loadedCount: 0,
    totalCount: PEDESTRIAN_CONFIGS.length,
    failed: false,
  };
  const drivableObstaclesPool: TrafficObstacle[] = [];
  const drivableObstacles: TrafficObstacle[] = [];
  const pedestrianObstacles: TrafficObstacle[] = [];
  const allVehicleObstacles: TrafficObstacle[] = [];
  const tempVehiclePos = new THREE.Vector3();

  // 3-B: 日本式交差点信号機（4隅設置・青/黄/赤サイクル制御）
  const trafficLights = new TrafficLightController(scene, collisionWorld);

  // 3-G: 街灯システム（14基＋中央交差点代表光源1基、castShadow=false）
  const streetLights = new StreetLightSystem(scene, collisionWorld);

  // 4-B: ゴールドコイン収集システム（38枚・InstancedMesh 2ドローコール）& タイムアタックシステム（8ゲート）
  const coinSystem = new CoinCollectibleSystem(scene, collisionWorld);
  const timeAttackSystem = new TimeAttackSystem(scene);

  // 5-B / 5-B2: 全車両共有の軽量ダメージエフェクト（火花・白煙/黒煙・炎・爆発・飛散破片・リングバッファ路面オイル漏れ痕）
  const damageEffects = new VehicleDamageEffects(scene);
  const damageTickScratch: VehicleDamageTickResult = {
    impact: null,
    fireBeep: false,
    fireBeepUrgency: 0,
    explodedNow: false,
    wreckLandedNow: false,
    readyToRespawn: false,
    fireLightIntensity: 0,
    fireLightX: 0,
    fireLightY: 0,
    fireLightZ: 0,
  };
  const respawnSearchPosScratch = new THREE.Vector3();
  let ejectDamageFlashTimeMs = 0;
  let vehicleAlertMessage: string | null = null;
  let vehicleAlertTone: 'danger' | 'info' | 'success' = 'info';
  let vehicleAlertUntilMs = 0;

  const showVehicleAlert = (
    message: string,
    tone: 'danger' | 'info' | 'success',
    durationMs = 3600,
  ) => {
    vehicleAlertMessage = message;
    vehicleAlertTone = tone;
    vehicleAlertUntilMs = performance.now() + durationMs;
  };

  // 3-G / 4-A調整: プレイヤー運転車両の前方路面照射用 SpotLight（常設・影オフ・強度0で消灯しシェーダ再コンパイル回避）
  // 夜間高速走行時に前方のカーブ・白線・ガードレールをしっかり照らせる照射距離 (88m) と広がり角 (54°) に調整
  const playerHeadlightSpot = new THREE.SpotLight(
    0xfff5e0,
    0,
    88,
    Math.PI * 0.3,
    0.68,
    1.25,
  );
  playerHeadlightSpot.castShadow = false;
  scene.add(playerHeadlightSpot);
  scene.add(playerHeadlightSpot.target);

  const sunOffsetScratch = new THREE.Vector3(18, 30, 14);
  const headlightOriginScratch = new THREE.Vector3();
  const headlightTargetScratch = new THREE.Vector3();
  let timeOfDayController: TimeOfDayController | null = null;
  let weatherController: WeatherController | null = null;

  // 3-D: iPad Safari 対応 Web Audio 音響エンジン（ゼロアロケーション更新用フレームを事前確保）
  const vehicleAudioFrame: VehicleAudioFrame = {
    isDriving: false,
    speedKmh: 0,
    maxSpeedKmh: 110,
    throttle: 0,
    brake: 0,
    handbrake: false,
    isReversing: false,
    profile: 'standard',
  };
  let audioMuted = false;
  let audioUnlocked = false;
  const soundManager = new SoundManager((audioState) => {
    audioMuted = audioState.muted;
    audioUnlocked = audioState.unlocked;
    emitStatus();
  });

  let rafId = 0;
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let lastFpsTime = lastFrameTime;
  let lastHudUpdateTime = lastFrameTime;
  let lastDprAdjustTime = lastFrameTime;
  let currentFps = 0;

  const findNearestEnterableVehicle = (
    pos: THREE.Vector3,
  ): VehicleController | null => {
    let best: VehicleController | null = null;
    let bestDist = Infinity;
    for (const vc of vehicleControllers) {
      if (!vc.isPlayerNearDoor(pos)) continue;
      const dist = vc.getDoorDistance(pos);
      if (dist < bestDist) {
        bestDist = dist;
        best = vc;
      }
    }
    return best;
  };

  const emitStatus = () => {
    if (isDisposed) return;
    const nowMs = performance.now();
    if (vehicleAlertMessage !== null && nowMs > vehicleAlertUntilMs) {
      vehicleAlertMessage = null;
    }
    const telemetry = playerController?.getTelemetry();
    const vehicleTelemetry = activeVehicle?.getTelemetry();
    const activePos =
      controlMode === 'vehicle' && vehicleTelemetry
        ? vehicleTelemetry.position
        : (telemetry?.position ?? { x: 0, y: 0, z: 0 });
    const totalBoundWheels = loadedVehicles.reduce(
      (sum, v) => sum + v.rig.boundWheelCount,
      0,
    );
    onStatusUpdate({
      isWebGL2,
      dpr: currentDpr,
      dracoReady,
      fps: currentFps,
      controlMode,
      canEnterVehicle,
      canExitVehicle,
      activeVehicleName: activeVehicle?.getDisplayName() ?? null,
      activeVehicleType: activeVehicle?.getType() ?? null,
      nearbyVehicleName: nearbyVehicle?.getDisplayName() ?? null,
      vehicleSpeedKmh: vehicleTelemetry?.speedKmh ?? 0,
      vehicleGear: vehicleTelemetry?.gear ?? 'P',
      vehicleSpeedMode: vehicleTelemetry?.speedMode ?? 'CITY',
      vehicleSpeedLimitKmh: vehicleTelemetry?.speedLimitKmh ?? 45,
      vehicleHp: vehicleTelemetry?.hp ?? 100,
      vehicleDamageState: vehicleTelemetry?.damageState ?? 'intact',
      vehicleBurnRemainingSec: vehicleTelemetry?.burnRemainingSec ?? 0,
      ejectDamageFlashTimeMs,
      vehicleAlertMessage,
      vehicleAlertTone,
      playerLoaded: loadedPlayer !== null,
      playerError,
      playerHeight: loadedPlayer?.info.heightMeters ?? 0,
      jointCount: loadedPlayer?.info.jointCount ?? 0,
      playerState: telemetry?.state ?? 'idle',
      animationName:
        controlMode === 'vehicle'
          ? `Driving ${activeVehicle?.getDisplayName() ?? ''} (${vehicleTelemetry?.gear ?? 'P'})`
          : (telemetry?.animationName ?? 'Loading...'),
      speed:
        controlMode === 'vehicle'
          ? Math.abs(vehicleTelemetry?.speedMs ?? 0)
          : (telemetry?.speed ?? 0),
      position: activePos,
      cityLoadedCount: cityProgress.loadedCount,
      cityTotalCount: cityProgress.totalCount,
      cityFailedCount: cityProgress.failedCount,
      colliderCount: collisionWorld.getColliderCount(),
      envStatus,
      heroVehicleLoaded: loadedVehicles.length > 0,
      heroVehicleError,
      heroVehicleWheels: totalBoundWheels,
      drivableVehicleCount: loadedVehicles.length,
      drivableVehicleTotal: DRIVABLE_VEHICLES.length,
      trafficLoadedCount: trafficStatus.loadedCount,
      trafficTotalCount: trafficStatus.totalCount,
      pedestrianLoadedCount: pedestrianStatus.loadedCount,
      pedestrianTotalCount: pedestrianStatus.totalCount,
      trafficLightLabel: trafficLights.getHudLabel(),
      audioMuted,
      audioUnlocked,
      timeOfDay: timeOfDayController?.getMode() ?? 'day',
      weather: weatherController?.getMode() ?? 'sunny',
      coins: coinSystem.getStatus(),
      timeAttack: timeAttackSystem.getStatus(),
    });
  };

  // 1-E: Poly Haven 1K PBR (asphalt_01 / concrete_pavement / HDRI) + 日本の街区地面・交差点
  const cityEnv = createCityEnvironment(scene, renderer, (nextEnvStatus) => {
    envStatus = nextEnvStatus;
    timeOfDayController?.syncBackgroundVisibility(cityEnv.hasLoadedHdri());
    emitStatus();
  });

  // 3-G: 昼・夕方・夜の時間帯切替コントローラー
  timeOfDayController = new TimeOfDayController(scene, dirLight, hemiLight, {
    setDayHdriBackgroundVisible: (visible) =>
      cityEnv.setDayHdriBackgroundVisible(visible),
  });
  timeOfDayController.syncBackgroundVisibility(cityEnv.hasLoadedHdri());

  // 5-A: 天候切替システム（晴れ・曇り・雨・霧＋雨粒パーティクル＋濡れた路面/車体）
  weatherController = new WeatherController(scene);
  weatherController.registerRoadMaterials(
    cityEnv.asphaltMaterial,
    cityEnv.pavementMaterial,
  );

  // 1-D: 承認済み単体 GLB モデルの街区配置 & OBB コライダー構築
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const cityBuilder = buildJapaneseCity(
    scene,
    collisionWorld,
    maxAnisotropy,
    (progress) => {
      cityProgress = progress;
      emitStatus();
    },
    (vehicleRoot) => {
      weatherController?.registerVehicleObject(vehicleRoot);
    },
  );

  // 4-A: 街区拡張（外周道路ループ・都市公園・駅前ロータリー広場、Y = 0 統一）& 日本の街並み装飾
  const expandedWorld = buildExpandedWorld(
    scene,
    collisionWorld,
    cityEnv.asphaltMaterial,
    cityEnv.pavementMaterial,
    maxAnisotropy,
  );
  const japaneseProps = buildJapaneseStreetProps(
    scene,
    collisionWorld,
    maxAnisotropy,
    cityBuilder.getSharedTemplate(
      './assets/props/japanese_inspired_vending_machines.glb',
      'props',
    ),
  );
  // 5-G2: 既存エリアのGLB差し替え＆景観リアル化（ベンチ・公園遊具・ガソリンスタンド・遠景ビル群・道路小物抜粋）
  const g2Enhancements = buildG2GlbEnhancements(
    scene,
    collisionWorld,
    maxAnisotropy,
    {
      onParkBenchesLoaded: () => {
        expandedWorld.setProceduralBenchesVisible(false);
      },
    },
  );
  // 5-G2b: 公園芝生PBR・多層アルファ葉カード樹木・最適化草GLBの天候連動およびInstanced配置
  weatherController.registerVegetationMaterial(expandedWorld.grassMaterial);
  for (const vegMat of japaneseProps.getVegetationMaterials()) {
    weatherController.registerVegetationMaterial(vegMat);
  }
  const g2bGrass = buildG2bOptimizedGlbGrass(
    scene,
    japaneseProps.getTreePlacements(),
    maxAnisotropy,
    (grassMat) => {
      weatherController?.registerVegetationMaterial(grassMat);
    },
  );

  // 2-A / 2-B / 2-C: 運転可能な全車両（Innova + Porsche 911 Turbo + Harley Bike）をロード＆ OBB コライダー・VehicleController 構築
  for (const vehicleConfig of DRIVABLE_VEHICLES) {
    collisionWorld.upsertCollider(
      vehicleConfig.id,
      vehicleConfig.initialPosition.x,
      vehicleConfig.initialPosition.z,
      vehicleConfig.placeholderDimensions.width * vehicleConfig.colliderShrink,
      vehicleConfig.placeholderDimensions.length * vehicleConfig.colliderShrink,
      vehicleConfig.initialRotationY,
      0,
      vehicleConfig.placeholderDimensions.height,
    );

    loadHeroVehicle(maxAnisotropy, vehicleConfig)
      .then((vehicle) => {
        if (isDisposed) {
          vehicle.dispose();
          return;
        }
        loadedVehicles.push(vehicle);
        scene.add(vehicle.root);
        // 5-B: 運転可能3台は雨濡れ質感と損傷（傷・煤・黒焦げ）を VehicleDamageVisualController で競合なく合成制御
        const vc = new VehicleController(vehicle, collisionWorld);
        vc.setLightsIntensity(timeOfDayController?.getHeadlightFactor() ?? 0);
        vehicleControllers.push(vc);
        drivableObstaclesPool.push({
          id: vehicleConfig.id,
          kind: 'drivable',
          x: vehicle.root.position.x,
          z: vehicle.root.position.z,
          yaw: vehicle.root.rotation.y,
          halfW: vehicle.dimensions.width * 0.5,
          halfD: vehicle.dimensions.length * 0.5,
        });
        emitStatus();
      })
      .catch((err: unknown) => {
        if (isDisposed) return;
        collisionWorld.removeCollider(vehicleConfig.id);
        heroVehicleError =
          err instanceof Error
            ? `${vehicleConfig.displayName}: ${err.message}`
            : `Failed to load ${vehicleConfig.displayName}`;
        emitStatus();
      });
  }

  // 3-A / 3-B: AI 交通車両4台（左側通行・バンパー基準車間維持・信号停止・OBB分離）
  const trafficManager = new TrafficManager(
    scene,
    collisionWorld,
    maxAnisotropy,
    (nextTrafficStatus) => {
      trafficStatus = nextTrafficStatus;
      emitStatus();
    },
    TRAFFIC_VEHICLE_CONFIGS,
    (vehicleRoot) => {
      weatherController?.registerVehicleObject(vehicleRoot);
    },
  );

  // 3-B: 歩道および横断歩道を歩く AI 歩行者6人（SkeletonUtils.clone + 独立 AnimationMixer + 信号連動）
  const pedestrianManager = new PedestrianManager(
    scene,
    collisionWorld,
    maxAnisotropy,
    (nextPedStatus) => {
      pedestrianStatus = nextPedStatus;
      emitStatus();
    },
  );

  const inputManager = new InputManager(canvas);

  // 初期カメラ位置を中央交差点のプレイヤー位置に合わせる
  tpsCamera.update(0.016, playerPos, collisionWorld.getGroundHeight(0, 0));

  // 1-B / 1-C: player.glb 非同期ロード（既存徒歩移動・アニメーション・コリジョン連携）
  loadPlayerModel(maxAnisotropy)
    .then((playerModel) => {
      if (isDisposed) {
        playerModel.dispose();
        return;
      }
      loadedPlayer = playerModel;
      scene.add(playerModel.root);
      playerController = new PlayerController(playerModel, {
        getGroundHeight: (x, z) => collisionWorld.getGroundHeight(x, z),
        worldHalfExtent: collisionWorld.worldHalfExtent,
        resolveHorizontalCollision: (x, y, z, radius, playerHeight) =>
          collisionWorld.resolveHorizontalCollision(
            x,
            y,
            z,
            radius,
            playerHeight,
          ),
      });
      playerController.getPosition(playerPos);
      tpsCamera.update(
        0.016,
        playerPos,
        collisionWorld.getGroundHeight(playerPos.x, playerPos.z),
      );
      emitStatus();
    })
    .catch((err: unknown) => {
      if (isDisposed) return;
      playerError =
        err instanceof Error ? err.message : 'Failed to load player.glb';
      emitStatus();
    });

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rendererBundle.resize(w, h);
  };
  window.addEventListener('resize', handleResize);

  emitStatus();

  const animate = (now: number) => {
    if (isDisposed) return;
    rafId = requestAnimationFrame(animate);

    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    const input = inputManager.consumeSnapshot();
    tpsCamera.applyLookDelta(input.lookDeltaX, input.lookDeltaY);
    tpsCamera.applyZoomDelta(input.zoomDelta);

    let modeOrPromptChanged = false;

    // 2-B3 / 2-C: 徒歩 <-> 運転の乗降・車両乗換（E/F キーまたはタッチボタン）
    if (input.interactPressed && playerController) {
      if (controlMode === 'foot') {
        const nearest = findNearestEnterableVehicle(playerPos);
        if (nearest) {
          controlMode = 'vehicle';
          activeVehicle = nearest;
          nearbyVehicle = null;
          const riderMount = nearest.getRiderMount();
          if (nearest.getType() === 'bike' && riderMount) {
            playerController.enterBikeRide(
              nearest.getRiderAnchor(),
              riderMount.offsetY,
              riderMount.offsetZ,
              riderMount.forwardLeanRad,
              riderMount.animationName,
            );
          } else {
            playerController.setVisible(false);
          }
          activeVehicle.setOccupied(true);
          tpsCamera.alignBehind(activeVehicle.getYaw());
          modeOrPromptChanged = true;
        }
      } else if (
        controlMode === 'vehicle' &&
        activeVehicle &&
        activeVehicle.canExit()
      ) {
        const exit = activeVehicle.computeExitTransform();
        const wasBike = activeVehicle.getType() === 'bike';
        activeVehicle.setOccupied(false);
        activeVehicle = null;
        if (wasBike) {
          playerController.exitBikeRide(scene, exit.x, exit.y, exit.z, exit.yaw);
        } else {
          playerController.teleportTo(exit.x, exit.y, exit.z, exit.yaw);
          playerController.setVisible(true);
        }
        playerController.getPosition(playerPos);
        controlMode = 'foot';
        tpsCamera.alignBehind(exit.yaw);
        modeOrPromptChanged = true;
      }
    }

    if (controlMode === 'vehicle' && activeVehicle) {
      for (const vc of vehicleControllers) {
        if (vc === activeVehicle) {
          vc.update(dt, {
            steer: input.vehicleSteer,
            throttle: input.vehicleThrottle,
            brake: input.vehicleBrake,
            handbrake: input.vehicleHandbrake,
          });
        } else {
          vc.update(dt, null);
        }
      }
      const isRidingBike = activeVehicle.getType() === 'bike';
      if (isRidingBike && playerController) {
        playerController.updateRidingAnimation(dt);
      }
      activeVehicle.getPosition(focusPos);

      const groundY = collisionWorld.getGroundHeight(focusPos.x, focusPos.z);
      tpsCamera.updateDriving(
        dt,
        focusPos,
        activeVehicle.getYaw(),
        activeVehicle.getSpeed(),
        groundY,
        activeVehicle.getId(),
        isRidingBike,
      );

      const nextCanExit = activeVehicle.canExit();
      if (
        canEnterVehicle !== false ||
        canExitVehicle !== nextCanExit ||
        nearbyVehicle !== null
      ) {
        canEnterVehicle = false;
        canExitVehicle = nextCanExit;
        nearbyVehicle = null;
        modeOrPromptChanged = true;
      }

      // 3-D: 乗車中サウンド（エンジン音・走行音・急ブレーキスキッド音）
      const vSpeedMs = activeVehicle.getSpeed();
      vehicleAudioFrame.isDriving = !activeVehicle.isWrecked();
      vehicleAudioFrame.speedKmh = Math.abs(vSpeedMs) * 3.6;
      vehicleAudioFrame.maxSpeedKmh = activeVehicle.getMaxForwardSpeedKmh();
      vehicleAudioFrame.throttle = activeVehicle.isBurning() ? 0 : input.vehicleThrottle;
      vehicleAudioFrame.brake = input.vehicleBrake;
      vehicleAudioFrame.handbrake = input.vehicleHandbrake;
      vehicleAudioFrame.isReversing = vSpeedMs < -0.15;
      vehicleAudioFrame.profile = activeVehicle.getAudioProfile();
      soundManager.updateVehicleAudio(vehicleAudioFrame);
      soundManager.updateFootsteps(dt, false, 0, false);
    } else {
      for (const vc of vehicleControllers) {
        vc.update(dt, null);
      }
      if (playerController) {
        playerController.update(dt, input, tpsCamera.getYaw());
        playerController.getPosition(playerPos);
      }
      focusPos.copy(playerPos);

      const groundY = collisionWorld.getGroundHeight(playerPos.x, playerPos.z);
      tpsCamera.update(dt, playerPos, groundY);

      const nextNearby =
        playerController !== null
          ? findNearestEnterableVehicle(playerPos)
          : null;
      const nextCanEnter = nextNearby !== null;
      if (
        canEnterVehicle !== nextCanEnter ||
        canExitVehicle !== false ||
        nearbyVehicle !== nextNearby
      ) {
        canEnterVehicle = nextCanEnter;
        canExitVehicle = false;
        nearbyVehicle = nextNearby;
        modeOrPromptChanged = true;
      }

      // 3-D: 降車時はエンジン音を滑らかに停止し、徒歩の足音＆着地音を連動
      vehicleAudioFrame.isDriving = false;
      vehicleAudioFrame.speedKmh = 0;
      vehicleAudioFrame.throttle = 0;
      vehicleAudioFrame.brake = 0;
      vehicleAudioFrame.handbrake = false;
      vehicleAudioFrame.isReversing = false;
      soundManager.updateVehicleAudio(vehicleAudioFrame);

      if (playerController) {
        const landingSpeed = playerController.consumeLandingSpeed();
        if (landingSpeed > 0) {
          soundManager.playLanding(landingSpeed);
        }
        soundManager.updateFootsteps(
          dt,
          playerController.getIsGrounded(),
          playerController.getHorizontalSpeed(),
          playerController.getLocomotionState() === 'run',
        );
      }
    }

    // 5-B / 5-B2: 全運転可能車両の5段階ダメージ演出（白煙・黒煙・火花・オイル漏れ・ライト点滅・発火警告・大爆発・跳ね上がり着地・炎上継続・自動リスポーン）
    const rainAmountNow = weatherController?.getRainAmount() ?? 0;
    let bestFireScore = 0;
    let bestFireIntensity = 0;
    let bestFireX = 0;
    let bestFireY = -50;
    let bestFireZ = 0;

    for (let i = 0; i < vehicleControllers.length; i += 1) {
      const vc = vehicleControllers[i];
      const wasActive = controlMode === 'vehicle' && activeVehicle === vc;
      vc.updateDamageLifecycle(dt, damageEffects, rainAmountNow, damageTickScratch);

      if (damageTickScratch.fireLightIntensity > 0.01) {
        const fDist = Math.hypot(
          damageTickScratch.fireLightX - focusPos.x,
          damageTickScratch.fireLightZ - focusPos.z,
        );
        const score = damageTickScratch.fireLightIntensity / (1 + fDist * 0.06);
        if (score > bestFireScore) {
          bestFireScore = score;
          bestFireIntensity = damageTickScratch.fireLightIntensity;
          bestFireX = damageTickScratch.fireLightX;
          bestFireY = damageTickScratch.fireLightY;
          bestFireZ = damageTickScratch.fireLightZ;
        }
      }

      if (damageTickScratch.impact) {
        const imp = damageTickScratch.impact;
        const dist = Math.hypot(imp.worldX - focusPos.x, imp.worldZ - focusPos.z);
        if (wasActive || dist < 35) {
          soundManager.playVehicleImpact(imp.normalSpeed, imp.incidence);
        }
        if (wasActive) {
          tpsCamera.addShake(
            0.14 + imp.intensity01 * 0.68,
            imp.intensity01 > 0.55 ? 4.8 : 7.8,
          );
          if (imp.damage > 0) {
            modeOrPromptChanged = true;
          }
        }
      }

      if (damageTickScratch.fireBeep) {
        vc.getPosition(tempVehiclePos);
        const dist = Math.hypot(
          tempVehiclePos.x - focusPos.x,
          tempVehiclePos.z - focusPos.z,
        );
        if (wasActive || dist < 48) {
          soundManager.playFireWarningBeep(damageTickScratch.fireBeepUrgency);
        }
      }

      if (damageTickScratch.wreckLandedNow) {
        vc.getPosition(tempVehiclePos);
        const dist = Math.hypot(
          tempVehiclePos.x - focusPos.x,
          tempVehiclePos.z - focusPos.z,
        );
        if (dist < 42) {
          soundManager.playBlastThud(dist);
          tpsCamera.addShake(Math.max(0.08, 0.36 / (1 + dist * 0.06)), 5.4);
        }
      }

      if (damageTickScratch.explodedNow) {
        vc.getPosition(tempVehiclePos);
        const dist = Math.hypot(
          tempVehiclePos.x - focusPos.x,
          tempVehiclePos.z - focusPos.z,
        );
        soundManager.playExplosion(dist);
        const shakeStr = Math.max(0.22, 1.25 / (1 + dist * 0.036));
        tpsCamera.addShake(shakeStr, 2.5);

        if (wasActive && playerController) {
          // 爆発瞬間にまだ乗車中なら自動で車外へ緊急脱出（非グロテスクな衝撃演出）
          const eject = vc.computeEmergencyEjectTransform();
          vc.setOccupied(false);
          activeVehicle = null;
          controlMode = 'foot';
          canExitVehicle = false;
          playerController.triggerEmergencyEject(
            scene,
            eject.x,
            eject.y,
            eject.z,
            eject.yaw,
            eject.dirX,
            eject.dirZ,
          );
          playerController.getPosition(playerPos);
          focusPos.copy(playerPos);
          ejectDamageFlashTimeMs = performance.now();
          showVehicleAlert(
            `緊急脱出！${vc.getDisplayName()} が爆発しました（約10秒後に近くへ自動復帰）`,
            'danger',
            4500,
          );
        } else {
          showVehicleAlert(
            `${vc.getDisplayName()} が爆発炎上しました（約10秒後に近くへ自動復帰）`,
            'info',
            4000,
          );
        }
        modeOrPromptChanged = true;
      }

      if (damageTickScratch.readyToRespawn) {
        // プレイヤーが困らないよう近くの安全な道路上へピカピカの同型車両を自動スポーン
        const dims = vc.getDimensions();
        const refX = focusPos.x;
        const refZ = focusPos.z;
        const camYaw = tpsCamera.getYaw();
        // プレイヤーの前方寄り 10m 付近の車道を優先探索し、プレイヤーの真上に重ならないよう保護
        respawnSearchPosScratch.set(
          refX + Math.sin(camYaw) * 10,
          0,
          refZ + Math.cos(camYaw) * 10,
        );
        let pose = findNearestSafeRoadPose(
          respawnSearchPosScratch.x,
          respawnSearchPosScratch.z,
          camYaw,
          dims.width,
          dims.length,
          vc.getId(),
          collisionWorld,
        );
        const distToPlayer = Math.hypot(pose.x - refX, pose.z - refZ);
        if (distToPlayer < 6.0) {
          pose = findNearestSafeRoadPose(
            pose.x + Math.sin(pose.yaw) * 12,
            pose.z + Math.cos(pose.yaw) * 12,
            pose.yaw,
            dims.width,
            dims.length,
            vc.getId(),
            collisionWorld,
          );
        }
        vc.repairAndRespawn(pose.x, pose.y, pose.z, pose.yaw, rainAmountNow);
        soundManager.playVehicleRecover();
        showVehicleAlert(
          `${vc.getDisplayName()} が近くの道路に復帰しました`,
          'success',
          3600,
        );
        modeOrPromptChanged = true;
      }
    }

    damageEffects.setWreckFireLight(bestFireX, bestFireY, bestFireZ, bestFireIntensity);
    damageEffects.update(dt, currentDpr);

    // 3-B: 交差点信号サイクル更新（青 -> 黄 -> 赤）
    trafficLights.update(dt);

    // 3-A / 3-B: AI 交通車両・AI 歩行者の相互連携更新（ゼロアロケーション）
    const footPlayerPos =
      controlMode === 'foot' && playerController ? playerPos : null;

    drivableObstacles.length = 0;
    for (let i = 0; i < vehicleControllers.length; i += 1) {
      const vc = vehicleControllers[i];
      vc.getPosition(tempVehiclePos);
      const dims = vc.getDimensions();
      const slot = drivableObstaclesPool[i];
      if (slot) {
        slot.id = vc.getId();
        slot.x = tempVehiclePos.x;
        slot.z = tempVehiclePos.z;
        slot.yaw = vc.getYaw();
        slot.halfW = dims.width * 0.5;
        slot.halfD = dims.length * 0.5;
        drivableObstacles.push(slot);
      }
    }

    pedestrianObstacles.length = 0;
    pedestrianManager.appendPedestrianObstacles(pedestrianObstacles);

    trafficManager.update(
      dt,
      footPlayerPos,
      drivableObstacles,
      pedestrianObstacles,
      trafficLights,
    );

    allVehicleObstacles.length = 0;
    for (let i = 0; i < drivableObstacles.length; i += 1) {
      allVehicleObstacles.push(drivableObstacles[i]);
    }
    trafficManager.appendVehicleObstacles(allVehicleObstacles);

    pedestrianManager.update(
      dt,
      footPlayerPos,
      allVehicleObstacles,
      trafficLights,
    );

    // 4-B: コイン収集 & タイムアタック更新（ゼロアロケーション）＋専用効果音連動
    const collectedCoins = coinSystem.update(
      dt,
      focusPos.x,
      focusPos.z,
      controlMode === 'vehicle',
    );
    if (collectedCoins > 0) {
      soundManager.playCoinCollect();
      modeOrPromptChanged = true;
    }

    const taEvent = timeAttackSystem.update(dt, focusPos.x, focusPos.z);
    if (taEvent !== 'none') {
      if (taEvent === 'start') {
        soundManager.playCheckpointPass(true);
      } else if (taEvent === 'checkpoint') {
        soundManager.playCheckpointPass(false);
      } else if (taEvent === 'goal_record') {
        soundManager.playTimeAttackGoal(true);
      } else if (taEvent === 'goal') {
        soundManager.playTimeAttackGoal(false);
      }
      modeOrPromptChanged = true;
    }

    // 3-G / 5-A: 天候・時間帯トランジション・雨粒・濡れた路面・街灯・信号・建物窓・車両ライト更新
    if (timeOfDayController) {
      weatherController?.update(dt, camera, timeOfDayController.getNightFactor());
      timeOfDayController.update(
        dt,
        camera.position,
        weatherController?.getLightingModifier() ?? null,
      );
      const nightFactor = timeOfDayController.getNightFactor();
      const headlightFactor = timeOfDayController.getHeadlightFactor();

      streetLights.setNightFactor(nightFactor);
      trafficLights.setNightFactor(nightFactor);
      cityBuilder.setNightFactor(nightFactor);
      expandedWorld.setNightFactor(nightFactor);
      japaneseProps.setNightFactor(nightFactor);
      g2Enhancements.setNightFactor(nightFactor);
      coinSystem.setNightFactor(nightFactor);
      trafficManager.setLightsIntensity(headlightFactor);
      for (let i = 0; i < vehicleControllers.length; i += 1) {
        vehicleControllers[i].setLightsIntensity(headlightFactor);
      }

      if (
        controlMode === 'vehicle' &&
        activeVehicle &&
        headlightFactor > 0.01
      ) {
        const spotMul = activeVehicle.getHeadlightSpotMultiplier();
        if (spotMul > 0.02) {
          const dims = activeVehicle.getDimensions();
          const isBike = activeVehicle.getType() === 'bike';
          const bodyGroup = activeVehicle.getBodyGroup();
          bodyGroup.updateMatrixWorld();

          headlightOriginScratch.set(
            0,
            isBike ? dims.height * 0.65 : dims.height * 0.45,
            isBike ? dims.length * 0.42 : dims.length * 0.49,
          );
          bodyGroup.localToWorld(headlightOriginScratch);

          headlightTargetScratch.set(
            0,
            0.25,
            dims.length * 0.5 + (isBike ? 22 : 28),
          );
          bodyGroup.localToWorld(headlightTargetScratch);

          playerHeadlightSpot.position.copy(headlightOriginScratch);
          playerHeadlightSpot.target.position.copy(headlightTargetScratch);
          playerHeadlightSpot.target.updateMatrixWorld();
          playerHeadlightSpot.intensity =
            headlightFactor * spotMul * (isBike ? 68 : 96);
        } else {
          playerHeadlightSpot.intensity = 0;
        }
      } else {
        playerHeadlightSpot.intensity = 0;
      }

      timeOfDayController.getSunOffset(sunOffsetScratch);
    }

    // リアルタイムシャドウカメラを操作対象（プレイヤーまたは運転中の車両）周囲へ追従させる
    dirLight.position.set(
      focusPos.x + sunOffsetScratch.x,
      focusPos.y + sunOffsetScratch.y,
      focusPos.z + sunOffsetScratch.z,
    );
    dirLight.target.position.copy(focusPos);
    dirLight.target.updateMatrixWorld();

    renderer.render(scene, camera);

    frameCount += 1;
    const fpsElapsed = now - lastFpsTime;
    if (fpsElapsed >= 500) {
      currentFps = Math.round((frameCount * 1000) / fpsElapsed);
      frameCount = 0;
      lastFpsTime = now;

      // M1 iPad Air 最適化: 負荷に応じた動的 DPR 調整 (0.75〜1.25、標準 1.0)
      if (now - lastDprAdjustTime >= 2500 && currentFps > 0) {
        const nativeCap = Math.min(
          window.devicePixelRatio || 1,
          RENDER_CONFIG.maxDpr,
        );
        if (currentFps < RENDER_CONFIG.targetFps - 2 && currentDpr > RENDER_CONFIG.minDpr) {
          currentDpr = Math.max(RENDER_CONFIG.minDpr, Number((currentDpr - 0.1).toFixed(2)));
          rendererBundle.setDpr(currentDpr);
          lastDprAdjustTime = now;
        } else if (
          currentFps >= RENDER_CONFIG.idealFps - 4 &&
          currentDpr < nativeCap
        ) {
          currentDpr = Math.min(nativeCap, Number((currentDpr + 0.05).toFixed(2)));
          rendererBundle.setDpr(currentDpr);
          lastDprAdjustTime = now;
        }
      }
    }

    const hudInterval = timeAttackSystem.isRunning()
      ? 75
      : controlMode === 'vehicle'
        ? 100
        : 250;
    if (modeOrPromptChanged || now - lastHudUpdateTime >= hudInterval) {
      lastHudUpdateTime = now;
      emitStatus();
    }
  };

  rafId = requestAnimationFrame(animate);

  const minimapTrafficScratch: TrafficObstacle[] = [];
  const minimapPosScratch = new THREE.Vector3();

  return {
    setTouchMove: (x: number, y: number) => {
      inputManager.setTouchMove(x, y);
    },
    addLookDelta: (dx: number, dy: number) => {
      inputManager.addLookDelta(dx, dy);
    },
    setTouchSprint: (active: boolean) => {
      inputManager.setTouchSprint(active);
    },
    triggerJump: () => {
      inputManager.triggerJump();
    },
    triggerInteract: () => {
      inputManager.triggerInteract();
    },
    setTouchVehicleSteer: (steer: number) => {
      inputManager.setTouchVehicleSteer(steer);
    },
    setTouchVehicleThrottle: (throttle: number) => {
      inputManager.setTouchVehicleThrottle(throttle);
    },
    setTouchVehicleBrake: (brake: number) => {
      inputManager.setTouchVehicleBrake(brake);
    },
    cycleVehicleSpeedMode: () => {
      if (controlMode !== 'vehicle' || !activeVehicle) {
        return null;
      }
      const next = activeVehicle.cycleSpeedMode();
      emitStatus();
      return next;
    },
    cycleTimeOfDay: () => {
      const next = timeOfDayController?.cycleMode() ?? 'day';
      emitStatus();
      return next;
    },
    cycleWeather: () => {
      const next = weatherController?.cycleMode() ?? 'sunny';
      soundManager.setRainActive(next === 'rain');
      emitStatus();
      return next;
    },
    respawnCoins: () => {
      const changed = coinSystem.respawnAll();
      if (changed) {
        soundManager.playVehicleRecover();
        emitStatus();
      }
    },
    abortTimeAttack: () => {
      timeAttackSystem.abort();
      emitStatus();
    },
    retryTimeAttack: () => {
      timeAttackSystem.resetForRetry();
      if (controlMode === 'vehicle' && activeVehicle) {
        const dims = activeVehicle.getDimensions();
        const ignoreId = activeVehicle.getId();
        let targetX: number = TIME_ATTACK_RETRY_POSE.x;
        let targetZ: number = TIME_ATTACK_RETRY_POSE.z;
        const clearRadius = Math.max(1.4, Math.max(dims.width, dims.length) * 0.45);
        const offsets: readonly number[] = [0, -6, 4, -12];
        for (const dz of offsets) {
          if (collisionWorld.isPointClear(targetX, targetZ + dz, clearRadius, ignoreId)) {
            targetZ = targetZ + dz;
            break;
          }
        }
        const groundY = Math.max(0, collisionWorld.getGroundHeight(targetX, targetZ));
        activeVehicle.repairAndRespawn(
          targetX,
          groundY,
          targetZ,
          TIME_ATTACK_RETRY_POSE.yaw,
          weatherController?.getRainAmount() ?? 0,
        );
        tpsCamera.alignBehind(TIME_ATTACK_RETRY_POSE.yaw);
      } else if (playerController) {
        const groundY = Math.max(
          0,
          collisionWorld.getGroundHeight(
            TIME_ATTACK_RETRY_POSE.x,
            TIME_ATTACK_RETRY_POSE.z,
          ),
        );
        playerController.teleportTo(
          TIME_ATTACK_RETRY_POSE.x,
          groundY,
          TIME_ATTACK_RETRY_POSE.z,
          TIME_ATTACK_RETRY_POSE.yaw,
        );
        playerController.getPosition(playerPos);
        tpsCamera.alignBehind(TIME_ATTACK_RETRY_POSE.yaw);
      }
      soundManager.playVehicleRecover();
      emitStatus();
    },
    dismissTimeAttackResult: () => {
      timeAttackSystem.dismissResult();
      emitStatus();
    },
    recoverActiveVehicle: () => {
      if (
        controlMode !== 'vehicle' ||
        !activeVehicle ||
        activeVehicle.isBurning() ||
        activeVehicle.isWrecked()
      ) {
        return false;
      }
      activeVehicle.getPosition(tempVehiclePos);
      const dims = activeVehicle.getDimensions();
      const pose = findNearestSafeRoadPose(
        tempVehiclePos.x,
        tempVehiclePos.z,
        activeVehicle.getYaw(),
        dims.width,
        dims.length,
        activeVehicle.getId(),
        collisionWorld,
      );
      activeVehicle.respawnAt(pose.x, pose.y, pose.z, pose.yaw);
      tpsCamera.alignBehind(pose.yaw);
      soundManager.playVehicleRecover();
      emitStatus();
      return true;
    },
    getMinimapSnapshot: (out: MinimapSnapshot) => {
      if (controlMode === 'vehicle' && activeVehicle) {
        activeVehicle.getPosition(minimapPosScratch);
        out.playerX = minimapPosScratch.x;
        out.playerZ = minimapPosScratch.z;
        out.playerYaw = activeVehicle.getYaw();
        out.isDriving = true;
      } else {
        out.playerX = playerPos.x;
        out.playerZ = playerPos.z;
        out.playerYaw = playerController ? playerController.getYaw() : 0;
        out.isDriving = false;
      }
      out.cameraYaw = tpsCamera.getYaw();

      const drivableLimit = Math.min(
        vehicleControllers.length,
        out.drivableVehicles.length,
      );
      out.drivableCount = drivableLimit;
      for (let i = 0; i < drivableLimit; i += 1) {
        const vc = vehicleControllers[i];
        vc.getPosition(minimapPosScratch);
        const slot = out.drivableVehicles[i];
        slot.id = vc.getId();
        slot.x = minimapPosScratch.x;
        slot.z = minimapPosScratch.z;
        slot.yaw = vc.getYaw();
        slot.isActive = vc === activeVehicle;
        slot.isWrecked = vc.isWrecked();
        slot.isBurning = vc.isBurning();
      }

      minimapTrafficScratch.length = 0;
      trafficManager.appendVehicleObstacles(minimapTrafficScratch);
      const trafficLimit = Math.min(
        minimapTrafficScratch.length,
        out.trafficVehicles.length,
      );
      out.trafficCount = trafficLimit;
      for (let i = 0; i < trafficLimit; i += 1) {
        const tv = minimapTrafficScratch[i];
        const slot = out.trafficVehicles[i];
        slot.id = tv.id;
        slot.x = tv.x;
        slot.z = tv.z;
        slot.yaw = tv.yaw;
        slot.isActive = false;
      }

      out.coinCount = coinSystem.fillMinimapCoins(out.coins, out.coins.length);
      out.timeAttackActive = timeAttackSystem.isRunning();
      timeAttackSystem.fillMinimapTarget(out.targetGate);
    },
    unlockAudio: () => {
      soundManager.unlock();
    },
    toggleAudioMute: () => soundManager.toggleMute(),
    dispose: () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      inputManager.dispose();
      soundManager.dispose();

      if (loadedPlayer) {
        loadedPlayer.root.removeFromParent();
        loadedPlayer.dispose();
        loadedPlayer = null;
      }
      playerController = null;

      damageEffects.dispose();
      coinSystem.dispose();
      timeAttackSystem.dispose();
      pedestrianManager.dispose();
      trafficManager.dispose();
      trafficLights.dispose();
      streetLights.dispose();
      weatherController?.dispose();
      weatherController = null;
      timeOfDayController?.dispose();
      timeOfDayController = null;
      scene.remove(playerHeadlightSpot);
      scene.remove(playerHeadlightSpot.target);

      for (const vcConfig of DRIVABLE_VEHICLES) {
        collisionWorld.removeCollider(vcConfig.id);
      }
      for (const v of loadedVehicles) {
        scene.remove(v.root);
        v.dispose();
      }
      loadedVehicles.length = 0;
      vehicleControllers.length = 0;
      drivableObstaclesPool.length = 0;
      activeVehicle = null;
      nearbyVehicle = null;

      g2bGrass.dispose();
      g2Enhancements.dispose();
      japaneseProps.dispose();
      expandedWorld.dispose();
      cityBuilder.dispose();
      cityEnv.dispose();
      rendererBundle.dispose();
      disposeLoaders();
    },
  };
}
