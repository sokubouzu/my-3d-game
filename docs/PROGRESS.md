# 開発進捗記録（PROGRESS.md）

## 現在のステータス
- **完了済み作業ID**: `0-C`（素材棚卸し）、`1-A`（最小起動基盤・GitHub Pages設定）、`1-B`（人物表示）、`1-C`（徒歩移動・三人称カメラ・iPadタッチ操作）
- **次回作業ID**: `2-A`（実機確認後の次フェーズ）
- **関連コミットID**: `abd08be`（1-B / 1-C 実装）、`0c5e527`（0-C / 1-A）

---

## 作業履歴

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
