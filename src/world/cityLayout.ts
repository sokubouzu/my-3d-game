export type AssetCategory = 'buildings' | 'vehicles' | 'props';
export type ScaleFitMode = 'height' | 'length';

export interface LocalColliderSpec {
  /** コライダー ID サフィックス（`${instanceId}__${suffix}`） */
  suffix: string;
  /** 元 GLB ワールド座標（スケール前）の最小/最大 X */
  minX: number;
  maxX: number;
  /** 元 GLB ワールド座標（スケール前）の最小/最大 Z */
  minZ: number;
  maxZ: number;
  /** 任意: 元 GLB ワールド座標（スケール前）の上端 Y（未指定時はモデル全高） */
  maxY?: number;
}

export interface CityAssetPlacement {
  /** 配置インスタンス固有 ID */
  instanceId: string;
  /** docs/ASSET_MANIFEST.json の id */
  assetId: string;
  /** カテゴリ */
  category: AssetCategory;
  /** public/ からの相対 URL (./assets/...) */
  url: string;
  /** 配置 X 座標 (m) */
  x: number;
  /** 配置 Z 座標 (m) */
  z: number;
  /** Y 軸回転 (rad) */
  rotationY: number;
  /** スケール基準: 建物・小物は height、車両は length */
  fitMode: ScaleFitMode;
  /** 基準軸の目標寸法 (m) */
  targetSize: number;
  /** 水平フットプリント（幅・奥行の最大辺）上限 (m) */
  maxFootprint: number;
  /** コリジョンを有効にするか */
  hasCollision: boolean;
  /** コリジョンボックスの縮小率 (0.88〜0.95 程度、軒先・ミラーの引っかかり緩和) */
  colliderShrink?: number;
  /** ロード完了前の暫定コリジョン幅・奥行・高さ (m) */
  placeholderFootprint?: { width: number; depth: number; height: number };
  /** リアルタイムシャドウを落とすか (M1 iPad Air 最適化) */
  castShadow: boolean;
  /** ロード優先度 (小さいほど先にロード) */
  priority: number;
  /**
   * PHASE 5-Fix1: 正規化・BBox計測・描画から除外する不要ノード名一覧
   * （例: tokyo_japanese_house の巨大白色地面板 Carretera_Material_0）。
   */
  excludeNodeNames?: readonly string[];
  /**
   * PHASE 5-Fix1: 元 GLB 空間で実際の地面・基礎上端とみなす Y 座標。
   * 地下へ突き出た基礎スカート等で Box3.min.y が下がり建物が宙浮きするのを防止する。
   */
  rawGroundY?: number;
  /**
   * PHASE 5-Fix1: 接地先となるワールド地面高さ (m)。
   * 内側コア街区歩道上は 0.12、外周エリアは 0.0（薄い舗装スラブ付き店舗は +0.02 で Z ファイティング回避）。
   */
  groundSurfaceY?: number;
  /**
   * PHASE 5-Fix1: 建物本体・塀など実体構造物のみへ絞った分割 OBB コライダー定義（元 GLB 座標系）。
   * 庭・駐車場・玄関前アプローチ・軒先下をプレイヤーが歩けるようにする。
   */
  localColliders?: readonly LocalColliderSpec[];
}

/**
 * PHASE 5-Fix1: 各建物 GLB の実測構造物 OBB 定義（元 GLB 空間の壁・基礎・塀のみに限定）。
 */
const BUSTER_BROWN_COLLIDERS: readonly LocalColliderSpec[] = [
  // 店舗建物本体（Object_8/9/10/11: 駐車場・周囲芝生は歩行可能化）
  { suffix: 'store', minX: -8.15, maxX: 7.82, minZ: 9.0, maxZ: 30.3 },
  // ロードサイド看板台座（Object_4/5）
  { suffix: 'sign', minX: -0.5, maxX: 0.25, minZ: -6.2, maxZ: -3.9 },
];

