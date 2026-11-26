# 開発進捗記録（PROGRESS.md）

## 現在のステータス
- **完了済み作業ID**: `0-C`（素材棚卸し）、`1-A`（最小起動基盤・GitHub Pages設定）、`1-B`（人物表示）、`1-C`（徒歩移動・三人称カメラ・iPadタッチ操作）、`1-D`（日本の街区配置と衝突判定 + 単体厳選＆埋まり/浮き解消修正）、`1-E`（Poly Haven 1K PBR・HDRI・環境仕上げ）、**PHASE 1 実機検証完了**、`2-A`（運転可能な主役車両1台の表示・構造確認・`src/vehicle/` 土台）、`2-B`（主役車両への乗降・運転物理・車輪回転・運転カメラ・iPad運転タッチUI + 3台セットミニチュア車両修正）、**`2-C`（カメラの建物遮蔽回避・主役車両110km/h化・街区配置済みスポーツカーの運転車両化160km/h）**
- **次回作業ID**: `2-D` 以降（iPad Air 第5世代実機での `2-C` カメラ遮蔽回避・高速走行・2台乗換検証完了後に進行）
- **関連コミットID**: `2156aa0`（2-C カメラ遮蔽回避・110km/h化・Porsche 911 Turbo 運転車両化160km/h）、`7a16542`（2-B 運転物理・乗降・運転カメラ/UI・ミニチュア3台セット車両修正）、`460bdb6`（2-A 主役車両配置＆リグ土台・歩道境界つまづき修正）、`f3e12dc`（1-D ジオラマ除外＆単体Y=0厳密接地修正）、`6b8976b`（1-D 飛行機除外等）、`b5343ca`（1-D / 1-E 実装）、`abd08be`（1-B / 1-C 実装）、`0c5e527`（0-C / 1-A）

---

## 作業履歴

### 作業ID: 2-C（カメラの建物遮蔽回避・走行速度向上・街区配置済みスポーツカーの運転車両化）
- **実施日**: 2026-11-26
- **コミットID**: `2156aa0`（`2156aa0e68e4793ad5864b70371b646ad9f336ab`）
- **GitHub Actions Run ID**: `45740850455`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での描画＝状態C・カメラ遮蔽回避/高速走行/2台乗換動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **建物・障害物の裏に回り込んだ際のカメラ遮蔽回避（徒歩・運転共通）**:
   - `src/world/collisionWorld.ts` に 3D Ray vs OBB スラブ法および街区外周壁交差判定を行う軽量ゼロアロケーションの `raycastCameraOcclusion` を実装（M1 iPad Air で高ポリゴンメッシュ総当たりを避けてフレームレートを維持）。
   - `src/camera/thirdPersonCamera.ts` の徒歩カメラ（`update`）および運転カメラ（`updateDriving`、自車両コライダー ID 除外対応）の双方に遮蔽回避処理を統合。注視点とカメラの間に建物・壁・背の高い障害物が入った場合は手前マージン `0.42m` まで素早く距離を縮め、障害物から離れた際は滑らかに元の距離へ復帰するよう補間。
2. **既存主役車両（1台目: Toyota Kijang Innova）の最高速アップ＆操作安定性調整**:
   - `src/vehicle/vehicleConfig.ts` に車種別スペック定義 `VehicleHandlingSpec` を導入し、`HERO_VEHICLE_CONFIG` の最高前進速度を約 65km/h から **約 110km/h（`30.6 m/s`）** へ引き上げ。
   - 速度比に応じた自然な加速カーブ（ベース加速度 `13.0 m/s²`）、強化ブレーキ（`24.5 m/s²` / 強ブレーキ `34.0 m/s²`）、および高速域でのステアリング切れ角制限（`0.56 rad → 0.15 rad`）を調整。
