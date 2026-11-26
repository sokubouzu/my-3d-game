/**
 * 4-B: CC0 マルチキャラクター歩行者カタログおよび個体差（年齢層・体型・カラー・アクセサリー・歩調）定義。
 *
 * 使用モデル: Quaternius "Ultimate Animated Character Pack" (CC0 1.0 Universal / Public Domain)
 * 格納先: public/assets/pedestrians/*.glb
 */

export type PedestrianRigKind = 'quaternius' | 'mixamo';

export type PedestrianAgeGroup = 'adult' | 'child';

export type PedestrianBuildKind = 'child' | 'slim' | 'standard' | 'stocky';

export type PedestrianHeadwearKind = 'none' | 'cap' | 'beanie';

export type PedestrianBagKind = 'none' | 'backpack' | 'shoulder_bag';

export interface PedestrianModelSpec {
  id: string;
  label: string;
  url: string;
  rigKind: PedestrianRigKind;
  gender: 'female' | 'male';
  style: 'casual' | 'business' | 'classy' | 'worker';
  /** 帽子を含まない素体の基準モデル高さ（帽子付きモデルで背が縮まないよう統一） */
  referenceBodyHeight: number;
  /** モデル自体が帽子・ヘルメットを内蔵しているか */
  hasBuiltInHat: boolean;
  /** 小学生サイズ（125〜135cm）として起用可能か */
  canBeChild: boolean;
}

export interface PedestrianWardrobePalette {
  label: string;
  styles: readonly ('casual' | 'business' | 'classy' | 'worker' | 'child')[];
  topHex: number;
  bottomHex: number;
  accentHex: number;
  /** 上着のカラー適用強度（Mixamo フォールバック用） */
  topStrength: number;
  /** ボトムスのカラー適用強度（Mixamo フォールバック用） */
  bottomStrength: number;
  /** 髪色のカラー適用強度（Mixamo フォールバック用） */
  hairStrength: number;
}

export interface PedestrianAccessoryLoadout {
  headwear: PedestrianHeadwearKind;
  headwearHex: number;
  glasses: boolean;
  glassesHex: number;
  bag: PedestrianBagKind;
  bagHex: number;
  bagAccentHex: number;
}

export interface PedestrianVariation {
  modelSpec: PedestrianModelSpec;
  ageGroup: PedestrianAgeGroup;
  buildKind: PedestrianBuildKind;
  heightMeters: number;
  widthScale: number;
  depthScale: number;
  skinHex: number;
  hairHex: number;
  wardrobe: PedestrianWardrobePalette;
  accessories: PedestrianAccessoryLoadout;
  /** 歩行速度の個体差倍率 (0.86..1.16) */
  speedFactor: number;
  /** 腕振り・歩調テンポの個体差倍率 (0.88..1.28) */
  cadenceFactor: number;
  /** 腕振り幅の個体差 (-0.12..+0.16 rad) */
  armSwingDelta: number;
}

/**
 * Quaternius Ultimate Animated Character Pack (CC0 1.0) の都市向け8モデル。
 * すべて Idle / Walk / Run クリップ内蔵・In-Place・+Z正面・テクスチャ画像0枚（低VRAM）。
 */
export const PEDESTRIAN_MODEL_SPECS: readonly PedestrianModelSpec[] = [
  {
    id: 'casual_female',
    label: 'Casual Female 1',
    url: './assets/pedestrians/casual_female.glb',
    rigKind: 'quaternius',
    gender: 'female',
    style: 'casual',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: true,
  },
  {
    id: 'casual2_female',
    label: 'Casual Female 2',
    url: './assets/pedestrians/casual2_female.glb',
    rigKind: 'quaternius',
    gender: 'female',
    style: 'casual',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: true,
  },
  {
    id: 'suit_female',
    label: 'Suit Female',
    url: './assets/pedestrians/suit_female.glb',
    rigKind: 'quaternius',
    gender: 'female',
    style: 'business',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: false,
  },
  {
    id: 'old_classy_female',
    label: 'Classy Senior Female',
    url: './assets/pedestrians/old_classy_female.glb',
    rigKind: 'quaternius',
    gender: 'female',
    style: 'classy',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: true,
    canBeChild: false,
  },
  {
    id: 'casual_male',
    label: 'Casual Male 1',
    url: './assets/pedestrians/casual_male.glb',
    rigKind: 'quaternius',
    gender: 'male',
    style: 'casual',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: true,
  },
  {
    id: 'casual2_male',
    label: 'Casual Male 2',
    url: './assets/pedestrians/casual2_male.glb',
    rigKind: 'quaternius',
    gender: 'male',
    style: 'casual',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: true,
  },
  {
    id: 'suit_male',
    label: 'Suit Male',
    url: './assets/pedestrians/suit_male.glb',
    rigKind: 'quaternius',
    gender: 'male',
    style: 'business',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: false,
    canBeChild: false,
  },
  {
    id: 'worker_male',
    label: 'Worker Male',
    url: './assets/pedestrians/worker_male.glb',
    rigKind: 'quaternius',
    gender: 'male',
    style: 'worker',
    referenceBodyHeight: 3.204,
    hasBuiltInHat: true,
    canBeChild: false,
  },
];