const TOKYO_HOUSE_EXCLUDE_NODES: readonly string[] = ['Carretera_Material_0'];
const TOKYO_HOUSE_COLLIDERS: readonly LocalColliderSpec[] = [
  // 2階建て住宅本体（Casa_1: 西側駐車スペース・玄関前・東側庭・裏通路を通行可能化）
  { suffix: 'house', minX: -376.5, maxX: 430.0, minZ: 183.2, maxZ: 1011.6 },
  // 前面擁壁（Muro_1: X=-672..-341 の幅約3.1mの車庫・玄関入口を完全開放）
  { suffix: 'wall_front', minX: -340.6, maxX: 658.4, minZ: -28.2, maxZ: 16.9, maxY: 100.0 },
  // 西側外周塀（Muro_2）
  { suffix: 'wall_west', minX: -695.1, maxX: -672.2, minZ: -28.1, maxZ: 1150.3, maxY: 89.0 },
  // 東側外周塀（Muro_3）
  { suffix: 'wall_east', minX: 656.3, maxX: 673.8, minZ: -6.4, maxZ: 1123.2, maxY: 89.0 },
  // 裏側外周塀（Muro_atr）
  { suffix: 'wall_rear', minX: -680.0, maxX: 674.0, minZ: 1122.1, maxZ: 1149.4, maxY: 105.9 },
];

const MILESTONE_HOUSE_COLLIDERS: readonly LocalColliderSpec[] = [
  // 石垣・木壁・玄関ドアの建物コア（屋根軒先 ~1.7m の張り出しを除外し玄関前まで歩行可能化）
  { suffix: 'body', minX: -6.9, maxX: 4.98, minZ: -6.77, maxZ: 1.9 },
];

const JAPANESE_HOUSE_COLLIDERS: readonly LocalColliderSpec[] = [
  // 住宅壁面コア（土台プレート外縁・軒先を除外し周囲アプローチを歩行可能化）
  { suffix: 'body', minX: -0.93, maxX: 1.24, minZ: -1.18, maxZ: 1.12 },
];

/**
 * 1-D / 5-Fix1:
 * 単体の日本風住宅・商業店舗・駐車車両・街の小物のみを配置し、
 * 不要な白い地面板（Carretera_Material_0）の除去・地下基礎による宙浮き補正（rawGroundY）・
 * 建物本体/塀のみへ絞った構造物 OBB（localColliders）で接地と敷地内歩行を両立する。
 */