3. **街区配置済みスポーツカー（1975 Porsche 911 930 Turbo）の運転可能車両化（2台目）**:
   - 街区北側車道に静的配置されていた既存スポーツカー `veh_porsche_north`（`public/assets/vehicles/free_1975_porsche_911_930_turbo.glb`、`x: -3.6, z: -22.0, rotationY: Math.PI`, 全長 `4.3m`, `castShadow: false`）を特定。GLB 内部ノード解析により4輪すべての独立グループ（`Circle.051_37` + `Circle.048_52` / `Circle.037_2` / `Circle.050_51` / `Circle.038_1`）および前輪の初期ステア角（約 `-18.5°`）を特定。
   - 多重配置を防ぐため `src/world/cityLayout.ts` から静的配置エントリを除外し、同一座標・同一向きのまま `SPORTS_CAR_VEHICLE_CONFIG`（**最高速 約 160km/h（`44.5 m/s`）・加速強化 `20.0 m/s²`・ブレーキ `32.0 m/s²`・前輪初期ステア直進補正 `+0.3236 rad`**）として `DRIVABLE_VEHICLES` へ統合。
   - `src/engine/scene.ts` を複数車両管理へ拡張し、どちらの車両でもドア付近（車体外面から `2.4m` 以内 ≒ ドア中心から約 `3.0m` 以内）に近づくと車種名付き「乗る」ボタンが表示され、自由に乗車・運転・降車・乗換ができるように実装。

#### 変更ファイル一覧
- `src/world/collisionWorld.ts`（3D Ray vs OBB カメラ遮蔽レイキャスト `raycastCameraOcclusion` 追加）
- `src/camera/thirdPersonCamera.ts`（徒歩・運転カメラ共通の遮蔽回避・滑らかな距離復帰処理追加）
- `src/world/cityLayout.ts`（`veh_porsche_north` 静的配置を除外し重複配置を防止）
- `src/vehicle/vehicleConfig.ts`（`VehicleHandlingSpec`・Innova 110km/h 化・Porsche 911 Turbo 160km/h 定義・`DRIVABLE_VEHICLES` 追加）
- `src/vehicle/vehicleModel.ts`（前輪初期ステア直進補正 `initialYawCorrection` 対応・空ステアリングノード名ガード）
- `src/vehicle/vehicleController.ts`（車種別ハンドリングスペック適用・高速ステア安定性調整・複数車両近接距離 API 追加）
- `src/vehicle/index.ts`（`DRIVABLE_VEHICLES`・`SPORTS_CAR_VEHICLE_CONFIG`・`VehicleHandlingSpec` エクスポート追加）
- `src/engine/scene.ts`（カメラ遮蔽レイキャスト接続・複数車両ロード＆自由乗換ループ実装）
- `src/App.tsx`・`src/ui/TouchControls.tsx`・`src/ui/DebugHud.tsx`（近接車種名表示・Phase 2-C 複数車両ステータス表示追加）
- `docs/ASSET_MANIFEST.json`・`docs/PROGRESS.md`（記録更新）

---

### 作業ID: 2-B（主役車両への乗降・運転物理・車輪回転・運転カメラ・iPad運転タッチUI） & ミニチュア3台セット車両修正
- **実施日**: 2026-11-26
- **コミットID**: `7a16542`（`7a165427297de52dba5c21162633c4b800b1387c`）
- **GitHub Actions Run ID**: `45734654615`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での描画＝状態C・運転/乗降/衝突動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **街区内の「ミニチュアサイズ3台セット車両」の修正**:
   - `public/assets/vehicles/low_poly_japan_offroad_car.glb` の内部に同型オフロード車が斜め3台セット（`Cube_5` / `Cube.002_14` / `Cube.004_21`）で格納されており、全体4.4mスケーリングでミニチュア化・実寸化すると車道幅を超過して干渉することを特定。
   - `src/world/cityLayout.ts` の西側車道配置（`x: -20, z: -3.6`）を単体実車 GLB `2008__mazda_furai.glb`（`veh_mazda_furai_west`、全長 `4.6m`、Y=0厳密接地、OBBコリジョン実測同期）へ差し替え、`docs/ASSET_MANIFEST.json` を更新。