export const FALLBACK_MIXAMO_MODEL_SPEC: PedestrianModelSpec = {
  id: 'player_fallback',
  label: 'Fallback Mixamo Human',
  url: './assets/characters/player.glb',
  rigKind: 'mixamo',
  gender: 'male',
  style: 'casual',
  referenceBodyHeight: 1.7,
  hasBuiltInHat: false,
  canBeChild: true,
};

/** 肌色バリエーション（自然な6トーン） */
export const PEDESTRIAN_SKIN_PALETTE: readonly number[] = [
  0xf6d5bd, // 明るめフェア肌
  0xefc5a4, // 標準アジア系肌
  0xe4b48e, // 健康的な肌色
  0xd59f76, // 軽い日焼け・小麦肌
  0xb9825c, // ミディアムブラウン肌
  0x8c5a3c, // ディープブラウン肌
];

/** 髪色バリエーション（黒〜栗〜アッシュ〜ブロンド） */
export const PEDESTRIAN_HAIR_PALETTE: readonly number[] = [
  0x181513, // 漆黒
  0x2b2019, // ダークブラウン
  0x4b3121, // ナチュラルチェスナット
  0x6b472b, // 明るめブラウン
  0x483e36, // アッシュブラウン
  0x8c693e, // ハニーブロンド
  0x5a281d, // 落ち着いた赤茶
  0x211e1d, // ナチュラルブラック
];

const SENIOR_HAIR_PALETTE: readonly number[] = [0x9e9c99, 0x767472, 0xc2beb8];

/** 服装カラーパレット（ビジネス・カジュアル・シニア・作業着・子供向け） */
export const PEDESTRIAN_WARDROBE_PALETTE: readonly PedestrianWardrobePalette[] = [
  {
    label: 'business_navy',
    styles: ['business'],
    topHex: 0x1e3250,
    bottomHex: 0x1a263a,
    accentHex: 0x8f2828,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.85,
  },
  {
    label: 'business_charcoal',
    styles: ['business'],
    topHex: 0x424852,
    bottomHex: 0x2c313a,
    accentHex: 0x2b5a8c,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'business_beige_coat',
    styles: ['business', 'classy'],
    topHex: 0xb9a183,
    bottomHex: 0x2d323b,
    accentHex: 0x5c3a24,
    topStrength: 0.9,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'classy_burgundy',
    styles: ['classy'],
    topHex: 0x7a2f3e,
    bottomHex: 0x322b30,
    accentHex: 0xd6c3a5,
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'classy_sage',
    styles: ['classy'],
    topHex: 0x5d7463,
    bottomHex: 0x3b3d38,
    accentHex: 0xd9cdb8,
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'casual_offwhite_denim',
    styles: ['casual'],
    topHex: 0xe6e2d8,
    bottomHex: 0x2d4b70,
    accentHex: 0x5e4028,
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'casual_denim_blue',
    styles: ['casual'],
    topHex: 0x2f689e,
    bottomHex: 0xb8a082,
    accentHex: 0x3a2b1f,
    topStrength: 0.92,
    bottomStrength: 0.88,
    hairStrength: 0.84,
  },
  {
    label: 'casual_olive',
    styles: ['casual'],
    topHex: 0x4f6443,
    bottomHex: 0x2a2d33,
    accentHex: 0x705136,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'casual_brick_red',
    styles: ['casual'],
    topHex: 0xa43b3b,
    bottomHex: 0x2d3440,
    accentHex: 0x362a24,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.82,
  },
  {
    label: 'casual_mustard',
    styles: ['casual'],
    topHex: 0xc29338,
    bottomHex: 0x2c3c52,
    accentHex: 0x4d3422,
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'casual_lavender',
    styles: ['casual'],
    topHex: 0x877ba3,
    bottomHex: 0x3a3d47,
    accentHex: 0xd6c8bc,
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'worker_safety',
    styles: ['worker'],
    topHex: 0x3b5878,
    bottomHex: 0x2f353d,
    accentHex: 0xe6841c, // 安全ベスト・ヘルメットアクセント
    topStrength: 0.9,
    bottomStrength: 0.88,
    hairStrength: 0.82,
  },
  {
    label: 'child_sunny_yellow',
    styles: ['child'],
    topHex: 0xd9a834,
    bottomHex: 0x2f4d78,
    accentHex: 0xc4372d,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.84,
  },
  {
    label: 'child_sky_hoodie',
    styles: ['child'],
    topHex: 0x3d8bc2,
    bottomHex: 0x3c434f,
    accentHex: 0xd95638,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.84,
  },
  {
    label: 'child_coral_pink',
    styles: ['child'],
    topHex: 0xcf5d6e,
    bottomHex: 0x334766,
    accentHex: 0xe5b842,
    topStrength: 0.92,
    bottomStrength: 0.9,
    hairStrength: 0.84,
  },
];