export const JAPANESE_CITY_PLACEMENTS: readonly CityAssetPlacement[] = [
  // =========================================================================
  // 1. 北西ブロック (X < -10, Z < -10): 飲食・戸建て住宅区画
  // =========================================================================
  {
    instanceId: 'nw_inakaya_restaurant',
    assetId: 'japanese_restaurant_inakaya',
    category: 'buildings',
    url: './assets/buildings/japanese_restaurant_inakaya.glb',
    x: -20,
    z: -22,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 8.2,
    maxFootprint: 20.0,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 11, depth: 17, height: 8.2 },
    castShadow: true,
    priority: 1,
  },
  {
    instanceId: 'nw_milestone_house',
    assetId: 'dae_final_assignment_milestone_house',
    category: 'buildings',
    url: './assets/buildings/dae_final_assignment_milestone_house.glb',
    x: -40,
    z: -20,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 7.8,
    maxFootprint: 18.0,
    hasCollision: true,
    rawGroundY: -0.02,
    groundSurfaceY: 0.12,
    localColliders: MILESTONE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 11.5, depth: 8.5, height: 7.8 },
    castShadow: true,
    priority: 2,
  },

  // =========================================================================
  // 2. 北東ブロック (X > +10, Z < -10): 日本住宅区画
  // =========================================================================
  {
    instanceId: 'ne_japanese_house_1',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: 18,
    z: -18,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.2,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.12,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.2 },
    castShadow: true,
    priority: 1,
  },
  {
    instanceId: 'ne_japanese_house_2',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: 18,
    z: -32,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.2,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.12,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.2 },
    castShadow: true,
    priority: 2,
  },
  {
    instanceId: 'ne_psx_japanese_house_1',
    assetId: 'psx_japanese_house',
    category: 'buildings',
    url: './assets/buildings/psx_japanese_house.glb',
    x: 34,
    z: -19,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 6.8,
    maxFootprint: 15.0,
    hasCollision: true,
    colliderShrink: 0.88,
    groundSurfaceY: 0.12,
    placeholderFootprint: { width: 7.0, depth: 11.5, height: 6.8 },
    castShadow: true,
    priority: 2,
  },
  {
    instanceId: 'ne_tokyo_house_1',
    assetId: 'tokyo_japanese_house__casa_japonesa_low_poly',
    category: 'buildings',
    url: './assets/buildings/tokyo_japanese_house__casa_japonesa_low_poly.glb',
    x: 46,
    z: -44,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 7.0,
    maxFootprint: 18.0,
    hasCollision: true,
    excludeNodeNames: TOKYO_HOUSE_EXCLUDE_NODES,
    rawGroundY: -100.0,
    groundSurfaceY: 0.12,
    localColliders: TOKYO_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 13.0, depth: 11.0, height: 7.0 },
    castShadow: true,
    priority: 3,
  },

  // =========================================================================
  // 3. 南西ブロック (X < -10, Z > +10): 商業店舗・住宅区画
  // =========================================================================
  {
    instanceId: 'sw_japanese_house',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: -18,
    z: 18,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.2,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.12,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.2 },
    castShadow: true,
    priority: 1,
  },
  {
    instanceId: 'sw_milestone_house',
    assetId: 'dae_final_assignment_milestone_house',
    category: 'buildings',
    url: './assets/buildings/dae_final_assignment_milestone_house.glb',
    x: -20,
    z: 36,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.8,
    maxFootprint: 18.0,
    hasCollision: true,
    rawGroundY: -0.02,
    groundSurfaceY: 0.12,
    localColliders: MILESTONE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 8.5, depth: 11.5, height: 7.8 },
    castShadow: true,
    priority: 2,
  },
  {
    instanceId: 'sw_shoe_store',
    assetId: 'buster_brown_shoe_store',
    category: 'buildings',
    url: './assets/buildings/buster_brown_shoe_store.glb',
    x: -50,
    z: 38,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 10.5,
    maxFootprint: 36.0,
    hasCollision: true,
    rawGroundY: 0.059,
    groundSurfaceY: 0.14,
    localColliders: BUSTER_BROWN_COLLIDERS,
    placeholderFootprint: { width: 19, depth: 14, height: 7.2 },
    castShadow: true,
    priority: 3,
  },

  // =========================================================================
  // 4. 南東ブロック (X > +10, Z > +10): 住宅区画
  // =========================================================================
  {
    instanceId: 'se_japanese_house',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: 18,
    z: 18,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.2,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.12,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.2 },
    castShadow: true,
    priority: 1,
  },
  {
    instanceId: 'se_psx_japanese_house',
    assetId: 'psx_japanese_house',
    category: 'buildings',
    url: './assets/buildings/psx_japanese_house.glb',
    x: 34,
    z: 20,
    rotationY: Math.PI,
    fitMode: 'height',
    targetSize: 6.8,
    maxFootprint: 15.0,
    hasCollision: true,
    colliderShrink: 0.88,
    groundSurfaceY: 0.12,
    placeholderFootprint: { width: 7.0, depth: 11.5, height: 6.8 },
    castShadow: true,
    priority: 2,
  },
  {
    instanceId: 'se_tokyo_house',
    assetId: 'tokyo_japanese_house__casa_japonesa_low_poly',
    category: 'buildings',
    url: './assets/buildings/tokyo_japanese_house__casa_japonesa_low_poly.glb',
    x: 46,
    z: 46,
    rotationY: Math.PI,
    fitMode: 'height',
    targetSize: 7.0,
    maxFootprint: 18.0,
    hasCollision: true,
    excludeNodeNames: TOKYO_HOUSE_EXCLUDE_NODES,
    rawGroundY: -100.0,
    groundSurfaceY: 0.12,
    localColliders: TOKYO_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 13.0, depth: 11.0, height: 7.0 },
    castShadow: true,
    priority: 3,
  },

  // =========================================================================
  // 5. 駐車車両 (車道路肩・全長 4.2〜4.8m 目安 / バイク 2.3m、Y = 0 厳守)
  //    3-A: 内側走行レーン (±1.65m) のAI交通車両と干渉しない路肩位置 (±4.35m) へ整列
  // =========================================================================
  {
    instanceId: 'veh_innova_north',
    assetId: '2011_-_13_toyota_kijang_innova_2.0_g_tgn40',
    category: 'vehicles',
    url: './assets/vehicles/2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb',
    x: 4.35,
    z: -16,
    rotationY: 0,
    fitMode: 'length',
    targetSize: 4.6,
    maxFootprint: 4.8,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 1.9, depth: 4.6, height: 1.8 },
    castShadow: true,
    priority: 1,
  },
  // ※ veh_porsche_north (free_1975_porsche_911_930_turbo.glb / x:-4.2, z:-22) は
  //    作業ID 2-C にて同一位置のまま運転可能スポーツカー（2台目）へ昇格したため静的配置から除外。
  // ※ veh_mazda_furai_east (2008__mazda_furai.glb / x:18, z:4.35, rotationY:-Math.PI/2) は
  //    作業ID 5-Fix2 にて同一位置のまま運転可能スーパーカー（4台目）へ昇格したため静的配置から除外。
  //    西側路肩の重複駐車枠は既存のキャッシュ済み車両（thunderbolt_96_interceptor / castShadow: false）へ置換し、
  //    未操作同型クローンによる誤認と VRAM 二重確保（~22MB）・シャドウ負荷を解消。
  {
    instanceId: 'veh_thunderbolt_west',
    assetId: 'thunderbolt_96_interceptor_-_low_poly_model',
    category: 'vehicles',
    url: './assets/vehicles/thunderbolt_96_interceptor_-_low_poly_model.glb',
    x: -20,
    z: -4.35,
    rotationY: Math.PI / 2,
    fitMode: 'length',
    targetSize: 4.7,
    maxFootprint: 4.9,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 2.0, depth: 4.7, height: 1.6 },
    castShadow: false,
    priority: 1,
  },
  {
    instanceId: 'veh_thunderbolt_south',
    assetId: 'thunderbolt_96_interceptor_-_low_poly_model',
    category: 'vehicles',
    url: './assets/vehicles/thunderbolt_96_interceptor_-_low_poly_model.glb',
    x: -4.35,
    z: 18,
    rotationY: Math.PI,
    fitMode: 'length',
    targetSize: 4.7,
    maxFootprint: 4.9,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 2.0, depth: 4.7, height: 1.6 },
    castShadow: true,
    priority: 2,
  },
  // ※ veh_harley_bike (harley_custom_bike_v1.2.glb / x:4.75, z:14) は
  //    同一位置のまま運転可能バイク（3台目: type='bike'）へ昇格したため静的配置から除外。

  // =========================================================================
  // 6. 街の小物 (単体モデルのみ、Y = 0 接地)
  // =========================================================================
  {
    instanceId: 'prop_vending_nw',
    assetId: 'japanese_inspired_vending_machines',
    category: 'props',
    url: './assets/props/japanese_inspired_vending_machines.glb',
    x: -10.3,
    z: -14,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 1.95,
    maxFootprint: 4.2,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 1.1, depth: 2.4, height: 1.95 },
    castShadow: false,
    priority: 1,
  },
  {
    instanceId: 'prop_vending_se',
    assetId: 'japanese_inspired_vending_machines',
    category: 'props',
    url: './assets/props/japanese_inspired_vending_machines.glb',
    x: 10.3,
    z: 14,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 1.95,
    maxFootprint: 4.2,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 1.1, depth: 2.4, height: 1.95 },
    castShadow: false,
    priority: 2,
  },
  {
    instanceId: 'prop_vending_sw',
    assetId: 'japanese_inspired_vending_machines',
    category: 'props',
    url: './assets/props/japanese_inspired_vending_machines.glb',
    x: -10.3,
    z: 24,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 1.95,
    maxFootprint: 4.2,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 1.1, depth: 2.4, height: 1.95 },
    castShadow: false,
    priority: 2,
  },
  {
    instanceId: 'prop_dog_ne',
    assetId: 'dog',
    category: 'props',
    url: './assets/props/dog.glb',
    x: 7.8,
    z: -15,
    rotationY: -Math.PI / 3,
    fitMode: 'height',
    targetSize: 0.68,
    maxFootprint: 1.4,
    hasCollision: true,
    colliderShrink: 0.85,
    placeholderFootprint: { width: 0.5, depth: 1.2, height: 0.68 },
    castShadow: true,
    priority: 1,
  },

  // =========================================================================
  // 7. 拡張エリア外周沿いの既存承認済み建物クローン (Phase 4-A / 5-Fix1, Y = 0, castShadow: false)
  //    既存テンプレートキャッシュ再利用のため追加ダウンロードゼロ
  // =========================================================================
  {
    instanceId: 'ext_nw_milestone_house',
    assetId: 'dae_final_assignment_milestone_house',
    category: 'buildings',
    url: './assets/buildings/dae_final_assignment_milestone_house.glb',
    x: -34,
    z: -102,
    rotationY: Math.PI,
    fitMode: 'height',
    targetSize: 7.8,
    maxFootprint: 18.0,
    hasCollision: true,
    rawGroundY: -0.02,
    groundSurfaceY: 0.0,
    localColliders: MILESTONE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 11.5, depth: 8.5, height: 7.8 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_nw_inakaya',
    assetId: 'japanese_restaurant_inakaya',
    category: 'buildings',
    url: './assets/buildings/japanese_restaurant_inakaya.glb',
    x: -64,
    z: -102,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 8.2,
    maxFootprint: 18.0,
    hasCollision: true,
    colliderShrink: 0.92,
    placeholderFootprint: { width: 11, depth: 17, height: 8.2 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_w_north_house',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: -102,
    z: -42,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.4,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.0,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.4 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_w_south_psx_house',
    assetId: 'psx_japanese_house',
    category: 'buildings',
    url: './assets/buildings/psx_japanese_house.glb',
    x: -102,
    z: 42,
    rotationY: Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.0,
    maxFootprint: 15.0,
    hasCollision: true,
    colliderShrink: 0.88,
    groundSurfaceY: 0.0,
    placeholderFootprint: { width: 11.5, depth: 7.0, height: 7.0 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_e_north_house',
    assetId: 'japanese_house',
    category: 'buildings',
    url: './assets/buildings/japanese_house.glb',
    x: 102,
    z: -40,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.4,
    maxFootprint: 12.0,
    hasCollision: true,
    rawGroundY: -0.015,
    groundSurfaceY: 0.0,
    localColliders: JAPANESE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 5.5, depth: 5.6, height: 7.4 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_e_south_milestone_house',
    assetId: 'dae_final_assignment_milestone_house',
    category: 'buildings',
    url: './assets/buildings/dae_final_assignment_milestone_house.glb',
    x: 102,
    z: 42,
    rotationY: -Math.PI / 2,
    fitMode: 'height',
    targetSize: 7.8,
    maxFootprint: 18.0,
    hasCollision: true,
    rawGroundY: -0.02,
    groundSurfaceY: 0.0,
    localColliders: MILESTONE_HOUSE_COLLIDERS,
    placeholderFootprint: { width: 8.5, depth: 11.5, height: 7.8 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_sw_shoe_store',
    assetId: 'buster_brown_shoe_store',
    category: 'buildings',
    url: './assets/buildings/buster_brown_shoe_store.glb',
    x: -68,
    z: 102,
    rotationY: Math.PI,
    fitMode: 'height',
    targetSize: 9.2,
    maxFootprint: 26.0,
    hasCollision: true,
    rawGroundY: 0.059,
    groundSurfaceY: 0.02,
    localColliders: BUSTER_BROWN_COLLIDERS,
    placeholderFootprint: { width: 10, depth: 14, height: 5.5 },
    castShadow: false,
    priority: 4,
  },
  {
    instanceId: 'ext_se_psx_house',
    assetId: 'psx_japanese_house',
    category: 'buildings',
    url: './assets/buildings/psx_japanese_house.glb',
    x: 68,
    z: 102,
    rotationY: 0,
    fitMode: 'height',
    targetSize: 7.0,
    maxFootprint: 15.0,
    hasCollision: true,
    colliderShrink: 0.88,
    groundSurfaceY: 0.0,
    placeholderFootprint: { width: 7.0, depth: 11.5, height: 7.0 },
    castShadow: false,
    priority: 4,
  },
];