2. **徒歩⇔運転の乗降システム（2-B3）**:
   - プレイヤーが主役車両（Toyota Kijang Innova）のドア付近（車体外面から約2.4m以内＝中心から約3.0m強）に近づくと「乗る（E / F）」ボタンを表示。
   - 乗車時はプレイヤーを非表示にして操作対象を車両へ切り替え、車両がほぼ停止状態（`<= 1.2 m/s`）のときに「降りる（E / F）」を押すと、車の左側（日本の歩道側 = ローカル `+X`）の安全空間をチェックして降車し徒歩操作へ復帰。
3. **車両の運転物理・車輪回転・ステアリング・衝突判定（2-B1 / 2-B2）**:
   - `src/vehicle/vehicleController.ts` を新設し、アクセル加速・ブレーキ・停車後長押し（0.22秒）によるバック・速度連動ステアリング旋回（ホイールベース `2.78m`）・慣性減速・地面接地（車道 `Y = 0`）を実装。
   - 走行速度に応じた4輪 `spinPivot` 回転および前輪 `steerPivot`・車内ハンドル `stir` の切れ角を毎フレーム連動。
   - `src/world/collisionWorld.ts` に3円カプセル近似 vs OBB 衝突解決（`resolveVehicleCollision`）と降車安全位置判定（`isPointClear`）を追加し、建物・駐車車両・街区外周壁へのすり抜け防止（停止・軽反発）および車両自身 OBB の動的同期を実現。
4. **運転専用カメラと iPad 横画面運転タッチ UI（2-B2 / 2-B4）**:
   - `src/camera/thirdPersonCamera.ts` に運転専用三人称追従カメラ（`updateDriving`：走行中は進行方向へ滑らかに追従しつつ、右画面スワイプ／マウスドラッグで周囲見回し可能）を追加。
   - `src/ui/TouchControls.tsx`・`src/index.css`・`src/input/inputManager.ts` を拡張し、運転中の iPad 横画面 UI（左下：左右ステアリングボタン、右下：アクセルペダル・ブレーキ／バックペダル・降車ボタン、下部中央：ギア＆デジタル速度計）および PC 用 `WASD` + `Space`（強ブレーキ）+ `E`/`F`（乗降）を実装。

#### 変更ファイル一覧
- `src/world/cityLayout.ts`（3台セットミニチュア車両を単体正寸 `2008__mazda_furai.glb` 4.6m へ差し替え）
- `src/world/collisionWorld.ts`（車両3円vsOBB衝突解決 `resolveVehicleCollision`・降車安全判定 `isPointClear` 追加）
- `src/vehicle/vehicleController.ts`（新規作成：運転物理・車輪/ハンドル連動・衝突反発・乗降座標計算）
- `src/vehicle/index.ts`（`VehicleController` エクスポート追加）
- `src/player/playerController.ts`（乗降用 `setVisible` / `teleportTo` 追加）
- `src/camera/thirdPersonCamera.ts`（運転追従カメラ `updateDriving`・`alignBehind` 追加）
- `src/input/inputManager.ts`（`E`/`F` 乗降・運転用 `WASD`+`Space`・タッチ運転入力統合）
- `src/engine/scene.ts`（徒歩⇔運転切替・運転ループ・シャドウ追従・HUDテレメトリ連携）
- `src/ui/TouchControls.tsx`・`src/ui/DebugHud.tsx`・`src/App.tsx`・`src/index.css`（乗降ボタン・iPad運転タッチUI・速度計追加）
- `docs/ASSET_MANIFEST.json`・`docs/PROGRESS.md`（記録更新）

---

### 作業ID: 2-A（運転可能な主役車両1台の表示・構造確認） & PHASE 1残課題（歩道境界つまづき修正）
- **実施日**: 2026-11-26
- **コミットID**: `460bdb6`（`460bdb6a0a3ed009250b9e880d3da8c310669023`）
- **GitHub Actions Run ID**: `45731910321`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**:
  - **PHASE 1（1-A〜1-E）**: iPad Air 第5世代実機にて表示・徒歩移動・街区配置を確認済み（**状態E**、残課題だった歩道境界の着地モーション誤作動を今回修正）。
  - **今回の 2-A 実装および歩道境界修正**: **状態B**（GLBノード解析・コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad実機での描画＝状態C・動作＝状態D・実機検証＝状態Eは未実施）。

