import * as THREE from 'three';
import type {
  PedestrianAccessoryLoadout,
  PedestrianRigKind,
} from './pedestrianCatalog';

interface SharedAccessoryGeometries {
  // キャップ帽
  capCrown: THREE.SphereGeometry;
  capVisor: THREE.CylinderGeometry;
  capButton: THREE.SphereGeometry;
  // ニット帽
  beanieDome: THREE.SphereGeometry;
  beanieCuff: THREE.TorusGeometry;
  beaniePom: THREE.SphereGeometry;
  // メガネ
  glassesRim: THREE.TorusGeometry;
  glassesLens: THREE.CircleGeometry;
  glassesBridge: THREE.BoxGeometry;
  glassesTemple: THREE.BoxGeometry;
  // リュックサック
  backpackBody: THREE.BoxGeometry;
  backpackTop: THREE.CylinderGeometry;
  backpackPocket: THREE.BoxGeometry;
  backpackStrap: THREE.TorusGeometry;
  // ショルダーバッグ
  shoulderStrap: THREE.TorusGeometry;
  shoulderBagBody: THREE.BoxGeometry;
  shoulderBagFlap: THREE.BoxGeometry;
  shoulderBagClasp: THREE.BoxGeometry;
}

let sharedGeos: SharedAccessoryGeometries | null = null;