const CAP_COLORS: readonly number[] = [
  0x22385c, 0x8f2929, 0x2f523b, 0x333740, 0xb88b4a, 0xd4cfc4,
];
const BEANIE_COLORS: readonly number[] = [
  0x7a2c38, 0x2e455c, 0x525948, 0xc78936, 0x454048,
];
const BACKPACK_COLORS: readonly number[] = [
  0x262e3d, 0x3b4f3a, 0x7a322d, 0x4c4036, 0x284b6e,
];
const CHILD_BACKPACK_COLORS: readonly number[] = [
  0xb82b2b, 0x1e2c4a, 0x286b64, 0x99386b,
];
const SHOULDER_BAG_COLORS: readonly number[] = [
  0x5c3e26, 0x26282e, 0x8c6c4a, 0x384a5e, 0x6b2f38,
];
const GLASSES_COLORS: readonly number[] = [0x1c1d22, 0x4a3222, 0x6c727a];

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 歩行者 count 人分のバリエーションプランを生成する。
 * - すべてのモデルを重複なく優先割り当て
 * - 必ず 1〜2 名の子供（125〜135cm）＋細身/標準/がっしり体型の大⼈（158〜182cm）を混在
 * - 頭・顔・背中/肩の3D装着パーツをバランス良く組み合わせ、シルエットのクローン感を完全解消
 */