#### 実装内容
1. **PHASE 1残課題：歩道・車道境界での「つまづき（落下判定誤作動）」修正**:
   - `src/player/playerController.ts` に **ステップオフセット（`STEP_OFFSET = 0.2m`）** と **コヨーテタイム（`COYOTE_TIME = 0.12s`）** を導入。
   - 歩道（`Y = 0.12m`）から車道（`Y = 0m`）へ下りる際や縁石スロープ横断時に `0 < pos.y - groundY <= 0.2m` を接地維持のまま吸着吸収し、微小な浮きでも 0.12 秒間は `FallingToLanding` へ遷移しないよう修正。
2. **主役車両1台の選定・配置・OBBコリジョン設定（作業ID: 2-A）**:
   - 承認済み車両 GLB の比較解析結果から、品質・実車プロポーション・M1 iPad Air 負荷バランス（90,503 tri / 6.5MB / CC-BY-4.0）・日本の右ハンドル適合性・可動ノード独立性のすべてが最も優れる **`2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb`（Toyota Kijang Innova 2.0 G）** を選定。
   - プレイヤー初期位置 `(0, 0, 0)`・正面 `+Z` から見やすい前方左側通行車線上 **`(x: 3.0, y: 0.0, z: 8.5)`** に全長 `4.6m`（幅 `1.89m` × 高さ `1.74m`）・正面向き（`+Z`）・`Y = 0` 厳密接地で1台配置し、OBB コライダー（`hero_vehicle_innova`）を登録。
3. **車両 GLB 内部ノード解析・`src/vehicle/` 土台構築・マニフェスト記録**:
   - 4輪すべてのタイヤ・リム・ブレーキディスク/キャリパー独立ノードとステアリング独立ノード `stir`（ローカル Z 軸回転）、およびドア固定構造を特定し `docs/ASSET_MANIFEST.json` の `heroVehicleRig` へ記録。
   - `src/vehicle/vehicleConfig.ts`・`src/vehicle/vehicleModel.ts`・`src/vehicle/index.ts` を新設し、各車輪中心に `steerPivot`（Y軸操舵）→ `spinPivot`（X軸前後回転）を自動構築して 2-B で即座に車輪回転・ステアリング制御（`setSteerAngle` / `addWheelSpin`）できる土台を整備（運転物理・乗降UIは未実装のまま停止）。

#### 変更ファイル一覧
- `src/player/playerController.ts`（ステップオフセット `0.2m`・コヨーテタイム `0.12s` 導入）
- `src/vehicle/vehicleConfig.ts`（新規作成：主役車両設定・配置・ノード定義）
- `src/vehicle/vehicleModel.ts`（新規作成：GLBロード・`+Z`正規化・`Y=0`接地・4輪/ステアリングリグ構築）
- `src/vehicle/index.ts`（新規作成：モジュールエクスポート）
- `src/engine/scene.ts`・`src/App.tsx`・`src/ui/DebugHud.tsx`（主役車両ロード・OBBコリジョン同期・HUD状態表示追加）
- `docs/ASSET_MANIFEST.json`（`heroVehicleRig` 解析結果・ノード名・回転軸を追記）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 1-D ジオラマセット・スキャン塊除外＆単体Y=0厳密接地修正
- **実施日**: 2026-11-26
- **コミットID**: `f3e12dc`（`f3e12dc205bd90060c88b3cab9921a920fe1503c`）
- **GitHub Actions Run ID**: `45727753001`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態E**（iPad Air 第5世代実機確認完了。歩道境界の着地モーション誤作動は 2-A にて修正）

#### 修正内容
1. **ジオラマセット・広域フォトグラメトリスキャン・干渉アセットの配置除外（ファイル自体は保持）**:
   - `stylized_little_japanese_town_street.glb`、`night_city_japan.glb`、`vancouver_police_-_cambie_st._vancouver_bc_ca.glb`、`road_pack_not_including_the_road.glb`、`japan_street.glb`、`low_road_-_2.glb`、`train_track.glb`、`train_ride.glb`、`2012_sea-doo_gti_se_130.glb`（および前回除外済みの `porco_plane.glb`）を市街地配置リストから除外。