function getSharedGeometries(): SharedAccessoryGeometries {
  if (sharedGeos) return sharedGeos;

  sharedGeos = {
    // キャップ帽（Quaternius 頭部半径 ~0.495 基準）
    capCrown: new THREE.SphereGeometry(0.57, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    capVisor: new THREE.CylinderGeometry(0.46, 0.5, 0.055, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
    capButton: new THREE.SphereGeometry(0.055, 8, 6),

    // ニット帽
    beanieDome: new THREE.SphereGeometry(0.575, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    beanieCuff: new THREE.TorusGeometry(0.545, 0.095, 8, 18),
    beaniePom: new THREE.SphereGeometry(0.115, 10, 8),

    // メガネ（Face: X∈[-0.37,0.37], Y≈0.48, Z≈0.505）
    glassesRim: new THREE.TorusGeometry(0.115, 0.018, 6, 14),
    glassesLens: new THREE.CircleGeometry(0.105, 12),
    glassesBridge: new THREE.BoxGeometry(0.12, 0.025, 0.025),
    glassesTemple: new THREE.BoxGeometry(0.022, 0.024, 0.46),

    // リュックサック（Torso back: Z≈-0.19, X∈[-0.48,0.48], Y∈[-0.17,0.52]）
    backpackBody: new THREE.BoxGeometry(0.6, 0.66, 0.28),
    backpackTop: new THREE.CylinderGeometry(0.14, 0.14, 0.6, 10),
    backpackPocket: new THREE.BoxGeometry(0.46, 0.26, 0.1),
    backpackStrap: new THREE.TorusGeometry(0.26, 0.042, 6, 14),

    // ショルダーバッグ
    shoulderStrap: new THREE.TorusGeometry(0.56, 0.036, 6, 20),
    shoulderBagBody: new THREE.BoxGeometry(0.16, 0.44, 0.42),
    shoulderBagFlap: new THREE.BoxGeometry(0.175, 0.18, 0.43),
    shoulderBagClasp: new THREE.BoxGeometry(0.04, 0.065, 0.075),
  };

  return sharedGeos;
}

function findBoneByNames(
  root: THREE.Object3D,
  candidateNames: readonly string[],
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    if (candidateNames.includes(obj.name)) {
      found = obj;
    }
  });
  return found;
}

export interface AttachedAccessoriesHandle {
  materials: THREE.Material[];
}

/**
 * 歩行者モデルの頭部・胴体ボーンへ軽量 3D 装着パーツ（帽子・メガネ・バッグ）をアタッチする。
 * - Quaternius リグ（Head / Torso, 身長基準 3.204）と Mixamo フォールバック（mixamorig:Head / mixamorig:Spine2, 身長基準 1.7）の両対応。
 * - ジオメトリは全歩行者で完全共有し、M1 iPad Air でも VRAM / ドロー負荷を最小限に抑える。
 */
export function attachPedestrianAccessories(
  clonedModel: THREE.Object3D,
  rigKind: PedestrianRigKind,
  loadout: PedestrianAccessoryLoadout,
  isChild: boolean,
): AttachedAccessoriesHandle {
  const createdMaterials: THREE.Material[] = [];
  const geos = getSharedGeometries();

  const headBone = findBoneByNames(
    clonedModel,
    rigKind === 'quaternius'
      ? ['Head']
      : ['mixamorig:Head', 'Head'],
  );
  const torsoBone = findBoneByNames(
    clonedModel,
    rigKind === 'quaternius'
      ? ['Torso', 'Chest', 'Abdomen']
      : ['mixamorig:Spine2', 'mixamorig:Spine1', 'Torso'],
  );

  // Mixamo (1.7m基準) vs Quaternius (3.204基準) のサイズ・オフセット補正係数
  const headUnitScale = rigKind === 'quaternius' ? 1.0 : 0.24;
  const torsoUnitScale = rigKind === 'quaternius' ? 1.0 : 0.44;
  const headBaseY = rigKind === 'quaternius' ? 0.0 : 0.02;
  const torsoBaseY = rigKind === 'quaternius' ? 0.0 : -0.02;

  const createMat = (
    color: number,
    roughness: number,
    metalness = 0.04,
    extra?: Partial<THREE.MeshStandardMaterialParameters>,
  ): THREE.MeshStandardMaterial => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      envMapIntensity: 0.75,
      ...extra,
    });
    createdMaterials.push(mat);
    return mat;
  };

  const configureMesh = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  };

  // 1. 頭部パーツ: キャップ帽 or ニット帽
  if (headBone && loadout.headwear !== 'none') {
    const headAnchor = new THREE.Group();
    headAnchor.name = `PedAccessory_${loadout.headwear}`;
    headAnchor.position.set(0, headBaseY, 0);
    headAnchor.scale.setScalar(headUnitScale);

    if (loadout.headwear === 'cap') {
      const capMat = createMat(loadout.headwearHex, 0.84, 0.02);
      const visorMat = createMat(
        new THREE.Color(loadout.headwearHex).multiplyScalar(0.84).getHex(),
        0.82,
        0.02,
      );

      const crown = configureMesh(new THREE.Mesh(geos.capCrown, capMat));
      crown.position.set(0, 0.62, -0.01);
      crown.scale.set(1.0, 0.86, 1.04);
      headAnchor.add(crown);

      const visor = configureMesh(new THREE.Mesh(geos.capVisor, visorMat));
      visor.position.set(0, 0.65, 0.41);
      visor.rotation.x = 0.14;
      visor.scale.set(1.02, 1.0, 1.18);
      headAnchor.add(visor);

      const btn = configureMesh(new THREE.Mesh(geos.capButton, visorMat));
      btn.position.set(0, 1.11, -0.01);
      headAnchor.add(btn);
    } else if (loadout.headwear === 'beanie') {
      const beanieMat = createMat(loadout.headwearHex, 0.92, 0.0);
      const cuffMat = createMat(
        new THREE.Color(loadout.headwearHex).multiplyScalar(0.86).getHex(),
        0.94,
        0.0,
      );

      const dome = configureMesh(new THREE.Mesh(geos.beanieDome, beanieMat));
      dome.position.set(0, 0.62, -0.02);
      dome.scale.set(1.0, 1.0, 1.03);
      headAnchor.add(dome);

      const cuff = configureMesh(new THREE.Mesh(geos.beanieCuff, cuffMat));
      cuff.position.set(0, 0.64, -0.02);
      cuff.rotation.x = Math.PI * 0.5;
      cuff.scale.set(1.02, 1.04, 1.25);
      headAnchor.add(cuff);

      const pom = configureMesh(new THREE.Mesh(geos.beaniePom, cuffMat));
      pom.position.set(0, 1.23, -0.03);
      headAnchor.add(pom);
    }

    headBone.add(headAnchor);
  }

  // 2. 顔パーツ: メガネ
  if (headBone && loadout.glasses) {
    const glassesAnchor = new THREE.Group();
    glassesAnchor.name = 'PedAccessory_glasses';
    glassesAnchor.position.set(0, headBaseY, 0);
    glassesAnchor.scale.setScalar(headUnitScale);

    const frameMat = createMat(loadout.glassesHex, 0.35, 0.42);
    const lensMat = createMat(0x233042, 0.12, 0.18, {
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
    });

    const eyeY = 0.48;
    const faceZ = 0.515;
    const eyeOffsetX = 0.175;

    for (const sign of [-1, 1] as const) {
      const rim = configureMesh(new THREE.Mesh(geos.glassesRim, frameMat));
      rim.position.set(sign * eyeOffsetX, eyeY, faceZ);
      glassesAnchor.add(rim);

      const lens = configureMesh(new THREE.Mesh(geos.glassesLens, lensMat));
      lens.position.set(sign * eyeOffsetX, eyeY, faceZ - 0.004);
      glassesAnchor.add(lens);

      const temple = configureMesh(new THREE.Mesh(geos.glassesTemple, frameMat));
      temple.position.set(sign * 0.46, eyeY + 0.02, faceZ - 0.25);
      temple.rotation.y = sign * -0.18;
      glassesAnchor.add(temple);
    }

    const bridge = configureMesh(new THREE.Mesh(geos.glassesBridge, frameMat));
    bridge.position.set(0, eyeY + 0.02, faceZ);
    glassesAnchor.add(bridge);

    headBone.add(glassesAnchor);
  }

  // 3. 背中・肩パーツ: リュックサック or ショルダーバッグ
  if (torsoBone && loadout.bag !== 'none') {
    const bagAnchor = new THREE.Group();
    bagAnchor.name = `PedAccessory_${loadout.bag}`;
    bagAnchor.position.set(0, torsoBaseY, 0);
    bagAnchor.scale.setScalar(torsoUnitScale);

    if (loadout.bag === 'backpack') {
      const mainMat = createMat(loadout.bagHex, 0.82, 0.04);
      const trimMat = createMat(
        new THREE.Color(loadout.bagHex).multiplyScalar(0.75).getHex(),
        0.78,
        0.08,
      );
      const strapMat = createMat(0x23252a, 0.88, 0.02);

      // 小学生はやや箱型ランドセル寄りのシルエット、大人はデイパックシルエット
      const packScaleY = isChild ? 0.94 : 1.04;
      const packScaleZ = isChild ? 1.05 : 1.0;

      const body = configureMesh(new THREE.Mesh(geos.backpackBody, mainMat));
      body.position.set(0, 0.14, -0.34);
      body.scale.set(1.0, packScaleY, packScaleZ);
      bagAnchor.add(body);

      const topRoll = configureMesh(new THREE.Mesh(geos.backpackTop, mainMat));
      topRoll.position.set(0, 0.14 + 0.33 * packScaleY, -0.34);
      topRoll.rotation.z = Math.PI * 0.5;
      topRoll.scale.set(packScaleZ, 1.0, 0.85);
      bagAnchor.add(topRoll);

      const pocket = configureMesh(new THREE.Mesh(geos.backpackPocket, trimMat));
      pocket.position.set(0, 0.01, -0.49 * packScaleZ);
      bagAnchor.add(pocket);

      for (const sign of [-1, 1] as const) {
        const strap = configureMesh(new THREE.Mesh(geos.backpackStrap, strapMat));
        strap.position.set(sign * 0.25, 0.24, -0.02);
        strap.rotation.y = Math.PI * 0.5;
        strap.scale.set(1.12, 1.28, 0.72);
        bagAnchor.add(strap);
      }
    } else if (loadout.bag === 'shoulder_bag') {
      const bagMat = createMat(loadout.bagHex, 0.74, 0.08);
      const flapMat = createMat(
        new THREE.Color(loadout.bagHex).multiplyScalar(0.84).getHex(),
        0.7,
        0.08,
      );
      const claspMat = createMat(0xc8b27a, 0.32, 0.72);

      // 左肩から右腰へ斜め掛けするクロスボディストラップ
      const strap = configureMesh(new THREE.Mesh(geos.shoulderStrap, flapMat));
      strap.position.set(-0.04, 0.14, 0.03);
      strap.rotation.z = -0.68;
      strap.rotation.y = 0.08;
      strap.scale.set(0.95, 1.06, 0.54);
      bagAnchor.add(strap);

      // 右腰横のメッセンジャー/ショルダーバッグ本体
      const bagBody = configureMesh(new THREE.Mesh(geos.shoulderBagBody, bagMat));
      bagBody.position.set(-0.56, -0.24, -0.03);
      bagBody.rotation.z = 0.12;
      bagAnchor.add(bagBody);

      const flap = configureMesh(new THREE.Mesh(geos.shoulderBagFlap, flapMat));
      flap.position.set(-0.57, -0.09, -0.03);
      flap.rotation.z = 0.12;
      bagAnchor.add(flap);

      const clasp = configureMesh(new THREE.Mesh(geos.shoulderBagClasp, claspMat));
      clasp.position.set(-0.66, -0.17, -0.03);
      bagAnchor.add(clasp);
    }

    torsoBone.add(bagAnchor);
  }

  return { materials: createdMaterials };
}
