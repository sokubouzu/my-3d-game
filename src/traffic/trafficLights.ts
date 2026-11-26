import * as THREE from 'three';
import { CITY_METRICS, type CollisionWorld } from '../world/collisionWorld';

export type TrafficAxis = 'NS' | 'EW';
export type SignalColor = 'green' | 'yellow' | 'red';
export type PedSignalState = 'green' | 'blink' | 'red';

export interface TrafficLightSnapshot {
  nsVehicle: SignalColor;
  ewVehicle: SignalColor;
  nsPedestrian: PedSignalState;
  ewPedestrian: PedSignalState;
  phaseRemainingSec: number;
}

const GREEN_DURATION_SEC = 15.0;
const PED_BLINK_BEFORE_YELLOW_SEC = 3.0;
const YELLOW_DURATION_SEC = 3.0;
const ALL_RED_DURATION_SEC = 1.5;

const HALF_CYCLE_SEC =
  GREEN_DURATION_SEC + YELLOW_DURATION_SEC + ALL_RED_DURATION_SEC; // 19.5s
const FULL_CYCLE_SEC = HALF_CYCLE_SEC * 2; // 39.0s

const LIT_GREEN_COLOR = new THREE.Color(0x00e896);
const LIT_YELLOW_COLOR = new THREE.Color(0xffbe0b);
const LIT_RED_COLOR = new THREE.Color(0xff2e3b);
const UNLIT_LENS_COLOR = new THREE.Color(0x1b1e22);
const UNLIT_EMISSIVE = new THREE.Color(0x000000);

interface VehicleSignalMaterials {
  green: THREE.MeshStandardMaterial;
  yellow: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
}

interface PedSignalMaterials {
  green: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
}

/**
 * 3-B: 日本式交差点信号機モデル（4隅の支柱・車道張り出しアーム・横型3灯車両信号・縦型2灯歩行者信号）
 * および 青(15s) -> 黄(3s) -> 全赤(1.5s) -> 赤(19.5s) の信号サイクル制御。
 */
export class TrafficLightController {
  private readonly scene: THREE.Scene;
  private readonly collisionWorld: CollisionWorld;
  private readonly root: THREE.Group;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly poleColliderIds: string[] = [];

  private readonly nsVehMats: VehicleSignalMaterials;
  private readonly ewVehMats: VehicleSignalMaterials;
  private readonly nsPedMats: PedSignalMaterials;
  private readonly ewPedMats: PedSignalMaterials;

  private cycleTime = 0;
  private nsVehicle: SignalColor = 'green';
  private ewVehicle: SignalColor = 'red';
  private nsPedestrian: PedSignalState = 'green';
  private ewPedestrian: PedSignalState = 'red';
  private phaseRemainingSec = GREEN_DURATION_SEC;
  private lastAppliedKey = '';

  constructor(scene: THREE.Scene, collisionWorld: CollisionWorld) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.root = new THREE.Group();
    this.root.name = 'JapaneseTrafficLights';

    this.nsVehMats = this.createVehicleMaterials();
    this.ewVehMats = this.createVehicleMaterials();
    this.nsPedMats = this.createPedMaterials();
    this.ewPedMats = this.createPedMaterials();

    this.buildIntersectionPoles();
    this.scene.add(this.root);