2. **単体モデルの「埋まりゼロ・浮きゼロ」厳密接地と浮遊オブジェクト削除ガード**:
   - `src/world/cityBuilder.ts` にて各単体モデルを空の親 `THREE.Group`（`position.y = 0` 固定）に包み、スケール適用後に `updateMatrixWorld(true)` → ワールド座標 `Box3` 計測 → 子モデル `position.y = -box.min.y` とする方式へ統一（過剰埋没の原因となった `surfaceEmbedRatio` 押し下げを撤廃）。
   - 配置後の最終ワールド座標 `Box3.min.y > 0.5` の浮遊オブジェクトを自動除外するガードを追加。
   - OBB コライダー（`minY = 0` 〜 `finalWorldBox.max.y`）を修正後の配置と完全同期。
3. **実際に市街地へ配置した単体 GLB 一覧（14種・計22インスタンス）**:
   - 建物（6種・12棟）: `japanese_house.glb`, `japanese_restaurant_inakaya.glb`, `psx_japanese_house.glb`, `dae_final_assignment_milestone_house.glb`, `buster_brown_shoe_store.glb`, `tokyo_japanese_house__casa_japonesa_low_poly.glb`
   - 車両（6種・6台）: `2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb`, `free_1975_porsche_911_930_turbo.glb`, `2008__mazda_furai.glb`, `low_poly_japan_offroad_car.glb`, `thunderbolt_96_interceptor_-_low_poly_model.glb`, `harley_custom_bike_v1.2.glb`
   - 小物（2種・4個）: `japanese_inspired_vending_machines.glb`, `dog.glb`

---

### 作業ID: 1-D 実機テスト不具合修正（飛行機除外・Y=0厳密接地・ジオラマ道路面高さ修正）
- **実施日**: 2026-11-26
- **コミットID**: `6b8976b`（`6b8976bba594623ecbfee3163bed55586bdf6a44`）
- **GitHub Actions Run ID**: `45725726491`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **プレイヤー・操作UI**: `player.glb` の挙動・アニメーション・三人称カメラ・iPadタッチ操作 UI は一切変更なし。

#### 修正内容（検証ランク: 状態B＝コード修正・CIビルド＆GitHub Pagesデプロイ成功／iPad実機再検証＝状態Eは未実施）
1. **街区に誤配置された飛行機 GLB の配置除外**:
   - `src/world/cityLayout.ts` から `porco_plane.glb`（`se_porco_plane`）の配置エントリを削除し、市街地配置を承認済み23種・計27インスタンスへ更新。
   - `public/assets/vehicles/porco_plane.glb` ファイル自体は削除せず、今後の空港フェーズ用に保持。
2. **空高く浮いていた建物を含む全配置モデルの厳密接地（Y = 0 厳守）**:
   - `src/world/cityBuilder.ts` にてスケール適用後に必ず `model.updateMatrixWorld(true)` を実行してから `new THREE.Box3().setFromObject(model)` でワールド境界ボックスを再計算し、`model.position.y -= scaledBox.min.y` および `wrapper.updateMatrixWorld(true)` 後の最終ワールド境界検証で底面を正確に接地するよう修正。
   - 地下基礎・突き出しパーツを持つ建物（`psx_japanese_house`, `tokyo_japanese_house__casa_japonesa_low_poly`, `japanese_restaurant_inakaya` 等）も埋設比率 `surfaceEmbedRatio` で地上基礎が地面に一致するよう補正。