export function createPedestrianVariationPlan(
  count: number,
  availableSpecs: readonly PedestrianModelSpec[],
): PedestrianVariation[] {
  const pool =
    availableSpecs.length > 0 ? availableSpecs : [FALLBACK_MIXAMO_MODEL_SPEC];
  const shuffledSpecs = shuffleArray(pool);

  // 子供枠（count >= 6 なら2人、count >= 3 なら1人）を canBeChild なモデルへ優先割り当て
  const desiredChildCount = count >= 6 ? 2 : count >= 3 ? 1 : 0;
  const assignedSpecs: PedestrianModelSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    assignedSpecs.push(shuffledSpecs[i % shuffledSpecs.length]);
  }

  const childIndices = new Set<number>();
  const childCandidateIndices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (assignedSpecs[i].canBeChild) {
      childCandidateIndices.push(i);
    }
  }
  const shuffledChildCandidates = shuffleArray(childCandidateIndices);
  for (
    let i = 0;
    i < Math.min(desiredChildCount, shuffledChildCandidates.length);
    i += 1
  ) {
    childIndices.add(shuffledChildCandidates[i]);
  }

  // 大人の体型タイプを偏りなくシャッフル配分
  const adultBuildCycle: PedestrianBuildKind[] = shuffleArray([
    'slim',
    'standard',
    'stocky',
    'standard',
    'slim',
    'stocky',
  ]);
  let adultCursor = 0;

  // アクセサリー（頭・バッグ）も単調にならないようバリエーション配分
  const headwearPool: PedestrianHeadwearKind[] = shuffleArray([
    'cap',
    'beanie',
    'none',
    'cap',
    'none',
    'beanie',
    'none',
    'none',
  ]);
  const bagPool: PedestrianBagKind[] = shuffleArray([
    'backpack',
    'shoulder_bag',
    'backpack',
    'none',
    'shoulder_bag',
    'backpack',
    'none',
    'shoulder_bag',
  ]);
  const glassesPool: boolean[] = shuffleArray([
    true,
    false,
    true,
    false,
    false,
    true,
    false,
    false,
  ]);

  const skinOrder = shuffleArray(PEDESTRIAN_SKIN_PALETTE);
  const hairOrder = shuffleArray(PEDESTRIAN_HAIR_PALETTE);
  const usedWardrobeLabels = new Set<string>();

  const variations: PedestrianVariation[] = [];
  for (let i = 0; i < count; i += 1) {
    const spec = assignedSpecs[i];
    const isChild = childIndices.has(i);
    const ageGroup: PedestrianAgeGroup = isChild ? 'child' : 'adult';

    let buildKind: PedestrianBuildKind;
    let heightMeters: number;
    let widthScale: number;
    let depthScale: number;
    let speedFactor: number;
    let cadenceFactor: number;
    let armSwingDelta: number;

    if (isChild) {
      buildKind = 'child';
      heightMeters = Math.round(randRange(1.25, 1.35) * 100) / 100;
      widthScale = randRange(0.92, 0.98);
      depthScale = randRange(0.92, 0.98);
      speedFactor = randRange(0.94, 1.08);
      cadenceFactor = randRange(1.18, 1.3); // 子供は小股で軽快な歩調
      armSwingDelta = randRange(0.06, 0.15);
    } else {
      buildKind = adultBuildCycle[adultCursor % adultBuildCycle.length];
      adultCursor += 1;

      if (buildKind === 'slim') {
        heightMeters =
          Math.round(
            randRange(spec.gender === 'female' ? 1.58 : 1.66, 1.77) * 100,
          ) / 100;
        widthScale = randRange(0.88, 0.93);
        depthScale = randRange(0.9, 0.95);
        speedFactor = randRange(0.98, 1.14);
        cadenceFactor = randRange(0.98, 1.12);
        armSwingDelta = randRange(0.0, 0.08);
      } else if (buildKind === 'stocky') {
        heightMeters =
          Math.round(
            randRange(spec.gender === 'female' ? 1.62 : 1.72, 1.82) * 100,
          ) / 100;
        widthScale = randRange(1.1, 1.16);
        depthScale = randRange(1.07, 1.13);
        speedFactor = randRange(0.88, 1.02);
        cadenceFactor = randRange(0.88, 0.98);
        armSwingDelta = randRange(-0.08, 0.03);
      } else {
        heightMeters =
          Math.round(
            randRange(spec.gender === 'female' ? 1.59 : 1.68, 1.79) * 100,
          ) / 100;
        widthScale = randRange(0.97, 1.04);
        depthScale = randRange(0.97, 1.03);
        speedFactor = randRange(0.92, 1.1);
        cadenceFactor = randRange(0.94, 1.08);
        armSwingDelta = randRange(-0.04, 0.08);
      }
    }

    // モデルスタイルに合った服装パレットを重複少なめで選出
    const targetStyle = isChild ? 'child' : spec.style;
    const styleMatches = PEDESTRIAN_WARDROBE_PALETTE.filter((w) =>
      w.styles.includes(targetStyle),
    );
    const unusedMatches = styleMatches.filter(
      (w) => !usedWardrobeLabels.has(w.label),
    );
    const wardrobe =
      unusedMatches.length > 0
        ? pickRandom(unusedMatches)
        : styleMatches.length > 0
          ? pickRandom(styleMatches)
          : pickRandom(PEDESTRIAN_WARDROBE_PALETTE);
    usedWardrobeLabels.add(wardrobe.label);

    const skinHex = skinOrder[i % skinOrder.length];
    const hairHex =
      spec.style === 'classy' && !isChild
        ? pickRandom(SENIOR_HAIR_PALETTE)
        : hairOrder[i % hairOrder.length];

    // アクセサリー決定（内蔵帽子があるモデルには帽子を二重装着しない）
    let headwear: PedestrianHeadwearKind = spec.hasBuiltInHat
      ? 'none'
      : headwearPool[i % headwearPool.length];
    if (isChild && !spec.hasBuiltInHat && Math.random() < 0.65) {
      headwear = Math.random() < 0.7 ? 'cap' : 'beanie';
    }

    let bag: PedestrianBagKind = bagPool[i % bagPool.length];
    if (isChild) {
      // 小学生はランドセル／通学リュックを高確率で背負わせる
      bag = 'backpack';
    } else if (spec.style === 'worker' && bag === 'shoulder_bag') {
      bag = 'backpack';
    }

    const glasses = isChild ? false : glassesPool[i % glassesPool.length];

    const headwearHex =
      headwear === 'cap' ? pickRandom(CAP_COLORS) : pickRandom(BEANIE_COLORS);
    const bagHex =
      bag === 'backpack'
        ? isChild
          ? pickRandom(CHILD_BACKPACK_COLORS)
          : pickRandom(BACKPACK_COLORS)
        : pickRandom(SHOULDER_BAG_COLORS);

    variations.push({
      modelSpec: spec,
      ageGroup,
      buildKind,
      heightMeters,
      widthScale,
      depthScale,
      skinHex,
      hairHex,
      wardrobe,
      accessories: {
        headwear,
        headwearHex,
        glasses,
        glassesHex: pickRandom(GLASSES_COLORS),
        bag,
        bagHex,
        bagAccentHex: wardrobe.accentHex,
      },
      speedFactor,
      cadenceFactor,
      armSwingDelta,
    });
  }

  return variations;
}