    this.updateSignals(0);
  }

  public update(dt: number): void {
    if (dt <= 0) return;
    this.cycleTime = (this.cycleTime + dt) % FULL_CYCLE_SEC;
    this.updateSignals(this.cycleTime);
  }

  public getVehicleSignal(axis: TrafficAxis): SignalColor {
    return axis === 'NS' ? this.nsVehicle : this.ewVehicle;
  }

  public getPedestrianSignal(axis: TrafficAxis): PedSignalState {
    return axis === 'NS' ? this.nsPedestrian : this.ewPedestrian;
  }

  /**
   * 横断歩道へ新規進入してよいか（青点灯中のみ許可、点滅中・赤は待機）。
   */
  public canPedestrianStartCrossing(axis: TrafficAxis): boolean {
    return this.getPedestrianSignal(axis) === 'green';
  }

  public getSnapshot(): TrafficLightSnapshot {
    return {
      nsVehicle: this.nsVehicle,
      ewVehicle: this.ewVehicle,
      nsPedestrian: this.nsPedestrian,
      ewPedestrian: this.ewPedestrian,
      phaseRemainingSec: this.phaseRemainingSec,
    };
  }

  public getHudLabel(): string {
    const ns =
      this.nsVehicle === 'green' ? '青' : this.nsVehicle === 'yellow' ? '黄' : '赤';
    const ew =
      this.ewVehicle === 'green' ? '青' : this.ewVehicle === 'yellow' ? '黄' : '赤';
    return `南北:${ns} / 東西:${ew} (${Math.ceil(this.phaseRemainingSec)}s)`;
  }

  private updateSignals(t: number): void {
    if (t < GREEN_DURATION_SEC) {
      this.nsVehicle = 'green';
      this.ewVehicle = 'red';
      this.phaseRemainingSec = GREEN_DURATION_SEC - t;
      this.nsPedestrian =
        this.phaseRemainingSec <= PED_BLINK_BEFORE_YELLOW_SEC ? 'blink' : 'green';
      this.ewPedestrian = 'red';
    } else if (t < GREEN_DURATION_SEC + YELLOW_DURATION_SEC) {
      this.nsVehicle = 'yellow';
      this.ewVehicle = 'red';
      this.nsPedestrian = 'red';
      this.ewPedestrian = 'red';
      this.phaseRemainingSec = GREEN_DURATION_SEC + YELLOW_DURATION_SEC - t;
    } else if (t < HALF_CYCLE_SEC) {
      this.nsVehicle = 'red';
      this.ewVehicle = 'red';
      this.nsPedestrian = 'red';
      this.ewPedestrian = 'red';
      this.phaseRemainingSec = HALF_CYCLE_SEC - t;
    } else if (t < HALF_CYCLE_SEC + GREEN_DURATION_SEC) {
      this.nsVehicle = 'red';
      this.ewVehicle = 'green';
      this.phaseRemainingSec = HALF_CYCLE_SEC + GREEN_DURATION_SEC - t;
      this.nsPedestrian = 'red';
      this.ewPedestrian =
        this.phaseRemainingSec <= PED_BLINK_BEFORE_YELLOW_SEC ? 'blink' : 'green';
    } else if (t < HALF_CYCLE_SEC + GREEN_DURATION_SEC + YELLOW_DURATION_SEC) {
      this.nsVehicle = 'red';
      this.ewVehicle = 'yellow';
      this.nsPedestrian = 'red';
      this.ewPedestrian = 'red';
      this.phaseRemainingSec =
        HALF_CYCLE_SEC + GREEN_DURATION_SEC + YELLOW_DURATION_SEC - t;
    } else {
      this.nsVehicle = 'red';
      this.ewVehicle = 'red';
      this.nsPedestrian = 'red';
      this.ewPedestrian = 'red';
      this.phaseRemainingSec = FULL_CYCLE_SEC - t;
    }

    const blinkOn = Math.floor(t * 2.5) % 2 === 0;
    const key = `${this.nsVehicle}|${this.ewVehicle}|${this.nsPedestrian}|${this.ewPedestrian}|${blinkOn ? 1 : 0}`;
    if (key === this.lastAppliedKey) return;
    this.lastAppliedKey = key;

    this.applyVehicleMaterials(this.nsVehMats, this.nsVehicle);
    this.applyVehicleMaterials(this.ewVehMats, this.ewVehicle);
    this.applyPedMaterials(this.nsPedMats, this.nsPedestrian, blinkOn);
    this.applyPedMaterials(this.ewPedMats, this.ewPedestrian, blinkOn);
  }

  private applyVehicleMaterials(
    mats: VehicleSignalMaterials,
    color: SignalColor,
  ): void {
    setLensState(mats.green, color === 'green', LIT_GREEN_COLOR);
    setLensState(mats.yellow, color === 'yellow', LIT_YELLOW_COLOR);
    setLensState(mats.red, color === 'red', LIT_RED_COLOR);
  }

  private applyPedMaterials(
    mats: PedSignalMaterials,
    state: PedSignalState,
    blinkOn: boolean,
  ): void {
    const greenLit = state === 'green' || (state === 'blink' && blinkOn);
    const redLit = state === 'red';
    setLensState(mats.green, greenLit, LIT_GREEN_COLOR);
    setLensState(mats.red, redLit, LIT_RED_COLOR);
  }

  private createVehicleMaterials(): VehicleSignalMaterials {
    const makeLens = () => {
      const mat = new THREE.MeshStandardMaterial({
        color: UNLIT_LENS_COLOR.clone(),
        emissive: UNLIT_EMISSIVE.clone(),
        emissiveIntensity: 0,
        roughness: 0.22,
        metalness: 0.08,
      });
      this.materials.push(mat);
      return mat;
    };
    return {
      green: makeLens(),
      yellow: makeLens(),
      red: makeLens(),
    };
  }

  private createPedMaterials(): PedSignalMaterials {
    const makeLens = () => {
      const mat = new THREE.MeshStandardMaterial({
        color: UNLIT_LENS_COLOR.clone(),
        emissive: UNLIT_EMISSIVE.clone(),
        emissiveIntensity: 0,
        roughness: 0.25,
        metalness: 0.06,
      });
      this.materials.push(mat);
      return mat;
    };
    return {
      green: makeLens(),
      red: makeLens(),
    };
  }

  private buildIntersectionPoles(): void {
    // 共有マテリアル（日本式亜鉛メッキ支柱・グレー灯器ボディ・暗色庇）
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x8d959e,
      roughness: 0.42,
      metalness: 0.65,
    });
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0xc2c7cc,
      roughness: 0.48,
      metalness: 0.25,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2f35,
      roughness: 0.65,
      metalness: 0.2,
    });
    const controlBoxMat = new THREE.MeshStandardMaterial({
      color: 0xd6d9dc,
      roughness: 0.55,
      metalness: 0.18,
    });
    this.materials.push(poleMat, housingMat, visorMat, controlBoxMat);

    // 共有ジオメトリ（M1 iPad Air 最適化）
    const poleH = 5.6;
    const poleGeo = new THREE.CylinderGeometry(0.085, 0.11, poleH, 12);
    const baseFlangeGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.14, 12);
    const armLen = 3.5;
    const armGeo = new THREE.CylinderGeometry(0.055, 0.065, armLen, 10);
    const braceGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.35, 8);
    const vehHousingGeo = new THREE.BoxGeometry(1.22, 0.42, 0.28);
    const vehFaceGeo = new THREE.BoxGeometry(1.14, 0.34, 0.04);
    const vehLensGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.04, 16);
    const vehVisorGeo = new THREE.CylinderGeometry(
      0.142,
      0.142,
      0.24,
      14,
      1,
      true,
      Math.PI * 0.4,
      Math.PI * 1.2,
    );
    const pedHousingGeo = new THREE.BoxGeometry(0.32, 0.68, 0.22);
    const pedLensGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.035, 14);
    const pedVisorGeo = new THREE.CylinderGeometry(
      0.11,
      0.11,
      0.16,
      12,
      1,
      true,
      Math.PI * 0.45,
      Math.PI * 1.1,
    );
    const boxGeo = new THREE.BoxGeometry(0.24, 0.44, 0.18);

    this.geometries.push(
      poleGeo,
      baseFlangeGeo,
      armGeo,
      braceGeo,
      vehHousingGeo,
      vehFaceGeo,
      vehLensGeo,
      vehVisorGeo,
      pedHousingGeo,
      pedLensGeo,
      pedVisorGeo,
      boxGeo,
    );

    const buildVehicleHead = (mats: VehicleSignalMaterials): THREE.Group => {
      const head = new THREE.Group();

      const body = new THREE.Mesh(vehHousingGeo, housingMat);
      head.add(body);

      const face = new THREE.Mesh(vehFaceGeo, visorMat);
      face.position.z = 0.135;
      head.add(face);

      // 日本式横型3灯: +Z正面から見る運転手視点で左から 青 (+0.36) / 黄 (0) / 赤 (-0.36)
      const lensSpecs: ReadonlyArray<[number, THREE.MeshStandardMaterial]> = [
        [0.36, mats.green],
        [0, mats.yellow],
        [-0.36, mats.red],
      ];

      for (const [lx, mat] of lensSpecs) {
        const lens = new THREE.Mesh(vehLensGeo, mat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(lx, 0, 0.155);
        head.add(lens);

        const visor = new THREE.Mesh(vehVisorGeo, visorMat);
        visor.rotation.x = Math.PI / 2;
        visor.position.set(lx, 0.015, 0.24);
        head.add(visor);
      }

      return head;
    };

    const buildPedHead = (mats: PedSignalMaterials): THREE.Group => {
      const head = new THREE.Group();

      const body = new THREE.Mesh(pedHousingGeo, housingMat);
      head.add(body);

      // 歩行者用縦2灯: 上=赤 (+0.15), 下=青 (-0.15)
      const specs: ReadonlyArray<[number, THREE.MeshStandardMaterial]> = [
        [0.15, mats.red],
        [-0.15, mats.green],
      ];
      for (const [ly, mat] of specs) {
        const lens = new THREE.Mesh(pedLensGeo, mat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, ly, 0.115);
        head.add(lens);

        const visor = new THREE.Mesh(pedVisorGeo, visorMat);
        visor.rotation.x = Math.PI / 2;
        visor.position.set(0, ly + 0.01, 0.18);
        head.add(visor);
      }
      return head;
    };

    /**
     * 日本の左側通行交差点 4 隅配置:
     * - SE (+6.7, +6.7): N_IN (南下 +Z) 用 -> 腕を -X へ張り出し、灯器を北 (-Z, yaw=PI) 向き
     * - NW (-6.7, -6.7): S_IN (北上 -Z) 用 -> 腕を +X へ張り出し、灯器を南 (+Z, yaw=0) 向き
     * - NE (+6.7, -6.7): W_IN (東進 +X) 用 -> 腕を +Z へ張り出し、灯器を西 (-X, yaw=-PI/2) 向き
     * - SW (-6.7, +6.7): E_IN (西進 -X) 用 -> 腕を -Z へ張り出し、灯器を東 (+X, yaw=+PI/2) 向き
     */
    const poleSpecs: ReadonlyArray<{
      id: string;
      x: number;
      z: number;
      yaw: number;
      axis: TrafficAxis;
      pedYawNS: number;
      pedYawEW: number;
    }> = [
      {
        id: 'traffic_light_pole_se',
        x: 6.7,
        z: 6.7,
        yaw: Math.PI, // ローカル +Z = 北 (-Z), ローカル +X = 西 (-X) -> アーム +X で車道側へ張り出し
        axis: 'NS',
        pedYawNS: Math.PI, // 南北横断歩道 (東側 x=+8.4) を北から渡る人向け
        pedYawEW: -Math.PI / 2, // 東西横断歩道 (南側 z=+8.4) を西から渡る人向け
      },
      {
        id: 'traffic_light_pole_nw',
        x: -6.7,
        z: -6.7,
        yaw: 0, // ローカル +Z = 南 (+Z), ローカル +X = 東 (+X)
        axis: 'NS',
        pedYawNS: 0,
        pedYawEW: Math.PI / 2,
      },
      {
        id: 'traffic_light_pole_ne',
        x: 6.7,
        z: -6.7,
        yaw: -Math.PI / 2, // ローカル +Z = 西 (-X), ローカル +X = 南 (+Z)
        axis: 'EW',
        pedYawNS: 0,
        pedYawEW: -Math.PI / 2,
      },
      {
        id: 'traffic_light_pole_sw',
        x: -6.7,
        z: 6.7,
        yaw: Math.PI / 2, // ローカル +Z = 東 (+X), ローカル +X = 北 (-Z)
        axis: 'EW',
        pedYawNS: Math.PI,
        pedYawEW: Math.PI / 2,
      },
    ];

    const baseY = CITY_METRICS.sidewalkHeight;

    for (const spec of poleSpecs) {
      const poleGroup = new THREE.Group();
      poleGroup.name = spec.id;
      poleGroup.position.set(spec.x, baseY, spec.z);

      // 1. 垂直支柱＋ベースフランジ
      const poleMesh = new THREE.Mesh(poleGeo, poleMat);
      poleMesh.position.y = poleH * 0.5;
      poleMesh.receiveShadow = true;
      poleGroup.add(poleMesh);

      const flangeMesh = new THREE.Mesh(baseFlangeGeo, poleMat);
      flangeMesh.position.y = 0.07;
      poleGroup.add(flangeMesh);

      // 2. 車両信号アーム＋横型3灯ヘッド (ローカル +X へ張り出し、+Z が正面)
      const armPivot = new THREE.Group();
      armPivot.rotation.y = spec.yaw;
      poleGroup.add(armPivot);

      const armMesh = new THREE.Mesh(armGeo, poleMat);
      armMesh.rotation.z = Math.PI / 2;
      armMesh.position.set(armLen * 0.5, 5.15, 0);
      armPivot.add(armMesh);

      const braceMesh = new THREE.Mesh(braceGeo, poleMat);
      braceMesh.rotation.z = -Math.PI / 3;
      braceMesh.position.set(0.6, 4.78, 0);
      armPivot.add(braceMesh);

      const vehHead = buildVehicleHead(
        spec.axis === 'NS' ? this.nsVehMats : this.ewVehMats,
      );
      vehHead.position.set(armLen - 0.55, 5.15, 0.16);
      armPivot.add(vehHead);

      // 制御ボックス
      const ctrlBox = new THREE.Mesh(boxGeo, controlBoxMat);
      ctrlBox.position.set(-0.18, 1.55, 0);
      armPivot.add(ctrlBox);

      // 3. 歩行者用信号機（南北横断用・東西横断用の2基を高さ 2.95m に設置）
      const pedNS = buildPedHead(this.nsPedMats);
      pedNS.rotation.y = spec.pedYawNS;
      pedNS.position.set(
        Math.sin(spec.pedYawNS) * 0.24,
        2.95,
        Math.cos(spec.pedYawNS) * 0.24,
      );
      poleGroup.add(pedNS);

      const pedEW = buildPedHead(this.ewPedMats);
      pedEW.rotation.y = spec.pedYawEW;
      pedEW.position.set(
        Math.sin(spec.pedYawEW) * 0.24,
        2.95,
        Math.cos(spec.pedYawEW) * 0.24,
      );
      poleGroup.add(pedEW);

      this.root.add(poleGroup);

      // 支柱の当たり判定登録（人や車が支柱をすり抜けないように）
      this.collisionWorld.upsertCollider(
        spec.id,
        spec.x,
        spec.z,
        0.38,
        0.38,
        0,
        baseY,
        baseY + poleH,
      );
      this.poleColliderIds.push(spec.id);
    }
  }

  public dispose(): void {
    for (const id of this.poleColliderIds) {
      this.collisionWorld.removeCollider(id);
    }
    this.poleColliderIds.length = 0;
    this.scene.remove(this.root);
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}

function setLensState(
  mat: THREE.MeshStandardMaterial,
  lit: boolean,
  litColor: THREE.Color,
): void {
  if (lit) {
    mat.color.copy(litColor);
    mat.emissive.copy(litColor);
    mat.emissiveIntensity = 2.4;
  } else {
    mat.color.copy(UNLIT_LENS_COLOR);
    mat.emissive.copy(UNLIT_EMISSIVE);
    mat.emissiveIntensity = 0;
  }
}