3. **建物＋道路セット（ジオラマ型 GLB）の道路面高さ修正とコリジョン同期**:
   - `stylized_little_japanese_town_street.glb`・`night_city_japan.glb`・`japan_street.glb`・`buster_brown_shoe_store.glb` 等について、セット内の道路・地面プレート上面の実際の Y 座標を実行時計測（`detectDioramaRoadSurfaceOffsetY`）＋実測フォールバック比率（`surfaceEmbedRatio`）で求め、道路面が `Y = 0`（または歩道高さ `Y = 0.12m`）と一致するようモデル全体を下げて不要な厚い土台部分を地面下へ埋設。
   - 修正後の最終ワールド境界ボックス（`finalWorldBox`）に合わせて OBB コライダーの `minY` / `maxY`（地上部分 `Math.max(0, finalWorldBox.min.y)` 〜 `finalWorldBox.max.y`）を正確に同期。

---

### 作業ID: 1-D（日本の街区配置と衝突判定） & 1-E（Poly Haven 1K PBR・HDRI・環境仕上げ）
- **実施日**: 2026-11-25
- **コミットID**: `b5343ca`（`b5343cac3ca6197d5e892b27c6d1f043e1343fbd`）
- **GitHub Actions Run ID**: `45721122622`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）

#### 1. 日本の街区配置と衝突判定（1-D）— 検証ランク: 状態B（コード実装・CIビルド＆Pagesデプロイ成功／実画面描画＝状態C・実動作/衝突確認＝状態D・実機検証＝状態Eは未実施）
- `src/world/cityLayout.ts`・`src/world/cityBuilder.ts` を新設し、`docs/ASSET_MANIFEST.json` の承認済み GLB 全24種（`buildings` 12種・`vehicles` 9種・`props` 3種、計28インスタンス）を **160m × 160m の日本の街区**（中央交差点・片側2車線相当の十字車道・歩道4街区・商業/住宅/繁華街/駅前線路区画・路肩駐車車両・街の小物）としてすべて最低1つ以上配置。保留9アセットおよび箱モデル代用は一切未使用。
- 各 GLB はロード後に `Box3().setFromObject()` で実測バウンディングボックスを計測し、車は全長 `4.3〜4.7m` 前後（バイク `2.3m`・電車 `18m`）、建物は1階約 `3〜3.5m` 目安の現実的スケールへ自動調整、水平中心揃えおよび地面（車道 `Y = 0` / 歩道 `Y = 0.12`）への正確な接地を実施。
- M1 iPad Air 最適化として同時ロード数を最大 3 並列に制限し、同一 GLB の複数配置はテンプレートキャッシュから `clone(true)` で共有、高ポリゴンモデル（>150k tri 級）の `castShadow = false` とテクスチャ異方性最大 4 を適用。
- `src/world/collisionWorld.ts` を新設し、建物・車両・小物の 2D OBB コライダー（ロード前暫定登録→ロード後実測更新、壁ずり3回反復押し出し）と歩道縁石スロープ付き地面高さ判定を実装。`src/player/playerController.ts` へ非破壊で連携し、既存の徒歩移動・アニメーション・ジャンプ・TPSカメラ・iPadタッチ操作を維持。

#### 2. Poly Haven 1K PBR・HDRI・環境仕上げ（1-E）— 検証ランク: コード実装・CIビルド＆Pagesデプロイ成功（実画面描画＝状態C・実機検証＝状態Eは未実施）
- `src/world/environment.ts` を新設し、Poly Haven 公式 CC0 1K 素材（`asphalt_01`・`concrete_pavement`・`kloofendal_38d_partly_cloudy_puresky`）をランタイムで Poly Haven REST API / CDN から非同期取得して Diffuse / Normal / Roughness / PMREM 環境光＆背景へホットスワップ適用する仕組みを実装。
- オフライン環境や取得失敗時・初期描画時でも破綻しないよう、高品質なプロシージャル Canvas PBR テクスチャ（アスファルト粒状＋凹凸、歩道コンクリートタイル＋目地）およびプロシージャル青空ドーム＋軽量 `RoomEnvironment` PMREM を即座に適用するフォールバックを併設。
- 従来の仮デバッググリッドを撤去し、日本の道路標示（4方向横断歩道ゼブラ・停止線・中央線・車道外側線・歩道縁石）を構築。
- M1 iPad Air 最適化（WebGL2、DPR 1.0 基準・負荷に応じた `0.75〜1.25` 動的調整、シャドウマップ `1024px`、SSR/SSAO/DoF 無効）を維持。

