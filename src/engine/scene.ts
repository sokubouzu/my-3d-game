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
import {
  DRIVABLE_VEHICLES,
  VehicleController,
  loadHeroVehicle,
  type DriveSpeedMode,
  type LoadedHeroVehicle,
  type VehicleGear,
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
  nearbyVehicleName: string | null;
  vehicleSpeedKmh: number;
  vehicleGear: VehicleGear;
  vehicleSpeedMode: DriveSpeedMode;
  vehicleSpeedLimitKmh: number;
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
    260,
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
      nearbyVehicleName: nearbyVehicle?.getDisplayName() ?? null,
      vehicleSpeedKmh: vehicleTelemetry?.speedKmh ?? 0,
      vehicleGear: vehicleTelemetry?.gear ?? 'P',
      vehicleSpeedMode: vehicleTelemetry?.speedMode ?? 'CITY',
      vehicleSpeedLimitKmh: vehicleTelemetry?.speedLimitKmh ?? 45,
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
    });
  };

  // 1-E: Poly Haven 1K PBR (asphalt_01 / concrete_pavement / HDRI) + 日本の街区地面・交差点
  const cityEnv = createCityEnvironment(scene, renderer, (nextEnvStatus) => {
    envStatus = nextEnvStatus;
    emitStatus();
  });

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
  );

  // 2-A / 2-B / 2-C: 運転可能な全車両（Innova + Porsche 911 Turbo）をロード＆ OBB コライダー・VehicleController 構築
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
        vehicleControllers.push(new VehicleController(vehicle, collisionWorld));
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

      // 3-D: 乗車中サウンド（エンジン音・走行音・急ブレーキスキッド音・衝突音）
      const vSpeedMs = activeVehicle.getSpeed();
      vehicleAudioFrame.isDriving = true;
      vehicleAudioFrame.speedKmh = Math.abs(vSpeedMs) * 3.6;
      vehicleAudioFrame.maxSpeedKmh = activeVehicle.getMaxForwardSpeedKmh();
      vehicleAudioFrame.throttle = input.vehicleThrottle;
      vehicleAudioFrame.brake = input.vehicleBrake;
      vehicleAudioFrame.handbrake = input.vehicleHandbrake;
      vehicleAudioFrame.isReversing = vSpeedMs < -0.15;
      vehicleAudioFrame.profile = activeVehicle.getAudioProfile();
      soundManager.updateVehicleAudio(vehicleAudioFrame);
      soundManager.updateFootsteps(dt, false, 0, false);

      const impactSpeed = activeVehicle.consumeImpactSpeed();
      if (impactSpeed > 0) {
        soundManager.playVehicleImpact(impactSpeed);
      }
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

    // リアルタイムシャドウカメラを操作対象（プレイヤーまたは運転中の車両）周囲へ追従させる
    dirLight.position.set(focusPos.x + 18, focusPos.y + 30, focusPos.z + 14);
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

    const hudInterval = controlMode === 'vehicle' ? 100 : 250;
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

      pedestrianManager.dispose();
      trafficManager.dispose();
      trafficLights.dispose();

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

      cityBuilder.dispose();
      cityEnv.dispose();
      rendererBundle.dispose();
      disposeLoaders();
    },
  };
}
