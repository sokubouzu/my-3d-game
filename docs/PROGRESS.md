# 開発進捗記録（PROGRESS.md）

## 現在のステータス
- **完了済み作業ID**: `0-C`（素材棚卸し）、`1-A`（最小起動基盤・GitHub Pages設定）
- **次回作業ID**: `1-B`
- **関連コミットID**: `0c5e527`

---

## 作業履歴

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

#### 2. 最小起動基盤と GitHub Pages 設定（1-A）— 検証ランク: コード構築済み（ビルドは GitHub Actions にて検証予定）
- Vite + React + TypeScript + Three.js（WebGL2、M1 iPad Air向け DPR 1.0 基準、シャドウマップ 1024px、ポストプロセス無効）のモジュール分割構成を構築。
- `DRACOLoader` は Google 公式 CDN（`https://www.gstatic.com/draco/versioned/decoders/1.5.7/`）参照で初期設定。
- GitHub Pages（`https://sokubouzu.github.io/my-3d-game/`）向けに `vite.config.ts` へ `base: './'` を設定。
- `.github/workflows/deploy.yml` は `workflow` スコープ制約のためコミットから除外し、GitHub Web 画面より手動登録予定。

#### 3. 変更ファイル一覧
- `docs/ASSET_MANIFEST.json`（新規作成）
- `docs/PROGRESS.md`（新規作成）
- `README.md`（CC-BY クレジット4件追記）
- `public/assets/buildings/night_city_japan.glb`（移動）
- `public/assets/buildings/stylized_little_japanese_town_street.glb`（移動）
- `public/assets/buildings/vancouver_police_-_cambie_st._vancouver_bc_ca.glb`（移動）
- `public/assets/props/road_pack_not_including_the_road.glb`（移動）
- `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`（新規作成）
- `src/engine/config.ts`, `src/engine/renderer.ts`, `src/engine/loaders.ts`, `src/engine/scene.ts`, `src/App.tsx`, `src/main.tsx`, `src/index.css`（新規作成）

#### 4. ビルド結果
- **ローカル環境**: オフライン環境制約（`registry.npmjs.org` への `EAI_AGAIN`）により `npm install` が未実行のため、**ローカルでの `npm run build` は未検証**。
- **CI / GitHub Pages**: `.github/workflows/deploy.yml` を GitHub Web 画面から手動登録後、GitHub Actions 上で `npm install && npm run build` および GitHub Pages デプロイを実行・検証予定。

---

## 次回予定
- **作業ID**: `1-B`（GitHub Actions ビルド結果確認後、次のフェーズへ進行）