#### 3. 変更ファイル一覧
- `src/world/collisionWorld.ts`（新規作成）
- `src/world/cityLayout.ts`（新規作成）
- `src/world/cityBuilder.ts`（新規作成）
- `src/world/environment.ts`（新規作成）
- `src/player/playerController.ts`（水平 OBB 衝突解決フック連携）
- `src/engine/scene.ts`（1-D / 1-E 統合、160m街区化、動的 DPR 調整）
- `src/App.tsx`・`src/ui/DebugHud.tsx`（街区ロード進捗・コライダー数・Poly Haven 環境ソース表示追加）
- `docs/ASSET_MANIFEST.json`（承認済み24アセットの配置情報および Poly Haven 1K 環境アセット記録を追記）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 1-B（人物表示） & 1-C（徒歩移動・三人称カメラ・iPadタッチ操作）
- **実施日**: 2026-11-25
- **コミットID**: `abd08be`（`abd08be96229cc91baff7beac2305def8582f38a`）
- **GitHub Actions Run ID**: `45659111031`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）

#### 1. プレイヤー表示（1-B）— 検証ランク: 状態B（コード実装・CIビルド＆デプロイ成功／実画面表示・実機確認は未実施）
- `src/player/playerModel.ts` を新設し、`public/assets/characters/player.glb`（`./assets/characters/player.glb`）を `GLTFLoader` で非同期読み込み。
- バウンディングボックス計測により身長を約 `1.7m` に正規化し、足裏を `Y = 0` へ接地、正面向き（`+Z`）で配置。
- `SkinnedMesh` の `frustumCulled = false` 設定、PBR マテリアルのテクスチャ異方性フィルタリング（最大 4）・軽量 `RoomEnvironment` PMREM 環境光適用、透過顔パーツ（目・眉・口）のシャドウアーティファクト防止（本体のみ `castShadow = true`）を実装。
- `player.glb` に実際に含まれる骨格情報（`MixamoArmature` / ルートボーン `mixamorig:Hips` / 全83ボーン）と全15アニメーションクリップ名を `docs/ASSET_MANIFEST.json` に記録。

#### 2. 徒歩移動・カメラ・iPad横画面タッチUI（1-C）— 検証ランク: コード実装・CIビルド＆デプロイ成功（実画面動作・iPad実機検証は未実施）
- `src/player/playerController.ts`: 移動速度に応じた `Idle` / `Walking` / `Running` のスムーズなクロスフェード切替、速度連動 `timeScale`、加減速・旋回補間、ジャンプ（`Jumping` / `FallingToLanding`）および基本地面衝突（`Y = 0`、ワールド境界クランプ）を独立モジュールとして実装。
- `src/camera/thirdPersonCamera.ts`: プレイヤー背後からの三人称視点（TPS）追従カメラ、水平・垂直回転、ズーム、地面めり込み防止クランプを独立モジュールとして実装。`DirectionalLight` の 1024px シャドウカメラもプレイヤー位置へ追従。
- `src/input/inputManager.ts`: タッチ入力と PC 入力（`WASD` / 矢印キー / `Shift` ダッシュ / `Space` ジャンプ / マウスドラッグ回転・ホイールズーム）を統合する独立モジュールを実装。
- `src/ui/TouchControls.tsx`: iPad 横画面（ランドスケープ）向けマルチタッチ操作 UI（画面左下：移動バーチャルスティック、画面右半分ドラッグ：カメラ回転、右下：ダッシュ・ジャンプボタン）を実装。
- `src/ui/DebugHud.tsx`: 画面左上に開閉可能な軽量 FPS・状態表示パネルを実装。

