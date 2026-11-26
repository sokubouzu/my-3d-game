# 開発進捗記録（PROGRESS.md）

## 現在のステータス
- **完了済み作業ID**: `0-C`（素材棚卸し）、`1-A`（最小起動基盤・GitHub Pages設定）、`1-B`（人物表示）、`1-C`（徒歩移動・三人称カメラ・iPadタッチ操作）、`1-D`（日本の街区配置と衝突判定 + 実機テスト修正）、`1-E`（Poly Haven 1K PBR・HDRI・環境仕上げ）
- **次回作業ID**: `2-A`（iPad実機再確認後の次フェーズ）
- **関連コミットID**: `6b8976b`（1-D 実機テスト不具合3点修正）、`b5343ca`（1-D / 1-E 実装）、`abd08be`（1-B / 1-C 実装）、`0c5e527`（0-C / 1-A）

---

## 作業履歴

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