#### 3. 変更ファイル一覧
- `docs/ASSET_MANIFEST.json`（`player.glb` の骨格83ボーン・アニメーションクリップ15件を追記）
- `src/player/playerModel.ts`（新規作成）
- `src/player/playerController.ts`（新規作成）
- `src/camera/thirdPersonCamera.ts`（新規作成）
- `src/input/inputManager.ts`（新規作成）
- `src/ui/TouchControls.tsx`（新規作成）
- `src/ui/DebugHud.tsx`（新規作成）
- `src/engine/scene.ts`（1-B / 1-C 統合、軽量 PMREM 環境光・接地シャドウプレーン・シャドウ追従追加）
- `src/App.tsx`（`startGameEngine`, `TouchControls`, `DebugHud` 連携）
- `src/index.css`（iPad 横画面タッチ UI・開閉可能 HUD スタイル追加）
- `docs/PROGRESS.md`（本記録を更新）

#### 4. ビルド・デプロイおよび検証状況
- **ローカル環境**: オフライン環境制約のため `npm run build` は未実行。
- **GitHub Actions（CI / Pages）**: `Deploy to GitHub Pages`（Run ID `45659111031`）にて `npm install && npm run build`（`tsc && vite build`）および GitHub Pages（`https://sokubouzu.github.io/my-3d-game/`）へのデプロイ成功を確認済み。
- **検証ランクの明記**:
  - `player.glb` アセット単体: 既存の検証記録通り **状態D**（ヘッドレス Chromium 検証済み、実機未検証）。
  - 今回の `1-B` / `1-C` 統合アプリ実装: **コード構築・CIビルド＆GitHub Pages デプロイ成功（アプリ内描画＝状態C、アプリ内動作＝状態D、iPad Air 第5世代実機検証＝状態E はいずれも未検証）**。

---

### 作業ID: 0-C（素材棚卸し） & 1-A（最小起動基盤・GitHub Pages設定）
- **実施日**: 2026-11-25
- **コミットID**: `0c5e527`

#### 1. 素材棚卸し（0-C）— 検証ランク: 状態B
- ルート直下に配置されていた4つの `.glb` ファイルを調査し、用途別ディレクトリへ移動（ルート直下の元ファイルは削除済み）：
  - `night_city_japan.glb` → `public/assets/buildings/night_city_japan.glb`
  - `stylized_little_japanese_town_street.glb` → `public/assets/buildings/stylized_little_japanese_town_street.glb`
  - `vancouver_police_-_cambie_st._vancouver_bc_ca.glb` → `public/assets/buildings/vancouver_police_-_cambie_st._vancouver_bc_ca.glb`
  - `road_pack_not_including_the_road.glb` → `public/assets/props/road_pack_not_including_the_road.glb`
- 全34アセットのメタデータ（作者・ライセンス・URL）・ポリゴン数・解像度・バウンディングボックス寸法・Draco圧縮の有無を解析し、`docs/ASSET_MANIFEST.json` に記録：
  - 承認済み（CC-BY / Mixamo）: 25件
  - 保留（ライセンス不明のため配置対象外）: 9件
  - Draco圧縮済み: 4件（今回追加分）
- `README.md` の `## Credits / Assets License` に上記4件の CC-BY-4.0 アセットを追記。

#### 2. 最小起動基盤と GitHub Pages 設定（1-A）— 検証ランク: コード構築済み（ビルドは GitHub Actions にて検証済み）
- Vite + React + TypeScript + Three.js（WebGL2、M1 iPad Air向け DPR 1.0 基準、シャドウマップ 1024px、ポストプロセス無効）のモジュール分割構成を構築。
- `DRACOLoader` は Google 公式 CDN（`https://www.gstatic.com/draco/versioned/decoders/1.5.7/`）参照で初期設定。
- GitHub Pages（`https://sokubouzu.github.io/my-3d-game/`）向けに `vite.config.ts` へ `base: './'` を設定。
- `.github/workflows/deploy.yml` は GitHub Web 画面より手動登録完了（`ed27a04`）。

---

## 次回予定
- **実機確認**: GitHub Pages（`https://sokubouzu.github.io/my-3d-game/`）を iPad Air 第5世代（横画面）および PC ブラウザで開き、1-B / 1-C の描画・操作・FPS を確認。
- **次フェーズ**: 実機確認後、次の作業IDへ進行。
