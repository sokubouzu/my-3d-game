# 開発進捗記録（PROGRESS.md）

## 現在のステータス
- **完了済み作業ID**: `0-C`（素材棚卸し）、`1-A`（最小起動基盤・GitHub Pages設定）、`1-B`（人物表示）、`1-C`（徒歩移動・三人称カメラ・iPadタッチ操作）、`1-D`（日本の街区配置と衝突判定 + 単体厳選＆埋まり/浮き解消修正）、`1-E`（Poly Haven 1K PBR・HDRI・環境仕上げ）、**PHASE 1 実機検証完了**、`2-A`（運転可能な主役車両1台の表示・構造確認・`src/vehicle/` 土台）、`2-B`（主役車両への乗降・運転物理・車輪回転・運転カメラ・iPad運転タッチUI + 3台セットミニチュア車両修正）、`2-C`（カメラの建物遮蔽回避・主役車両110km/h化・街区配置済みスポーツカーの運転車両化160km/h）、`3-A`（iPadタッチ操作UI消失不具合修正 + AI交通車両4台の左側通行自動走行システム）、`3-B`（車同士のめり込み防止修正 + 歩道を歩くAI歩行者6人 + 日本式信号サイクル連動）、`3-C`（通行人の服装・髪色・身長バリエーション追加 + 画面右上の軽量2D Canvasミニマップ + 運転中の右下デジタルスピードメーター）、`3-D`（iPad Safari対応の音響システム・通常車実用車化＆スポーツカー差別化調整）、`3-E`（街区配置済みバイク `Harley Custom Bike` の3台目運転可能車両化：135km/h・車体バンク演出・跨がり乗車姿勢・バイク専用エンジン音）、`3-F`（車・バイク運転時のiPadタッチアクセル操作性＆速度調整改善：3段階走行モード速度リミッター・縦位置可変スロットル・自然な惰性走行）、`3-G`（昼・夕方・夜の時間帯切替システム ＋ 車両ヘッドライト・街灯・信号・建物窓の発光演出）、`4-A`（街エリアの拡張：360m外周道路ループ・都市公園・駅前ロータリー広場 ＋ 日本の街並み装飾 ＋ ミニマップ自動同期）、`4-B（歩行者多様化）`（AI歩行者のクローン感解消：CC0人物モデル8種自動導入 ＋ 大人/子供年齢層・体型差・3D装着パーツ・肌/髪/服装カラー＆歩調テンポ多様化）、`4-A 品質調整`（夜間・夕方ライティング＆発光バランス適正化・外周道路16m/R42高速走行対応・ガードレール/標識の干渉解消・公園/駅前広場のZファイティング解消＆プロップ歩道外縁整列）、`4-B（ゲームプレイ要素まとめ実装）`（街中＆公園38枚ゴールドコイン収集・8ゲートチェックポイントタイムアタック・専用効果音・ワンタップ車体復帰ボタン・ミニマップ連動・localStorage自動保存）、`5-A`（天候切替システム：晴れ・曇り・雨・霧 ＋ カメラ追従軽量雨粒パーティクル ＋ 濡れた路面・車体表現 ＋ Web Audio 手続き型雨音）、`5-B`（リアル車両ダメージ・車体メッシュ局所凹み・擦り傷/煤・ライト破損点滅・白煙/黒煙・リングバッファ路面オイル漏れ・発火カウントダウン＆大爆発・自動緊急脱出＆近接道路自動リスポーン）、**`5-B2`（車両爆発炎上演出のリアル化＆スポーツカー前後表示崩れ修正：動的CanvasTexture炎/煙/火花・5段階ダメージ・爆発車体跳ね上がり＆破片飛散バウンド・8〜10秒炎上継続＆揺らぎPointLight＆鎮火フェード・Porsche 911 Turbo 影プレーン除去＆ライト精密配置）**
- **次回作業ID**: `5-C`（警察AI・パトカー追跡システム。iPad Air 第5世代実機での PHASE 5-B2 スポーツカー表示・爆発炎上演出・60FPS維持検証完了後に進行）
- **関連コミットID**: `983879c`（5-B2 車両爆発炎上演出のリアル化＆スポーツカー前後表示崩れ修正）、`338ddef` / `3d5d3df`（5-B リアル車両ダメージ・車体メッシュ局所凹み・擦り傷/煤・ライト破損点滅・白煙/黒煙・リングバッファ路面オイル漏れ・発火2.5秒カウントダウン＆大爆発・自動緊急脱出＆近接道路自動リスポーン）、`9445f31`（5-A 天候切替システム：晴れ・曇り・雨・霧＋雨粒LineSegments＋濡れた路面/車体roughness調整＋手続き型雨音）、`083df60`（4-B コイン収集38枚・タイムアタック8ゲート・専用効果音・車体復帰ボタン・ミニマップ連動・localStorage自動保存）、`fc850e0`（4-A 品質調整：夜間ライティング/発光バランス・外周道路16m/R42化・ガードレール/標識干渉解消・公園/広場Zファイティング解消＆プロップ整列）、`953089e`（4-B CC0人物モデル8種自動導入・年齢層/体型・3D装着パーツ・カラー/歩調多様化）、`89799ed`（4-A 360m外周道路ループ・都市公園・駅前ロータリー広場・夜間発光自販機/看板・Instancedガードレール/標識/街路樹・ミニマップ自動同期）、`63aa4b0`（3-G 昼・夕方・夜時間帯切替・車両ライト＆前方SpotLight・街灯/信号/建物窓発光演出）、`3040ba2`（3-F 走行モード速度リミッター・可変スロットル・自然な惰性走行）、`bd8b30e`（3-E 街区配置済みバイクの運転乗り物化・135km/h・バンク演出・跨がり姿勢・バイク専用排気音）、`2fcf9a5`（3-D 通常乗用車エンジン音の静かな実用車化＆スポーツカー差別化調整）、`ef916cf`（3-D iPadOS Safari無音不具合修正・同期アンロック＋中音域＆ゲイン最適化）、`2cfcaf1` / `f6c8486`（3-D iPad Safari対応Web Audio手続き型音響システム・ミュートUI）、`ebe049e`（3-C 通行人バリエーション・軽量2Dミニマップ・運転デジタル速度計）、`5dba266`（3-B 車両OBBめり込み防止・AI歩行者6人・日本式信号サイクル連動）、`7c84879`（3-A iPadタッチUI消失修正・AI交通車両4台の自動走行システム）、`2156aa0`（2-C カメラ遮蔽回避・110km/h化・Porsche 911 Turbo 運転車両化160km/h）、`7a16542`（2-B 運転物理・乗降・運転カメラ/UI・ミニチュア3台セット車両修正）、`460bdb6`（2-A 主役車両配置＆リグ土台・歩道境界つまづき修正）、`f3e12dc`（1-D ジオラマ除外＆単体Y=0厳密接地修正）、`6b8976b`（1-D 飛行機除外等）、`b5343ca`（1-D / 1-E 実装）、`abd08be`（1-B / 1-C 実装）、`0c5e527`（0-C / 1-A）

---

## 作業履歴

### 作業ID: 5-B2（車両の爆発炎上演出のリアル化＆スポーツカー前後の表示崩れ修正）
- **実施日**: 2026-11-27
- **コミットID**: `983879c`（`983879cbc514f9baa6d37ee66f6d155385939a4a`）
- **GitHub Actions Run ID**: `46011105634`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・リモートCIでの `tsc` 型チェック＆`vite build`・GitHub Pagesデプロイ成功／実ブラウザでのスポーツカー前後表示＆5段階炎上爆発の描画確認＝状態C・車体跳ね上がり/破片バウンド/鎮火リスポーン動作確認＝状態D・iPad Air 第5世代実機での60FPS維持検証＝状態Eは未実施）

#### 実装内容
1. **乗れるスポーツカー（1975 Porsche 911 930 Turbo）前後の表示異常の原因特定と修正（`src/vehicle/vehicleConfig.ts`, `src/vehicle/vehicleModel.ts`, `src/vehicle/vehicleLights.ts`, `src/vehicle/vehicleDamageVisuals.ts`）**:
   - **原因1（GLB内蔵ベイク影プレーンによるBBox膨張＆前後飛び出し）**: `free_1975_porsche_911_930_turbo.glb` 内部に 4 頂点の平面ベイク影メッシュ（`Plane.015_62` / `Object_140`、`material_0`、`Y = 0.016`、`Z: -2.15..+2.15`）が含まれており、車体実寸が約 22% 縮小された上に前後へ暗い半透明シートが突き出し、さらに正規化寸法（`L=4.30m, W=2.15m`）が実ボディ（`L=3.37m, W=1.49m`）より大きく膨張していた。
   - **原因2（汎用角型ライトボックスの宙浮き飛び出し＆アンテナによる高さ膨張）**: `createVehicleLightRig` が膨張後 BBox の両端（`z = ±length * 0.482`）に角型 `BoxGeometry` を配置していたため、車体前後から約 38〜40cm 離れた空中に灰・赤の箱が浮く状態になっていた。またフェンダーアンテナ（`Object_49` / `Object_76`）により垂直 BBox が `1.648m`（ルーフ実高 `1.264m`）へ膨らみ、さらにクリアコート層（`coat`）がガラス扱い（`0.35x` 変形）となって衝突変形時に塗装と乖離する問題もあった。
   - **修正内容**:
     - `HeroVehicleConfig` に `excludeNodeNames`・`bodyHeightOverrideMeters`・`lightLayout` を追加し、`loadHeroVehicle` で BBox 計測前に `Plane.015_62` / `Object_140` を完全除去＆破棄（車体が本来の `4.30m × 1.91m`・タイヤ径 `0.63m` で正確接地）。
     - `bodyHeightOverrideMeters: 1.27` によりエンジン煙・炎上・擦り傷パッチ・前方 `SpotLight` の高さをポルシェの低い車体形状へ一致。
     - `VehicleLightRig` へ丸型フロントレンズ（チルト `-0.32 rad`）・曲面追従リアテール・`hideMeshWhenOff: true` を実装し、ポルシェ実測レンズ座標（フロント `x=±0.639, y=0.633, z=1.855` / リア `x=±0.49, y=0.530, z=-1.964`）へ精密埋め込み（昼消灯時は GLB 本来のレンズを表示、夕方・夜に自然な発光＆破損点滅）。
     - `VehicleDamageVisualController` でクリアコート（`coat`）をガラス除外対象から外してボディ塗装と 1:1 同時変形させ、擦り傷パッチのクランプ範囲も曲面フェンダーに合わせて適正化。
2. **リアルな 5 段階ダメージ進行〜爆発炎上・飛散破片・車体跳ね上がり・鎮火フェードアウト＆自動リスポーン（`src/vehicle/vehicleDamageEffects.ts`, `src/vehicle/vehicleController.ts`, `src/vehicle/vehicleDamageVisuals.ts`, `src/audio/soundManager.ts`, `src/engine/scene.ts`, `src/ui/DebugHud.tsx`）**:
   - **高品質プロシージャル `CanvasTexture`（箱・球パーティクル廃止）**: 起動時にオフスクリーン Canvas で「柔らかい炎用（中心白→黄→オレンジ→赤橙→透明、多層ローブ）」「濃い煙用（20パフのノイズ雲状、エッジ完全透明マスク）」「火花用（細長い発光ストリーク）」を生成。炎・火花は `AdditiveBlending`（`depthWrite: false`・速度方向配向＆寿命色遷移）、煙は `NormalBlending`（回転ビルボード＋風ドリフト）で各 1 ドローコール描画。
   - **5段階ダメージ進行**:
     1. **軽傷（HP 70%以下）**: ボンネット／エンジン部から細い白煙が街の風に流されながら上昇。
     2. **中傷（HP 45%以下）**: 濃いグレー〜黒煙へ変化し増量、走行中の路面に光沢のある黒いオイル漏れ痕が点々と残り、時折エンジン付近からパチパチ火花が散る。
     3. **炎上直前（HP 15%以下〜0%）**: ボンネットから赤い火柱と黒煙が吹き出し、約 2.5 秒間の緊急警告音とともに火勢・照り返しが急拡大（脱出猶予）。
     4. **大爆発の瞬間**: 0.25 秒で鋭く減衰する強いオレンジ閃光 `PointLight`（常設・影オフ）＋地面付近へ広がる半透明衝撃波リング＋強化カメラシェイク＋サブベース追加の重低音爆発音（Web Audio）。さらに爆発衝撃で**車体自体が宙へ跳ね上がって傾き、ドスンと地面へ落下バウンドする物理リアクション＆着地音（`playBlastThud`）**、およびタイヤ・ボンネット片・バンパー片・大小金属破片（計 16〜22 個、一部煙の尾付き）が放射状に吹き飛び地面で 1〜2 回バウンド＆転がる演出を `InstancedMesh` 4 ドローコール・プール再利用・`castShadow = false` で実装。
     5. **炎上継続〜鎮火＆自動リスポーン**: 爆発後も黒焦げ残骸が約 7.6 秒間激しく燃え続け（多層の炎＋高く立ち昇る黒煙＋火の粉＋常設 1 基の揺らぐ赤オレンジ `PointLight` による路面照り返し）、7.6〜9.5 秒で鎮火、9.5〜10.5 秒でスムーズにフェードアウトしたのち、近くの安全な道路上へ新品車両が自動リスポーン。

#### 変更ファイル一覧
- `src/vehicle/vehicleLights.ts`（`VehicleLightLayout`・丸型前照灯/チルト・曲面テール・`hideMeshWhenOff` 追加）
- `src/vehicle/vehicleConfig.ts`（`excludeNodeNames` / `bodyHeightOverrideMeters` / `lightLayout` 追加、Porsche 911 Turbo 修正設定）
- `src/vehicle/vehicleModel.ts`（不要 GLB ノード事前除去＆破棄、実効車体高反映、カスタムライトレイアウト連携）
- `src/vehicle/vehicleDamageVisuals.ts`（クリアコート 1:1 変形修正、擦り傷クランプ適正化、炎上赤熱グロー＆鎮火フェードアウト対応）
- `src/vehicle/vehicleDamageEffects.ts`（炎・ノイズ煙・速度配向火花 CanvasTexture、回転ビルボード、4種 InstancedMesh バウンド飛散破片＋煙の尾、0.25秒閃光＆揺らぎ炎上 PointLight プール）
- `src/vehicle/vehicleController.ts`（HP 70%/45%/15% の5段階進行、爆発時車体跳ね上がり＆傾き落下バウンド物理、10.5秒炎上継続〜鎮火〜フェードアウト〜自動リスポーン制御）
- `src/vehicle/index.ts`（`VehicleLightLayout` 型エクスポート追加）
- `src/audio/soundManager.ts`（重低音サブベース追加の爆発音強化、跳ね上がり落下着地音 `playBlastThud` 追加）
- `src/engine/scene.ts`（常設炎上揺らぎ PointLight 集約制御、着地音＆二次シェイク連動、自動復帰メッセージ更新）
- `src/ui/DebugHud.tsx`（Phase 5-B2 表示更新）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 5-B（リアル車両ダメージ・オイル漏れ・爆発炎上＆自動リスポーン）
- **実施日**: 2026-11-26
- **コミットID**: `338ddef`（`338ddefc7178c06731a441e4984df6d4e39dc1a2`）／ `3d5d3df`（`3d5d3df45ea17bb84320eca34ae0145b6f222a56`）
- **GitHub Actions Run ID**: `45809235343`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・リモートCIでの `tsc` 型チェック＆`vite build`・GitHub Pagesデプロイ成功／実ブラウザでの3車種凹み/傷/煙/オイル漏れ/爆発描画確認＝状態C・衝突ダメージ/緊急脱出/自動リスポーン動作確認＝状態D・iPad Air 第5世代実機での60FPS維持検証＝状態Eは未実施）

#### 実装内容
1. **スピード＆入射角連動の衝突判定と耐久度（HP 100%〜0%）・状態インジケーター（`src/world/collisionWorld.ts`, `src/vehicle/vehicleController.ts`, `src/ui/TouchControls.tsx`, `src/camera/thirdPersonCamera.ts`, `src/audio/soundManager.ts`）**:
   - `CollisionWorld.resolveVehicleCollision` を拡張し、建物・ガードレール・街灯・AI交通車両・駐車車両・外周壁との衝突ワールド座標 `(contactX, contactZ)` と衝突対象IDを返すよう改良。
   - 乗用車（Innova）・スポーツカー（Porsche 911 Turbo）・バイク（Harley Custom Bike）の3車種すべてに耐久度（`100%〜0%`）を実装し、衝突速度と入射角から衝撃エネルギーを算出（軽い接触＝小ダメージ、高速正面衝突＝大ダメージ、連続多段ヒット防止クールダウン付き）。
   - 衝突瞬間に金属火花パーティクル・Web Audio 手続き型の金属衝突音（低中音インパクト＋金属リンギング倍音＋バンドパスクラッシュノイズ）・カメラ衝撃シェイク（`ThirdPersonCamera.addShake`）を発生。
   - スピードメーター内下部へ車/バイク別のコンパクトな車両状態アイコン・状態ラベル（`良好`/`損傷`/`重破`/`エンジン不調`/`発火危険!`）・HP％・カラー耐久度ゲージを配置。
2. **リアルな段階的損傷ビジュアルとオイル漏れ（`src/vehicle/vehicleDamageVisuals.ts`, `src/vehicle/vehicleDamageEffects.ts`, `src/vehicle/vehicleLights.ts`, `src/vehicle/vehicleModel.ts`）**:
   - **車体メッシュの局所変形（凹み）**: 初期化時に回転車輪を除く全ボディメッシュの初期頂点配列・初期法線配列および `bodyGroup` ローカル座標キャッシュを保持。衝突時に衝撃点周辺の頂点をコサイン減衰＋微細しわで衝撃方向へ実際に凹ませ、リスポーン時は初期頂点配列から新品ボディへ完全復元する仕組みを実装。
   - **傷・汚れ・煤（すす）・ライト破損**: 損傷度に応じてボディマテリアルの `roughness` 増加・煤暗化を天候の雨濡れ質感（5-A `rainAmount`）と競合なく合成適用し、衝突面付近へ共有プロシージャル256pxテクスチャの擦り傷/煤パッチを配置。`VehicleLightRig` の左右ヘッドライトを独立制御化し、中破（HP 62%以下）で片側ヘッドライトがチカチカ点滅、重破（HP 35%以下）で片側完全消灯＋もう片側不安定点滅（前方 `SpotLight` にも連動）、発火/全損で全灯消灯となるよう実装。
   - **煙・火花・路面オイル漏れ・エンジン不調**:
     - 耐久70%以下：エンジン付近から薄い白煙パーティクル（1ドローコール固定プール `THREE.Points`）が上昇。
     - 耐久40%以下：濃い黒煙＋時折散る小さな火花（1ドローコール固定バッファ `THREE.LineSegments`）に加え、走行中の路面上に黒いオイル漏れ痕（固定容量96枚のリングバッファ `THREE.InstancedMesh`・1ドローコール・`polygonOffset` 付き）を点々と残す設計とした。
     - 耐久30%以下：エンジン不調による最高速のわずかな低下（最大18%減）・加速息継ぎ・速度連動のわずかなステアリングブレを追加。
3. **爆発炎上・緊急脱出・約9秒後の近接道路自動リスポーン（`src/vehicle/vehicleController.ts`, `src/player/playerController.ts`, `src/engine/scene.ts`, `src/ui/Minimap.tsx`, `src/App.tsx`, `src/index.css`）**:
   - HP 0% 到達で車体が激しく発火し、約 **2.5秒間** の緊急警告音（ピピピピ…、爆発直前へ向けテンポアップ）と画面警告バナーを表示（発火中は速度制限なしで「脱出！」ボタンから即飛び降り可能）。
   - カウントダウン終了で大爆発（64粒火球・46粒爆発黒煙・72本火花・衝撃波リング・常設影オフ `PointLight` フラッシュ・路面焦げ跡・多層 Web Audio 爆発音・大カメラシェイク）を起こし、黒焦げ残骸（運転不可）へ移行。
   - 爆発時にまだ乗車中だった場合は自動で車外へ緊急脱出（`PlayerController.triggerEmergencyEject` による吹き飛びホップ＆着地モーション＋非グロテスクなオレンジ琥珀ビネットフラッシュ）。
   - 全損から **約9秒後**（8〜10秒）にプレイヤー近くの安全な道路上（`findNearestSafeRoadPose`、プレイヤー直上回避保護付き）へピカピカの同型車両（HP100%・凹み/傷/ライト完全復元）を自動スポーンし、通知トーストとミニマップ通常アイコン復帰を自動連動。

#### 変更ファイル一覧
- `src/vehicle/vehicleDamageVisuals.ts`（新規作成：車体頂点局所デフォーム＆復元・傷/煤/黒焦げ＆雨濡れ合成・擦り傷デカールパッチ・破損ヘッドライト点滅制御）
- `src/vehicle/vehicleDamageEffects.ts`（新規作成：共有固定バッファ火花 `LineSegments`・煙/炎カスタムシェーダ `Points`・96枚リングバッファ路面オイル漏れ/焦げ跡 `InstancedMesh`・衝撃波リング＆常設爆発フラッシュ）
- `src/world/collisionWorld.ts`（`VehicleCollisionResult` へ衝突ワールド座標 `contactX`/`contactZ` および `hitColliderId` 追加）
- `src/vehicle/vehicleLights.ts`（左右ヘッドライト独立マテリアル化・破損点滅/消灯用 `setDamageMultipliers` 追加）
- `src/vehicle/vehicleModel.ts`・`src/vehicle/index.ts`（`VehicleDamageVisualController` 統合・新規型/クラスエクスポート）
- `src/vehicle/vehicleController.ts`（3車種耐久度・速度＆入射角連動衝撃計算・局所凹み連携・HP30%以下エンジン不調＆ステアブレ・白煙/黒煙/火花/オイル漏れ/発火2.5秒/大爆発/9秒後完全修復リスポーン管理）
- `src/camera/thirdPersonCamera.ts`（衝突＆爆発カメラシェイク `addShake` 追加）
- `src/player/playerController.ts`（爆発時自動緊急脱出ホップ＆着地演出 `triggerEmergencyEject` 追加）
- `src/audio/soundManager.ts`（金属衝突音強化・発火緊急警告音 `playFireWarningBeep`・多層爆発衝撃音 `playExplosion` 追加）
- `src/engine/scene.ts`（`VehicleDamageEffects` 統合・全車両ダメージライフサイクル＆緊急脱出＆近接安全道路自動リスポーン・破損ヘッドライト `SpotLight` 連動・ミニマップ残骸/発火同期）
- `src/ui/TouchControls.tsx`・`src/ui/Minimap.tsx`・`src/ui/DebugHud.tsx`・`src/App.tsx`・`src/index.css`（スピードメーター内コンパクト耐久度ゲージ＆車/バイクアイコン・発火警告バナー・緊急脱出ビネットフラッシュ・自動復帰トースト・ミニマップ残骸/発火/復帰表示・Phase 5-B HUD更新）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 5-A（天候切替システム：晴れ・曇り・雨・霧 ＋ 濡れた路面・車体 ＋ 手続き型雨音）
- **実施日**: 2026-11-26
- **コミットID**: `9445f31`（`9445f3146a80837bffb86711da6c7d3cdb048b55`）
- **GitHub Actions Run ID**: `45791555151`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・リモートCIでの `tsc` 型チェック＆`vite build`・GitHub Pagesデプロイ成功／実ブラウザでの4天候×昼夕夜描画確認＝状態C・天候遷移/雨粒/濡れ路面/雨音再生＆停止の動作確認＝状態D・iPad Air 第5世代実機での60FPS維持検証＝状態Eは未実施）

#### 実装内容
1. **ワンタップ天候切替 UI（`src/App.tsx`, `src/index.css`, `src/ui/DebugHud.tsx`）**:
   - 画面上部・時間帯切替＆音声ミュートボタン直下（ミニマップ左隣の空き領域、`top: 64px`, `right: 164px`, `height: 44px`）に、タップごとに **`晴れ（SUNNY）` → `曇り（CLOUDY）` → `雨（RAIN）` → `霧（FOG）`** を循環切替できるピル型ボタン（`.weather-btn`）を追加。
   - 中央HUDやカメラ操作領域を圧迫せず、既存ボタンとの間隔を確保して iPad 横画面タッチ時の誤タップを防止。開閉式デバッグHUDへ現在天候表示と `Phase 5-A` 表記を追加。
2. **4種類の天候ビジュアルと昼・夕方・夜の掛け合わせ（`src/world/weather.ts`, `src/world/timeOfDay.ts`, `src/world/environment.ts`）**:
   - `WeatherController`（`src/world/weather.ts`）を新規作成し、ゼロアロケーション指数補間の `WeatherLightingModifier` を `TimeOfDayController` へ渡すことで、**晴れ・曇り・雨・霧 × 昼・夕方・夜（全12通り）**を既存の街灯・信号・建物窓・車体ライト点灯ロジックと破綻なく連動させた。
   - 初期状態から一貫して `THREE.FogExp2` を使用し（天候切替時の WebGL2 シェーダ再コンパイルを回避）、スカイドームシェーダへ `#include <tonemapping_fragment>` / `#include <colorspace_fragment>` を追加して霧色と空の地平線が継ぎ目なく溶け合う設計とした。
   - **晴れ（SUNNY）**: 従来のクリアな空・日差し・昼間 HDRI 背景・軽量フォグを維持（他天候から戻った際に HDRI 背景も自動で復帰）。
   - **曇り（CLOUDY）**: 空・背景を曇天トーンへシフトし、太陽光（`DirectionalLight`）を `0.42` 倍へ弱めつつ環境光（`HemisphereLight`）を `1.22` 倍へ引き上げ。
   - **雨（RAIN）**:
     - やや暗い曇天ベースライティング＋日中雨天時の車両ヘッドライト補助点灯（`headlightFloor: 0.65`）で濡れた路面への映えを強化。
     - カメラ前方寄り周辺に追従する **850粒・1ドローコールの軽量雨粒 `THREE.LineSegments`**（固定 `Float32Array` バッファ再利用、`castShadow = false`、雨天以外では完全非表示＆更新スキップ）を実装。
     - **濡れた路面・車体表現**: 雨天時のみ共有 `asphaltMaterial`（`roughness: 0.92 → 0.24`, `metalness: 0.04 → 0.16`, `envMapIntensity: 1.0 → 1.50`）・`pavementMaterial`（`roughness: 0.86 → 0.34`）および全車両（運転可能3台・AI交通4台・駐車車両4台）のボディマテリアル（`roughness` 下限 `0.22`、タイヤ `0.35`）を滑らかに濡れ質感へ変化させ、他天候へ戻すと元の値へ完全復元（SSR・Reflector・影追加は一切不使用）。
   - **霧（FOG）**: `FogExp2` 密度を `0.0185` まで引き上げ、時間帯別の霧色（昼の乳白霧・夕方の暖色霧・夜の青灰霧）へ空と背景をなじませて視界が霧に包まれる表現を実現（日中霧時はヘッドライト補助点灯 `0.55`）。
3. **Web Audio 手続き型「雨音」連動（`src/audio/soundManager.ts`）**:
   - 既存の iPad WebKit 同期アンロック済み `AudioContext`・`masterGain`（ミュート・コンプレッサー・バックグラウンド復帰）および共有ノイズバッファ（`pinkNoiseBuffer` / `whiteNoiseBuffer`）を再利用。
   - ピンクノイズの穏やかな雨ベース（`420Hz〜2900Hz`＋低速 LFO 揺らぎ）＋ホワイトノイズの高域雨粒感（`2400Hz` バンドパス）で構成した軽量フィルターバスを構築し、`setRainActive(true)` でフェードイン再生、他天候へ切り替わると滑らかにフェードアウトしたのちソースを完全停止（非雨天時はオーディオ CPU 負荷ゼロ）。

#### 変更ファイル一覧
- `src/world/weather.ts`（新規作成：4天候プリセット補間・850粒固定配列雨粒 `LineSegments`・濡れた路面＆車体マテリアル可逆調整）
- `src/world/timeOfDay.ts`（`WeatherLightingModifier` 統合・`THREE.FogExp2` 統一・トーンマップ一致スカイドーム・昼晴天 HDRI 背景の確実な復帰）
- `src/world/environment.ts`（初期フォグを `THREE.FogExp2` 化・`setDayHdriBackgroundVisible` の実表示成否返却）
- `src/world/cityBuilder.ts`・`src/traffic/trafficManager.ts`（駐車車両および AI 交通車両ロード完了時の濡れマテリアル登録フック追加）
- `src/audio/soundManager.ts`（雨天時限定ループ再生・フェードイン/フェードアウト＆完全停止の手続き型雨音 `setRainActive` 追加）
- `src/engine/scene.ts`（`WeatherController` 統合・道路＆全車両登録・`cycleWeather` 公開・雨音連動・リソース解放）
- `src/App.tsx`・`src/index.css`・`src/ui/DebugHud.tsx`（ワンタップ天候切替ボタン・4天候アイコン＆テーマ・デバッグHUD天候表示追加）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 4-B（コイン収集・チェックポイントタイムアタック・専用効果音・車体復帰ボタン・ミニマップ連動・記録自動保存のまとめ実装）
- **実施日**: 2026-11-26
- **コミットID**: `083df60`（`083df60f27afad163596fcf97cdbb00fa916ff61`）
- **GitHub Actions Run ID**: `45777859931`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザでの3Dコイン＆発光ゲート描画確認＝状態C・コイン獲得/タイムアタック計測/効果音再生/車体復帰/localStorage保存の動作確認＝状態D・iPad Air 第5世代実機での60FPS維持検証＝状態Eは未実施）

#### 実装内容
1. **街中＆公園のゴールドコイン収集システム（`src/gameplay/collectibles.ts`）**:
   - 市街地（10枚）・都市公園「さくら中央公園」（8枚）・駅前ロータリー広場（6枚）・外周道路ループ（14枚）の計 **38枚** を建物・駐車車両・街路樹・ベンチ・噴水と干渉しない位置へバランスよく配置。
   - M1 iPad Air 60FPS 維持のため全38枚を `THREE.InstancedMesh` 2ドローコール（本体円盤＋立体リム）のみで描画し、毎フレームの回転・上下浮遊・取得ポップ演出の行列更新を `Float32Array` 直接書き込みのゼロアロケーションで実装（夜間時間帯は `setNightFactor` で輝きを自動強化）。
   - 徒歩・乗用車・スポーツカー・バイクのいずれでも獲得可能とし、160km/h 走行時でも取りこぼさない前フレーム〜現在位置の2D線分距離判定を採用。取得済みコインは **60秒後の自動再出現** および画面上部HUDの **`再配置` ボタン** で即座に再配置可能とし、累計獲得枚数は `localStorage`（`my3dgame.coins.totalCollected`）へ自動保存。
2. **チェックポイント・タイムアタック（`src/gameplay/timeAttack.ts`）**:
   - 駅前広場入口（`(0, 80)`、南向き）に半透明の発光リング＋左右の光柱＋遠距離ビーコン柱＋路面ガイドリング＋浮遊ラベルスプライトで構成された **START ゲート** を設置（常時1基のゲートグループを再利用しドローコールを最小化）。
   - START ゲート通過で自動開始し、外周道路ループ〜市街地を巡る全 **8箇所**（外周南東・東2箇所・さくら中央公園前・外周北西・外周西・市街地西幹線・市街地南幹線 GOAL）の次ゲートが順番に出現。
   - プレイ中は画面上部に経過タイム（`MM:SS.cc`）・残りゲート数・`再挑戦`（スタート直前 `(0, 66)` へ安全リスポーン）・`中断` ボタンを表示。ゴール時はクリアタイムとお祝いカードを表示し、自己ベスト更新時は `localStorage`（`my3dgame.timeAttack.bestTimeMs`）へ自動保存してゴールド発光のお祝い演出を表示。
3. **ミニマップ連動＆ワンタップ「車体復帰（スタック脱出）」ボタン（`src/ui/Minimap.tsx`, `src/gameplay/vehicleRecovery.ts`, `src/vehicle/vehicleController.ts`）**:
   - `MinimapSnapshot` をゼロアロケーションで拡張し、通常時は近くの未取得コインをゴールドの小さな点＋STARTゲートを緑マーカーで表示、タイムアタック中は「次の目標ゲート」を脈動リング（レーダー外は外周方向矢印マーカー）で強調表示。
   - 車両・バイク運転中のみ画面上部へ小型の **`復帰`** ボタンを表示し、タップすると中央幹線・外周道路ループ（直線＋R42コーナー）・駅前ロータリーの中から現在位置に最も近い車道上の安全な空き位置・正しい進行方向（日本の左側通行基準）へ瞬時にリスポーンし、カメラも背面へ即座に整列。
4. **専用効果音の追加（`src/audio/soundManager.ts`）**:
   - 既存の iPad Chrome/Safari 対応 Web Audio エンジンへ、`playCoinCollect()`（軽快な2音チャイム `B5→E6`）、`playCheckpointPass(isStart)`（スタート3音チャイム／チェックポイント上昇チャイム）、`playTimeAttackGoal(isNewRecord)`（ゴールファンファーレ＋自己ベスト更新時きらめき音）、および `playVehicleRecover()`（復帰フィードバック音）を低遅延・手続き型で追加。

#### 変更ファイル一覧
- `src/gameplay/collectibles.ts`（新規作成：38枚ゴールドコイン収集・InstancedMeshゼロアロケーション更新・自動/手動再配置・`localStorage` 自動保存）
- `src/gameplay/timeAttack.ts`（新規作成：START＆8チェックポイントタイムアタック・発光リング＋光柱/ビーコン・自己ベスト `localStorage` 保存）
- `src/gameplay/vehicleRecovery.ts`（新規作成：最近接安全車道＆左側通行進行方向探索ヘルパー）
- `src/gameplay/index.ts`（新規作成：gameplay モジュールエクスポート）
- `src/audio/soundManager.ts`（コイン獲得音・チェックポイント通過音・ゴールファンファーレ音・車体復帰音を追加）
- `src/vehicle/vehicleController.ts`（安全リスポーン用 `respawnAt()` 追加）
- `src/ui/Minimap.tsx`（通常時の未取得コイン点・タイムアタック中の次目標ゲート＆レーダー外方向マーカー描画を追加）
- `src/engine/scene.ts`（コイン・タイムアタック・専用効果音・車体復帰・ミニマップ連動の統合およびリソース解放）
- `src/App.tsx`・`src/index.css`・`src/ui/DebugHud.tsx`（画面上部コイン累計HUD・再配置ボタン・運転中車体復帰ボタン・タイムアタックタイマー/中断/再挑戦UI・ゴール＆自己ベスト更新お祝いカード追加）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 4-A 品質調整（夜間ライティング・自販機／看板の発光バランス・外周道路の走行性・公園／プロップ配置の適正化）
- **実施日**: 2026-11-26
- **コミットID**: `fc850e0`（`fc850e00c6e71feb4d7118cd8e35bc3ed2fe6966`）
- **GitHub Actions Run ID**: `45775135997`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード修正・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザでの3D描画・夜間視認性確認＝状態C・高速周回/公園アクセス/発光バランス動作確認＝状態D・iPad Air 第5世代実機検証＝状態Eは未実施）

#### 調整内容
1. **夜間・夕方の視認性と発光（Emissive）バランスの適正化**:
   - `src/world/timeOfDay.ts`: `NIGHT` モードの環境光（`HemisphereLight` 強度 `0.32 → 0.52`、地面色 `0x0d111a → 0x1c2536`）、月明かり（`DirectionalLight` 強度 `0.34 → 0.52`、色 `0x93b8f2`）、`envIntensity`（`0.16 → 0.26`）、およびフォグ距離（`48..210 → 62..245`）を引き上げ、`SUNSET` モードの最低照度・フォグ距離も微調整し、道路白線・歩道境界・建物輪郭が暗闇に沈まず見やすい明るさとした。
   - `src/world/japaneseProps.ts` / `src/world/streetLights.ts` / `src/world/expandedWorld.ts` / `src/world/cityBuilder.ts`: 自動販売機ディスプレイ（`2.1 → 1.18`、発光バックライト `#e8f6ff → #cde4f5`）、店舗袖看板・ファサード看板（`1.85/1.75 → 1.15/1.10`）、街灯ディフューザー（`3.4 → 1.9`）・公園灯（`3.0 → 1.75`）、時計塔・駅看板・バス停標識・GLB建物発光マテリアルの `emissiveIntensity` およびハロー不透明度を統一調整し、白飛びを抑えた自然なネオン・照明バランスとした。
   - `src/engine/scene.ts`: プレイヤー運転車両・バイクの前方 `SpotLight` を照射距離 `46m → 88m`・広がり角 `0.25π → 0.30π`・`penumbra: 0.68`・`decay: 1.25`・照射目標距離 `14/17m → 22/28m`（高さ `0.25m`）・強度 `48/74 → 68/96` へ強化し、夜間高速走行時にも前方のカーブやガードレールを明確に照らせるよう調整。
2. **外周道路の走りやすさとガードレール・標識の干渉解消**:
   - `src/world/collisionWorld.ts` / `src/world/expandedWorld.ts` / `src/world/streetLights.ts`: 外周道路ループを中心線 `±134m`・車道幅 **`16m`**（片側2車線 `4.0m×2`）・コーナー曲率半径 **`R = 42m`** へ拡張・緩やか化し、破線・T字横断歩道・街灯（コーナー含む）を `CITY_METRICS` 基準で自動同期。最高速 `110〜160km/h` のスポーツカーやバイクでも余裕をもって周回可能とした。
   - `src/world/japaneseProps.ts`: 内側・拡張道路のガードレールおよび標識を歩道縁石の内側ライン（`±6.35m` / `±6.45m`）へオフセットし、交差点・横断歩道まわり（`±14.5m`、北西の短い孤立ガードレール撤去）・4方向T字交差点（`±16m`）・公園入口（西 `10m`・北 `14m`）の開口を拡大して進入・歩行の干渉を解消。外周コーナーガードレールは12分割で滑らかに追従。
3. **都市公園・駅前広場のアクセス性と街並みプロップの整理**:
   - `src/world/expandedWorld.ts` / `src/world/collisionWorld.ts`: 公園内遊歩道を重複ゼロの非重複セグメントへ分割し、幹線延長・外周道路・ロータリー車道の重なりとレイヤー高さ（`0.002 / 0.006 / 0.011 / 0.014 / 0.017 / 0.018`）を整理して Zファイティングを解消。公園の4方向ゲートを幅 `8m` へ広げ、北遊歩道を外周内側歩道（`z = -122.5`）へ接続。駅前広場（`plazaBounds.minZ: 80, maxZ: 122.5`）を内側街区・外周歩道へ隙間なく接続し、ロータリー東西ボラード中央へ駅エントランス・バス停前の歩行者出入口を開設。
   - `src/world/japaneseProps.ts` / `src/world/cityLayout.ts` / `src/world/expandedWorld.ts`: 歩道中央（`±8.2〜±8.8m`）にあった自動販売機（新規6基＋既存GLB3基）を歩道外縁/壁際（`±10.3〜±10.35m`）へ整列し、駅前西側ベンチを駅キャノピー沿い（`x = -27.2`）、外周街路樹を外側歩道の外縁へ整列させ、プレイヤーおよび AI 歩行者の動線を完全に確保。

#### 変更ファイル一覧
- `src/world/timeOfDay.ts`（`NIGHT` / `SUNSET` 最低照度・月光・フォグ距離調整）
- `src/world/streetLights.ts`（街灯発光・ハロー強度適正化、外周コーナー街灯の動的座標同期）
- `src/world/cityBuilder.ts`（GLB 建物窓・既存発光マテリアルの夜間強度バランス調整）
- `src/engine/scene.ts`（プレイヤー車両・バイク前方 `SpotLight` 照射距離・広がり角・強度調整）
- `src/world/collisionWorld.ts`（外周道路 `16m` 幅・`R=42m` 化、駅前広場境界のシームレス接続）
- `src/world/expandedWorld.ts`（公園遊歩道Zファイティング解消・8mゲート・ロータリー東西歩行者出入口・車道/標示同期・発光調整・ベンチ整列）
- `src/world/japaneseProps.ts`（自販機/看板/反射板/シェブロン発光適正化・ガードレール/標識の縁石オフセット＆開口拡大・自販機/外周並木の歩道外縁整列）
- `src/world/cityLayout.ts`（既存 GLB 自販機3基の歩道外縁 `±10.3m` 整列）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 4-B（AI歩行者（通行人）のクローン感解消：CC0人物モデル8種自動導入 ＋ 年齢層/体型・3D装着パーツ・カラー/歩調多様化）
- **実施日**: 2026-11-26
- **コミットID**: `953089e`（`953089e183ec3d7d3413fb8b5b8c811324f903f9`）
- **GitHub Actions Run ID**: `45770117902`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（CC0 GLB 8種の自動取得・バイナリ/スケルトン/In-Placeアニメーション解析・コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザでの3D描画確認＝状態C・歩行アニメ/3D装着パーツ追従/回避動作＝状態D・iPad Air 第5世代実機での60FPS維持検証＝状態Eは未実施）

#### 実装内容
1. **CC0 マルチキャラクター GLB 8種の自動取得・配置と歩行アニメーション統合**:
   - `public/assets/pedestrians/` を作成し、Quaternius `Ultimate Animated Character Pack`（**CC0 1.0 Universal**・商用利用可）より男女・服装・髪型が異なる都市向け8キャラクター（`casual_female.glb`, `casual2_female.glb`, `suit_female.glb`, `old_classy_female.glb`, `casual_male.glb`, `casual2_male.glb`, `suit_male.glb`, `worker_male.glb`）を自動取得・配置。
   - 全8モデルについてバイナリ解析を実施し、すべて **`+Z` 正面**・**`Walk` / `Idle` / `Run` 含む17クリップ内蔵（In-Place）**・**合計45,944三角形（平均約5,743三角形/体）**・**埋め込みテクスチャ画像0枚（低VRAM）** であることを確認し、`docs/ASSET_MANIFEST.json`（`schemaVersion: 1.6.0`）へソースURL・ミラーURL・CC0-1.0ライセンス・ポリゴン数・クリップ情報を記録。
   - `src/pedestrians/pedestrianRoutes.ts` を6人→**8人**ルートへ拡張し、8種モデル全員が重複なく街を歩行するよう構成。また、万が一外部GLB取得が失敗した場合も `player.glb` へ自動フォールバックしつつ全多様化仕様を適用する二段構成とした。
2. **年齢層・体型・3D装着パーツ・カラー・歩調テンポのさらなる多様化**:
   - `src/pedestrians/pedestrianCatalog.ts` を新規作成し、**小学生サイズ（約 `1.25m〜1.35m`・8人中2人を確実に混在）** と **大人（`1.58m〜1.82m`・`slim` 細身 / `standard` 標準 / `stocky` がっしり体型の非均一スケール）** を自動生成。帽子内蔵モデル（`old_classy_female.glb`, `worker_male.glb`）でも背が縮まないよう素体基準高（`3.204`）で正規化。
   - `src/pedestrians/pedestrianAccessories.ts` を新規作成し、全歩行者で共有ジオメトリを使い回す軽量3Dパーツ（**キャップ帽・ニット帽・メガネ・リュックサック・ショルダーバッグ**）を `Head` / `Torso` ボーン（Mixamo フォールバック時は `mixamorig:Head` / `mixamorig:Spine2`）へ精密アタッチ。内蔵帽子モデルへの二重装着を自動回避し、子供個体にはランドセル/通学リュック風カラーを高確率で配分。
   - 肌色6トーン・髪色8トーン（シニア向けシルバーグレー含む）・服装15パレットを `Skin` / `Hair` / `Shirt` / `Pants` / `Black` / `Vest` / `Hat` / `Belt` マテリアルへ個体別適用（`Face` マテリアル保護）。さらに個体ごとの歩行速度倍率（`speedFactor`）と歩調・腕振りテンポ倍率（`cadenceFactor`、子供は小股で軽快な `1.18〜1.30`）を適用。
3. **M1 iPad Air 60FPS 維持設計**:
   - AI歩行者全8体で合計約 `47,000` 三角形（アクセサリー込み）、テクスチャ追加ゼロ、`castShadow = false`、共有ジオメトリによる低メモリ・低ドロー負荷設計を確認。

#### 変更ファイル一覧
- `public/assets/pedestrians/*.glb`（新規追加8ファイル：CC0 Quaternius アニメーション付き人物モデル）
- `src/pedestrians/pedestrianCatalog.ts`（新規作成：CC0モデルカタログ・年齢層/体型・肌/髪/服パレット・多様化プランナー）
- `src/pedestrians/pedestrianAccessories.ts`（新規作成：共有ジオメトリ軽量3Dパーツ5種のボーン装着）
- `src/pedestrians/pedestrianAgent.ts`（CC0 PBRカラー適用・Mixamoフォールバック両対応・体型/年齢スケール・3Dパーツ装着・`Walk`/`Idle`＆個体別歩調テンポ）
- `src/pedestrians/pedestrianManager.ts`（8種CC0並列ロード・フォールバック・多様化プラン連携・リソース解放）
- `src/pedestrians/pedestrianRoutes.ts`（8人歩行ルートへ拡張）
- `src/pedestrians/index.ts`・`src/App.tsx`・`src/ui/DebugHud.tsx`（エクスポート・初期総数8同期・Phase 4-B表示）
- `docs/ASSET_MANIFEST.json`（8種のCC0歩行者アセット情報・ライセンス・ソースURL記録）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 4-A（街エリアの拡張：外周道路・都市公園・駅前ロータリー広場 ＋ 日本の街並み装飾 ＋ ミニマップ自動同期）
- **実施日**: 2026-11-26
- **コミットID**: `89799ed`（`89799ed7a7725493594b744250ccd6623f8423fb`）
- **GitHub Actions Run ID**: `45766053059`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での画面描画＝状態C・外周高速走行/公園散策/夜間自販機＆看板発光/コリジョン動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **街区エリアの 360m × 360m 拡張（外周道路ループ・都市公園・駅前ロータリー広場、`Y = 0` 統一）**:
   - `src/world/collisionWorld.ts` の `CITY_METRICS` を拡張（`innerCityHalfSize: 80`, `cityHalfSize: 180`, `worldHalfExtent: 174`）し、拡張した道路・外周ループ・公園・駅前広場の地面高さをすべて **`Y = 0`** に統一（既存内側4街区のみ `Y = 0.12` と縁石スロープを維持）。
   - `src/world/expandedWorld.ts` を新規作成し、既存中央十字路（`±80m`）から延長接続される **外周道路ループ（中心線 `±132m`、188m直線×4＋緩やかな `R=38m` 高速コーナー×4、車道幅 `14m`、共有 `asphaltMaterial` / `pavementMaterial` で Poly Haven 1K PBR 自動反映）**、北東拡張エリアの **都市公園「さくら中央公園」（`82m×36m`：プロシージャル芝生・遊歩道・中央円形広場・多段石造噴水・Instanced ベンチ10脚・4方向歩行者ゲート付き外周スチール柵・夜間グローブ灯8基）**、および南側拡張エリアの **駅前ロータリー広場「中央駅南口ロータリー」（`88m×40m`：環状車道・中央緑地島＆4面発光時計塔モニュメント・現代的な駅エントランスキャノピー・バス/タクシーシェルター2基・Instanced ボラード）** を構築し、各構造物へ適切な OBB コリジョンを登録。
   - `src/world/cityLayout.ts` に既存承認済み GLB 建物クローン8棟（追加ダウンロードゼロ、`castShadow: false`、`priority: 4`）を外周沿いへ配置し、街の奥行きを補強。あわせて `src/engine/scene.ts` のカメラ `far` を `480m`、`src/world/timeOfDay.ts` のスカイドーム半径を `420m` およびフォグ距離を拡張マップ向けに調整。
2. **日本の街並み装飾の追加（昼夜ライティング連動・`InstancedMesh` 最適化）**:
   - `src/world/japaneseProps.ts` を新規作成し、以下の日本らしい街並みプロップを歩道沿い・公園・駅前広場・外周カーブへバランスよく配置（新規外部 GLB ダウンロードなし、すべて `setNightFactor` と連動）：
     - **自動販売機（青・赤・白デザイン 10基）**: 3段ドリンク棚・リサイクルボックス付き。`夕方`・`夜` モード時に前面ディスプレイが `emissiveMap` で明るく発光し、足元の夜間こぼれ光デカールも連動表示。
     - **コンビニ・店舗風の光る袖看板／ファサード看板（10基）**: コンビニトリコロール袖看板（`24H MART`）・居酒屋縦型看板・カフェ＆ベーカリー看板・`P 24H` 看板および横長ファサード看板を配置し、`夕方`・`夜` に点灯＋加算ハロー連動。
     - **白いスチール製ガードレール（`InstancedMesh` 3ドローコール）**: 内側歩道境界（横断歩道・駐車/運転車両ドア付近は開放）および外周道路ループの直線・4コーナー外側/内側へ配置し、車両の歩道乗り上げ・路外逸脱を防ぐ低め OBB コライダー（高さ `0.82m`、カメラ遮蔽閾値 `1.2m` 未満のためカメラ非干渉）と夜間反射デリネーターを実装。
     - **日本の道路標識（止まれ・制限速度40/60・横断歩道・外周コーナー用黒黄シェブロン標識）**: 支柱を `InstancedMesh` 化、コーナーシェブロンは夜間視認性向けに控えめ発光対応。
     - **街路樹・公園樹木（約80本、`InstancedMesh` 5ドローコール）**: 樹皮テクスチャ幹＋多層有機樹冠（インスタンスカラー変化付き）＋歩道植樹桝＋幹 OBB コライダー。
   - `src/world/streetLights.ts` を `InstancedMesh` 化し、外周道路ループ用の街灯20基（計34基）を追加しつつドローコールを削減。新規 `PointLight` は公園噴水・駅前ロータリーの代表光源2基（`castShadow = false`）のみに抑制。
3. **ミニマップ表示範囲の自動同期（`src/ui/Minimap.tsx`）**:
   - `CITY_METRICS` の拡張定数（360m全体・160mコア・外周道路ループ・都市公園・駅前ロータリー広場）へ描画スケール・図形を同期。徒歩時 `92m`／運転時 `148m` へ滑らかにズーム切替し、高速走行時も先の外周コーナー・公園・ロータリーを視認可能とした。

#### 変更ファイル一覧
- `src/world/collisionWorld.ts`（360m拡張 `CITY_METRICS`・拡張エリア `Y = 0` 統一 `getGroundHeight`）
- `src/world/environment.ts`（共有 PBR マテリアル公開・内側コア160m基準化）
- `src/world/timeOfDay.ts`（スカイドーム半径 420m・拡張マップ向けフォグ距離調整）
- `src/world/expandedWorld.ts`（新規作成：外周道路ループ・都市公園・駅前ロータリー広場・代表光源2基）
- `src/world/japaneseProps.ts`（新規作成：夜間発光自販機・コンビニ/店舗看板・Instanced ガードレール/道路標識/街路樹）
- `src/world/streetLights.ts`（`InstancedMesh` 化・外周道路ループ街灯20基追加）
- `src/world/cityLayout.ts`（外周沿いの既存承認済み GLB 建物クローン8棟追加）
- `src/engine/scene.ts`（カメラ `far=480`・`expandedWorld` / `japaneseProps` 統合・昼夜連動・解放処理）
- `src/ui/Minimap.tsx`（拡張マップサイズ自動同期・外周ループ/公園/ロータリー描画・徒歩/運転ズーム切替）
- `src/ui/DebugHud.tsx`（Phase 4-A 表示更新）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-G（昼・夕方・夜の時間帯切替システム ＋ 車両ヘッドライト・街灯・信号・建物窓の発光演出）
- **実施日**: 2026-11-26
- **コミットID**: `63aa4b0`（`63aa4b0c4221a0576b19393288ef54867180be05`）
- **GitHub Actions Run ID**: `45763598865`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での画面描画＝状態C・時間帯切替/ヘッドライト照射/夜間発光動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **ワンタップ時間帯切替ボタン（`昼` / `夕方` / `夜`）と滑らかな環境トランジション**:
   - 画面上部・スピーカーボタンの左隣（`top: 12px`, `right: 218px`, `z-index: 32`、既存 HUD・ミニマップ・操作 UI と非干渉）に、タップごとに **`昼（DAY）` → `夕方（SUNSET）` → `夜（NIGHT）`** を循環切替できる軽量ピル型ボタン（`.time-of-day-btn`）を `src/App.tsx` / `src/index.css` へ設置。
   - `src/world/timeOfDay.ts`（`TimeOfDayController`）を新規作成し、1ドローコールのグラデーションスカイドームシェーダ（太陽・月グローディスク＋夜間星空付き）、フォグ色・距離、`DirectionalLight` の角度・色温度・強度、`HemisphereLight`、`scene.environmentIntensity`（HDRI IBL 減光）をゼロアロケーションの指数補間で滑らかに遷移。
2. **車両・バイク・AI交通車両のヘッドライト＆テールランプ自動点灯＋運転車両前方 `SpotLight`**:
   - `src/vehicle/vehicleLights.ts`（`createVehicleLightRig`）を新規作成し、運転可能な乗用車・スポーツカー・バイク3台および AI 交通車両4台すべてへ、`夕方`・`夜` で自動点灯（`昼` は消灯）するヘッドライト（白〜淡い暖色）＆テールランプ（赤）発光メッシュ＋軽量加算ブレンドハローを搭載（バイクは `bodyGroup` 追従でバンク時も一体傾き）。
   - `src/engine/scene.ts` にプレイヤー運転中の車両・バイク専用の前方路面照射用 `THREE.SpotLight`（`castShadow = false`、常設・消灯時は `intensity = 0` にして WebGL2 シェーダ再コンパイルを回避）を実装し、乗降時・車種切替時・バイクバンク時にも前方へ滑らかに追従。
3. **街灯・信号機・建物窓の夜間ライティング（M1 iPad Air 60FPS 維持設計）**:
   - `src/world/streetLights.ts`（`StreetLightSystem`）を新規作成し、歩道縁石沿いに共有ジオメトリ・共有マテリアルの日本式カーブアーム街灯14基（支柱 OBB コライダー付き）を配置。個別 `PointLight` の大量配置を避け、中央交差点の代表光源1基（`castShadow = false`）＋共有発光ディフューザー＋加算ブレンドハロー＋路面ライトプールで軽量に夜道を演出。
   - `src/traffic/trafficLights.ts` に `setNightFactor` を追加し、`夕方`・`夜` に信号レンズの `emissiveIntensity` を引き上げるとともに点灯中の青・黄・赤レンズへ軽量な加算ブレンドハローを連動表示。
   - `src/world/cityBuilder.ts` に `setNightFactor` を追加し、配置済み GLB 建物・自販機の窓ガラス系マテリアル（`Windows_01_tex`, `Glass`, `Cristal`, `Ventana` 等）へ夜間の温かな室内発光を付与し、既存発光マテリアル（`Inakaya_final`, `II_Lamp`, `Lamparita_luz`, `vending_machine`）も夜間ブーストするよう実装。

#### 変更ファイル一覧
- `src/world/timeOfDay.ts`（新規作成：昼・夕方・夜トランジション制御・グラデーションスカイドーム）
- `src/world/streetLights.ts`（新規作成：街灯14基・加算ハロー・路面ライトプール・中央交差点代表光源）
- `src/vehicle/vehicleLights.ts`（新規作成：四輪車・バイク共通のヘッドライト＆テールランプ発光リグ）
- `src/world/environment.ts`（昼 HDRI 背景切替フック `setDayHdriBackgroundVisible` / `hasLoadedHdri` 追加）
- `src/world/cityBuilder.ts`（建物窓・看板・自販機の夜間発光制御 `setNightFactor` 追加）
- `src/traffic/trafficLights.ts`（夜間信号発光強度ブースト＆点灯レンズ連動ハロー追加）
- `src/vehicle/vehicleModel.ts`・`src/vehicle/vehicleController.ts`（運転可能車両3台へのライトリグ統合・`getBodyGroup` / `setLightsIntensity` 追加）
- `src/traffic/trafficVehicle.ts`・`src/traffic/trafficManager.ts`（AI 交通車両4台へのライトリグ統合・一括強度同期）
- `src/engine/scene.ts`（時間帯・街灯・信号・建物窓・車両ライト・運転車両前方 `SpotLight` 統合、`cycleTimeOfDay` 公開）
- `src/App.tsx`・`src/index.css`・`src/ui/DebugHud.tsx`（ワンタップ時間帯切替ボタン設置・Phase 3-G HUD 更新）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-F（車・バイク運転時のiPadタッチアクセル操作性＆速度調整改善：走行モード速度リミッター・可変スロットル・自然な惰性走行）
- **実施日**: 2026-11-26
- **コミットID**: `3040ba2`（`3040ba2220d610a29ade36a609e84e5887d9bec1`）
- **GitHub Actions Run ID**: `45761929795`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での画面描画＝状態C・走行モード切替/可変スロットル/惰性走行の操作感＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **走行モード（速度リミッター）切替ボタンの追加**:
   - `src/vehicle/vehicleController.ts` に `DriveSpeedMode`（`'CITY' | 'CRUISE' | 'SPORT'`）および `DRIVE_SPEED_MODE_CONFIGS` を追加し、乗車時の初期状態を街中で扱いやすい **`CITY（街乗り・上限 45km/h）`** に設定。
   - 乗車中のみ表示されるデジタルスピードメーター直上に、ワンタップで `CITY（45km/h）→ CRUISE（85km/h）→ SPORT（車種本来の最高速 110〜160km/h）` を循環切替できるモードボタン（`.drive-speed-mode-btn`）を設置。
   - アクセルを押し続けても現在モードの上限速度で安定巡航でき、高速走行中に下位リミッターへ切り替えた際も急減速せず滑らかに上限速度まで減速する制御を実装。
2. **アクセルペダルの可変スロットル化（0.25〜1.0）と視覚開度バー**:
   - `src/ui/TouchControls.tsx` および `src/index.css` にてアクセルペダルを縦長拡張（`96×152px`）し、ペダル内でタッチ・ドラッグした縦位置（下端＝約 `25%` 開度 〜 上端＝`100%` 全開）に応じて連続的にアクセル開度（`0.25〜1.0`）を出力する可変スロットルへ改良。
   - ペダル内部に現在の開度を薄く視覚表示する縦バー（`.drive-pedal-throttle-fill`）とリアルタイム開度％表示を追加。
3. **実車に近い自然な惰性走行（コースティング）調整**:
   - `src/vehicle/vehicleConfig.ts` の `coastDrag` を従来の `2.4〜3.0 m/s²` から `0.72〜0.88 m/s²`（乗用車 `0.72` / スポーツカー `0.88` / バイク `0.78`）へ見直し、`src/vehicle/vehicleController.ts` のペダルオフ時減速式を緩やかな転がり抵抗＋速度連動空気抵抗（`absSpeed * 0.018 + absSpeed² * 0.0005`）へ調整。ブレーキを踏まない限り滑らかに惰性走行でき、「少し押して離す」操作でも低速維持しやすい挙動とした。

#### 変更ファイル一覧
- `src/vehicle/vehicleConfig.ts`（3車種の `coastDrag` を実車に近い緩やかな転がり抵抗へ調整）
- `src/vehicle/vehicleController.ts`（`DriveSpeedMode` リミッター制御・滑らかな上限減速・自然な惰性走行式・テレメトリ拡張）
- `src/vehicle/index.ts`（`DriveSpeedMode` 型・定数エクスポート追加）
- `src/engine/scene.ts`（`vehicleSpeedMode` / `vehicleSpeedLimitKmh` ステータス配信・`cycleVehicleSpeedMode` ハンドル追加）
- `src/App.tsx`（走行モード状態および切替コールバックを `TouchControls` へ接続）
- `src/ui/TouchControls.tsx`（スピードメーター上のワンタップ走行モード切替ボタン・縦位置可変スロットル・ペダル内開度バー実装）
- `src/index.css`（走行モードボタン・拡張アクセルペダル・開度バーのスタイル追加）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-E（街区配置済みバイクの運転乗り物化：135km/h・車体バンク演出・跨がり姿勢・バイク専用排気音）
- **実施日**: 2026-11-26
- **コミットID**: `bd8b30e`（`bd8b30eee14f1727cf81e0f631880458c5588c79`）
- **GitHub Actions Run ID**: `45759106903`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（GLBノード解析・コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での跨がり姿勢・バンク演出・バイク専用排気音・乗降動作の確認＝状態C/D/Eは未実施）

#### 実装内容
1. **街区配置済みバイク GLB の特定・ノード解析・3台目運転可能車両化（多重配置なし）**:
   - 南側路肩に静的配置されていた `veh_harley_bike`（`public/assets/vehicles/harley_custom_bike_v1.2.glb`、`x: 4.75, z: 14.0, targetSize: 2.3m`）を特定し、`src/world/cityLayout.ts` から静的配置エントリを除外したうえで、同一座標・同一見た目の向きのまま 3台目の運転可能車両（`type: 'bike'`、`BIKE_VEHICLE_CONFIG`）として `DRIVABLE_VEHICLES` へ統合。
   - GLB 頂点分布およびノード階層を解析し、元モデルは `-Z` がフロント／ハンドル側（`modelForwardCorrectionY: Math.PI` で `+Z` 正面へ正規化、正規化寸法 `0.951m × 1.178m × 2.300m`、ホイールベース `1.67m`、シート座面 `Y ≈ 0.74m, Z ≈ -0.34m`）であること、また内部はテクスチャアトラス単位5メッシュ（`big1_A2k_big1A_0`, `big2_B2k_big2B_0`, `sym_small_C2k_symC_0`, `sym_small_C2k_1_symC_0`, `similar_D2k_simularD_0`）で結合されており前後ホイール・ハンドルの独立ノードはないことを確認し `docs/ASSET_MANIFEST.json` へ記録。
2. **バイク専用走行挙動・スリム当たり判定・車体バンク（ロール角傾き）演出**:
   - 最高前進速度を **約 135 km/h（`37.5 m/s`）**、加速 `17.5 m/s²`、最大ステア角 `0.64 rad`、ホイールベース `1.67m`、スリムコリジョン（`colliderShrink: 0.76` ≒ 幅 `0.72m`）に設定。
   - `src/vehicle/vehicleModel.ts` にバンク回転用 `bodyGroup` と搭乗プレイヤー用 `riderAnchor` を構築し、`src/vehicle/vehicleController.ts` にて走行速度と舵角に応じてカーブ内側へ最大 `0.45 rad`（約 `26°`）自然に傾き、直進・減速時は滑らかに水平へ戻るロール演出を実装。
3. **乗車時の跨がり姿勢表示・乗降処理・カメラ＆ミニマップ対応**:
   - バイク乗車中は `player.glb` を非表示にせず、`PlayerController.enterBikeRide` により `riderAnchor` 配下のシート位置（`offsetY: 0.34m, offsetZ: -0.34m`, 軽度前傾 `0.14 rad`）へアタッチして `Driving` クリップをループ再生し、車体のバンクと一体で傾くように実装。
   - バイク付近（車体外面から `2.4m` 以内 ≒ 中心から約 `2.5m` 圏内）で「乗る」ボタンを表示し、停車時の降車でバイク左側（`halfW + 0.72m`）へ安全に降りられるよう対応。
   - `src/camera/thirdPersonCamera.ts` にバイク向け近接フレーミング、`src/ui/Minimap.tsx` にバイク用スリムアイコン（コーラルピンク `#f472b6`）を追加。
4. **バイク専用エンジン音プロファイル（`bike`）追加**:
   - `src/vehicle/vehicleConfig.ts` および `src/audio/soundManager.ts` に `bike` プロファイルを追加。`sawtooth`＋`square`（5度倍音比 `1.5`）＋`triangle` 波形、基本周波数 `46Hz〜215Hz`、`triangle` LFO による明確なアイドリング鼓動感（`10.5Hz`・深さ `0.13`）と鋭い回転応答（`freqTau: 0.035s`）により、単気筒〜2気筒バイクらしい歯切れのよい排気音をゼロアロケーションで合成。

#### 変更ファイル一覧
- `src/world/cityLayout.ts`（`veh_harley_bike` 静的配置除外）
- `src/vehicle/vehicleConfig.ts`（`VehicleType`, `VehicleLeanConfig`, `BikeRiderMountConfig`, `VEHICLE_ENGINE_AUDIO_PROFILES.bike`, `BIKE_VEHICLE_CONFIG`, `DRIVABLE_VEHICLES` 3台化）
- `src/vehicle/vehicleModel.ts`（`bodyGroup`・`riderAnchor`・`setLeanRoll` 追加）
- `src/vehicle/vehicleController.ts`（バイクバンク計算・スリム当たり判定・バイク降車オフセット・`getType`/`getRiderAnchor`/`getRiderMount` 追加）
- `src/vehicle/index.ts`（新規型・定数エクスポート）
- `src/player/playerController.ts`（`enterBikeRide`・`updateRidingAnimation`・`exitBikeRide` 追加）
- `src/audio/soundManager.ts`（`bike` プロファイル用 LFO 波形・鼓動感カーブ最適化）
- `src/camera/thirdPersonCamera.ts`（バイク乗車時カメラ距離・注視点最適化）
- `src/engine/scene.ts`（バイク乗車時プレイヤー表示＆アタッチ・降車時デタッチ・アニメ更新連携）
- `src/App.tsx`・`src/ui/Minimap.tsx`・`src/ui/DebugHud.tsx`（3台対応・バイクミニマップアイコン・Phase 3-E 表示）
- `docs/ASSET_MANIFEST.json`・`docs/PROGRESS.md`（記録更新）

---

### 作業ID: 3-D 調整（通常乗用車エンジン音の「静かな実用車」化 & スポーツカーとの差別化維持）
- **実施日**: 2026-11-26
- **コミットID**: `2fcf9a5`（`2fcf9a5d8854146c0cdc843c5ca63949271a6498`）
- **GitHub Actions Run ID**: `45757739051`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード修正・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での通常車／スポーツカー音色・音量バランス確認＝状態C/D/Eは未実施）

#### 修正内容
1. **通常乗用車（`standard`: Toyota Kijang Innova / 最高速 110km/h）の「静かな実用車」エンジン音化**:
   - `src/vehicle/vehicleConfig.ts` に車種別エンジン音パラメータ定義 `VEHICLE_ENGINE_AUDIO_PROFILES`（`VehicleEngineAudioProfileParams`）を追加し、`src/audio/soundManager.ts` にて乗車中プロファイル変更時のみオシレーター波形・倍音ミックス・フィルター特性を動的切替するゼロアロケーション構成へ拡張。
   - `standard` のオシレーター波形を角の丸い `triangle`（基音）＋ `sine`（2倍音・3倍音）へ変更し、3倍音ミックスを `0.10` まで抑制。基本周波数レンジを `54Hz〜128Hz`、ローパスフィルターカットオフを `220Hz〜420Hz`（`Q = 0.85`）、420Hz ピーキングブーストを `0.5dB`、ハイパスを `72Hz` に抑えて高回転・レーシングカー風の鋭い倍音を解消。
   - エンジン音量（`0.17` ベース、アクセル `+0.055`・速度 `+0.045`）を抑えつつ、タイヤのロードノイズ（`380Hz〜920Hz`、最大ゲイン `0.32`、指数 `1.35`）を前面に出すバランスへ調整し、全開走行時でも甲高く唸らず低いエンジン音＋ロードノイズ主体の落ち着いた実用車サウンドとした。
2. **スポーツカー（`sports`: Porsche 911 Turbo / 最高速 160km/h）との差別化維持**:
   - `sports` プロファイルは従来の `sawtooth` × 2 ＋ `triangle` 波形、基本周波数 `86Hz〜295Hz`、ローパスカットオフ `680Hz〜2600Hz`（`Q = 2.4`）、420Hz `+5.0dB` ブースト、力強いエンジン音量（ベース `0.30`＋アクセル `0.15`＋速度 `0.11`）を維持し、乗り換え時の音色差を明確化。
   - 他のシステムおよび UI には一切変更を加えていない。

#### 変更ファイル一覧
- `src/vehicle/vehicleConfig.ts`
- `src/audio/soundManager.ts`
- `docs/PROGRESS.md`

---

### 作業ID: 3-D 修正（iPad Safari 実機無音不具合修正：同期アンロック・確認チャイム・内蔵スピーカー向け音域/ゲイン最適化）
- **実施日**: 2026-11-26
- **コミットID**: `ef916cf`（`ef916cf94aaf568cfdc89a93e39a5222237ec7f4`）
- **GitHub Actions Run ID**: `45756082314`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード修正・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での発音・アンロック・ミュート切替確認＝状態C/D/Eは未実施）

#### 修正内容
1. **iPadOS Safari での確実な AudioContext アンロック**:
   - `src/App.tsx` のキャプチャリスナーに `click` を追加し、`touchstart` / `pointerdown` / `click` / `keydown` およびスピーカーボタン押下時の同期コールバック内で `SoundManager.unlock()` を実行。
   - `src/audio/soundManager.ts` にて、`AudioContext` 生成・`ctx.resume()`・短い確認チャイム音（`440Hz → 660Hz` サイン波）の `oscillator.start()` を同一同期ブロック内で実行するよう修正。
   - `statechange` 監視および `ctx.state !== 'running'` ガードを導入し、Safari の `'suspended'` / `'interrupted'` 状態から `'running'` に到達するまで再試行する構成とした。
2. **iPad 内蔵スピーカー向けゲイン＆中音域（150Hz〜1200Hz）最適化**:
   - マスターゲインを `1.0` に引き上げ、音割れ防止の軽量 `DynamicsCompressorNode` を追加。
   - 80Hz以下の超低音依存を解消するため、エンジン音（68〜295Hz 基本波＋2倍・3倍中音域倍音＋420Hzピーキングブースト＋ハイパス105Hz）、ロードノイズ（480〜1160Hz）、スキッド音（920〜1440Hz・Q=3.0）、足音＆着地音（190〜235Hz→95Hzタップ＋中音域バンドパスノイズ）、衝突音、街の環境音（140〜1100Hz帯域・ゲイン0.18）の全体音量と中音域バランスを大幅に引き上げ。
   - ミュートボタンで「音声ON」へ切り替えた際にも、マスターゲインを即時復帰させてアンロック＋短いフィードバックチャイム音（`440Hz → 660Hz`）を発音するよう改善。

#### 変更ファイル一覧
- `src/audio/soundManager.ts`
- `src/App.tsx`
- `docs/PROGRESS.md`

---

### 作業ID: 3-D（iPad Safari対応の音響システム：エンジン音・ブレーキ音・足音・街の環境音・ミュートUI）
- **実施日**: 2026-11-26
- **コミットID**: `2cfcaf1`（`2cfcaf1e569a7531b09c05fa94f0b237bdfd89fd`、初回実装 `f6c8486` + 型修正）
- **GitHub Actions Run ID**: `45752680611`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での画面描画＝状態C・Web Audio発音/ミュート切替動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **iPadOS Safari 対応の手続き型 Web Audio エンジン（`src/audio/soundManager.ts`）**:
   - 外部音声ファイルに一切依存せず、Web Audio API（オシレーター・事前生成ホワイト/ピンクノイズバッファ・ローパス/バンドパスフィルター・LFO）のみで軽量かつリアルな手続き型サウンドを合成。
   - iPadOS Safari の自動再生制限に対応し、`src/App.tsx` の初回 `pointerdown` / `touchstart` / `keydown` キャプチャイベントで `AudioContext.resume()` および無音1サンプル再生による確実なアンロックを実装。バックグラウンド遷移時の `suspend()` / 復帰時 `resume()` にも対応。
   - 画面上部・ミニマップの左隣（`top: 12px`, `right: 164px`、他UIと非干渉、`z-index: 32`）にワンタップで音声 ON / OFF を切り替えられる軽量なスピーカーアイコン型ミュートボタンを設置。
2. **状況に応じた4種類のサウンド連動**:
   - **車両のエンジン音＆走行音（乗車中）**: オシレーター3基（`sawtooth` / `triangle` / `sine`）＋アイドリング脈動 LFO ＋ローパスフィルター＋ピンクノイズ系ロードノイズを常設構築。アイドリング時の低い鼓動から、アクセル開度と車速（`km/h`）に応じてピッチ・倍音・フィルター開度が滑らかに上昇。通常乗用車（`standard`: Toyota Kijang Innova）とスポーツカー（`sports`: Porsche 911 Turbo）で音色・周波数レンジを差別化し、降車時は滑らかに減衰停止。
   - **ブレーキ・スキッド音＆衝突音**: 時速 `18 km/h` 以上からの急ブレーキ／ハンドブレーキ時にバンドパスノイズによるタイヤ摩擦音（スキッド音）を再生。建物・他車両との衝突時には `VehicleController.consumeImpactSpeed()` の衝撃速度に応じた低音衝撃＋クラッシュノイズをクールダウン制御付きで発音。
   - **プレイヤーの足音＆着地音（徒歩中）**: 接地状態での移動中に `Walk`（約 `0.50s` 間隔）・`Run`（約 `0.32s` 間隔）のテンポに合わせてわずかなピッチ揺らぎ付きの足音を再生。ジャンプ着地時は `PlayerController.consumeLandingSpeed()` に連動した着地音を再生。
   - **街の環境音（アンビエント）**: シームレスループ化したピンクノイズ＋緩やかな LFO ローパスフィルターにより、都市の遠い風と街の気配を他効果音の邪魔にならない控えめな音量で常時ループ再生。
3. **M1 iPad Air 最適化**:
   - エンジン・ロードノイズ・スキッド・環境音の全連続ノードおよび共有ノイズバッファを初期化時に1回だけ構築し、毎フレームは事前確保フレーム構造体と `setTargetAtTime` によるパラメータ更新のみを行うゼロアロケーション設計を採用。

#### 変更ファイル一覧
- `src/audio/soundManager.ts`（新規作成：iPad Safari 対応の手続き型 Web Audio エンジン）
- `src/vehicle/vehicleConfig.ts`（車種別 `audioProfile: 'standard' | 'sports'` 追加）
- `src/vehicle/vehicleController.ts`（`getAudioProfile`・`getMaxForwardSpeedKmh`・衝突衝撃計測 `consumeImpactSpeed` 追加）
- `src/player/playerController.ts`（ゼロアロケーション状態ゲッター・ジャンプ着地計測 `consumeLandingSpeed` 追加）
- `src/engine/scene.ts`（`SoundManager` 統合・毎フレームゼロアロケーション音響連動・`unlockAudio` / `toggleAudioMute` 公開）
- `src/App.tsx`・`src/index.css`（初回操作オーディオアンロック・ミニマップ左隣のワンタップミュートボタン追加）
- `src/ui/DebugHud.tsx`（Phase 3-D および Audio 状態表示追加）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-C（通行人の服装・髪色・身長バリエーション追加 & 画面右上の軽量ミニマップ＋運転スピードメーター）
- **実施日**: 2026-11-26
- **コミットID**: `ebe049e`（`ebe049e8047b8f6f030ebcd32a0bd58c02256e37`）
- **GitHub Actions Run ID**: `45750844534`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での描画＝状態C・ミニマップ/速度計/歩行者バリエーション動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **通行人（AI歩行者）の服装カラー・髪色・身長バリエーション追加（クローン感の解消）**:
   - `src/pedestrians/pedestrianRoutes.ts` に6種の服装＆髪色パレット `PEDESTRIAN_APPEARANCES`（ビジネス風ネイビー・ビジネス風チャコールグレー・カジュアル白・カジュアル青・カジュアルベージュ・カジュアル赤、各パレットにズボン色＆黒〜栗色/アッシュブラウンの髪色トーンを定義）および `pickRandomPedestrianHeight()`（`1.55m〜1.80m` ランダム生成）を追加。
   - `src/pedestrians/pedestrianManager.ts` にて6人の歩行者スポーン時にパレットを重複なくシャッフル割り当てし、個体ごとに `1.55m〜1.80m` のランダム身長を付与。
   - `src/pedestrians/pedestrianAgent.ts` にて各クローン生成時に `material.clone()` でマテリアルを個別複製（GPUテクスチャは完全共有し VRAM 増加ゼロ）。単一 `customProgramCacheKey`（`pedestrian-wardrobe-v1`）を共有する軽量 `onBeforeCompile` シェーダにより、肌色（顔・手）を保護しながら上半身・下半身・髪色を元テクスチャの陰影を保ったまま自然に変化させ、眉マテリアルも髪色に調和させた。
2. **画面右上の軽量ミニマップ（2D Canvas レーダー）**:
   - `src/ui/Minimap.tsx` を新規作成し、iPad 横画面の右上（`top: 12px`, `right: 12px`、左上デバッグHUDや右下操作UIと非干渉、`pointer-events: none`）に `140×140px` の円形 2D Canvas レーダーを表示。
   - 3D カメラの追加レンダリング（マルチパス描画）は一切使用せず、約 30fps スロットリング＆ゼロアロケーションスナップショット（`engine.getMinimapSnapshot`）により、160m 街区の道路・歩道・中央線・横断歩道・プレイヤー位置と向き（中央矢印＋カメラ方向コーン）・運転可能車両2台（シアン／ゴールド、範囲外時は外周エッジ表示）・AI交通車両4台（オレンジ）を軽量な2D図形で描画。
3. **運転中のデジタルスピードメーター**:
   - `src/ui/TouchControls.tsx`・`src/index.css` を更新し、車両乗車中のみ（徒歩時は非表示）画面右下ペダル UI の直上へ現在の走行速度（`km/h`）・ギア状態（`D` / `R` / `P`）・速度バーを見やすく配置。

#### 変更ファイル一覧
- `src/pedestrians/pedestrianRoutes.ts`（6種の服装・髪色パレット `PEDESTRIAN_APPEARANCES` および `1.55m〜1.80m` ランダム身長生成追加）
- `src/pedestrians/pedestrianAgent.ts`（個体別 `material.clone()`・肌色保護付き服/髪リカラーシェーダ・ランダム身長スケール反映）
- `src/pedestrians/pedestrianManager.ts`（パレットシャッフル＆ランダム身長スポーン連携）
- `src/player/playerController.ts`（ミニマップ向き表示用 `getYaw()` 追加）
- `src/ui/Minimap.tsx`（新規作成：30fps ゼロアロケーション 2D Canvas レーダーミニマップ）
- `src/engine/scene.ts`（`getMinimapSnapshot` 追加）
- `src/App.tsx`（`Minimap` マウント）
- `src/ui/TouchControls.tsx`・`src/index.css`（運転中のみ右下ペダル上へデジタルスピードメーター表示、ミニマップ用スタイル追加）
- `src/ui/DebugHud.tsx`（Phase 3-C 表示更新）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-B（車同士のめり込み防止修正 & 歩道を歩くAI歩行者6人 + 日本式信号サイクル連動）
- **実施日**: 2026-11-26
- **コミットID**: `5dba266`（`5dba26620b0319af816198cb754a481697865a0e`）
- **GitHub Actions Run ID**: `45748329278`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での描画＝状態C・車両分離/信号停止/歩行者横断動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **車同士のめり込み（オーバーラップ）防止修正**:
   - `src/traffic/trafficVehicle.ts` の前方検知を **前後バンパー先端基準＋安全車間バッファ（車両間 `2.6m`・歩行者 `3.2m`、減速開始 `20.0m`）** へ引き上げ、相手 OBB 9点サンプリング（中心・4隅・4辺中点）をゼロアロケーション実装。また信号待ち中や安全車間以下のデッドロック強制前進を禁止。
   - `src/world/collisionWorld.ts` にゼロアロケーションの **2D OBB vs OBB 分離軸定理（SAT）最小侵入深度分離関数 `computeObbObbSeparation`** を追加し、`resolveVehicleCollision` に OBB 分離パスを統合。
   - `src/traffic/trafficManager.ts` の毎フレーム更新末尾に、**全 AI 車両同士** および **AI 車両 vs 運転可能車両（自車含む）** の 2D OBB vs OBB SAT 最小侵入深度押し戻しパス（最大3回反復・安全マージン `0.08m`）を追加し、`applySeparationPush` で位置・セグメント距離・コライダーを即時同期。
2. **歩道を歩く通行人（AI歩行者6人）の実装**:
   - `src/pedestrians/` モジュール（`pedestrianRoutes.ts` / `pedestrianAgent.ts` / `pedestrianManager.ts` / `index.ts`）を新規作成。
   - 承認済みキャラクター GLB（`public/assets/characters/player.glb`）を1回だけロードして `SkeletonUtils.clone` で **6人** の AI 歩行者インスタンスを軽量生成（テクスチャ・ジオメトリ共有、`castShadow: false`、各個体ごとの独立 `AnimationMixer` により歩行速度連動の `Walking` と停止時 `Idle` をクロスフェード再生）。
   - 街区歩道（`±7.2m〜±9.5m`）および4方向横断歩道（`±8.4m`）を約 **4.2〜4.9 km/h（`1.16〜1.35 m/s`）** で周回・往来させ、進行方向のプレイヤー・車両・他歩行者に対して一時停止・軽回避・最小距離分離を実装。AI 交通車両側にも歩行者位置を共有して相互停止連携。
3. **日本式信号サイクルと交通・歩行者の連動**:
   - `src/traffic/trafficLights.ts` を新規作成し、中央交差点4隅に日本式の横型3灯車両信号機（左から青・黄・赤、バイザー付き）＋縦型2灯歩行者用信号機（上赤・下青）＋亜鉛メッキ支柱＆制御箱を共有ジオメトリ・発光マテリアル・支柱 OBB コライダー付きで設置。
   - **青 15秒（終盤3秒は歩行者青点滅）→ 黄 3秒 → 全赤 1.5秒 → 赤 19.5秒** のサイクルで南北・東西を交互切替。赤・黄信号時は AI 交通車両が停止線（`11.4m`）手前でバンパーを揃えて停止し、AI 歩行者は横断歩道側の信号が青点灯中のときのみ横断開始（横断中は対岸まで渡り切る）するよう連動。
4. **M1 iPad Air 最適化**:
   - 毎フレームの障害物配列・OBB・サンプリング配列をすべて事前確保プール＆固定長 `Float64Array` で再利用し、信号マテリアル更新も状態変化時のみ実行するゼロアロケーション設計を採用。

#### 変更ファイル一覧
- `src/world/collisionWorld.ts`（2D OBB vs OBB SAT 最小侵入深度分離 `computeObbObbSeparation` 追加・`resolveVehicleCollision` 統合）
- `src/traffic/trafficLights.ts`（新規作成：日本式信号機3Dモデル・発光マテリアル・青/黄/赤サイクル制御）
- `src/traffic/trafficVehicle.ts`（バンパー基準前方検知強化・信号停止連動・歩行者検知・`applySeparationPush`・ゼロアロケーション化）
- `src/traffic/trafficManager.ts`（車両間 OBB SAT 分離パス追加・信号/歩行者連携・ゼロアロケーション化）
- `src/traffic/index.ts`（`TrafficLightController` エクスポート追加）
- `src/pedestrians/pedestrianRoutes.ts`（新規作成：歩道・4方向横断歩道の6人分巡回ルート定義）
- `src/pedestrians/pedestrianAgent.ts`（新規作成：独立 `AnimationMixer`・信号連動・回避/停止/分離）
- `src/pedestrians/pedestrianManager.ts`（新規作成：`SkeletonUtils.clone` による6人統括管理）
- `src/pedestrians/index.ts`（新規作成：モジュールエクスポート）
- `src/engine/scene.ts`・`src/App.tsx`・`src/ui/DebugHud.tsx`（信号・AI歩行者統合、ゼロアロケーション更新、HUD に Phase 3-B / Pedestrians / Signal 追加）
- `docs/PROGRESS.md`（本記録を更新）

---

### 作業ID: 3-A（iPadタッチ操作UI消失不具合修正 & AI交通車両の自動走行システム）
- **実施日**: 2026-11-26
- **コミットID**: `7c84879`（`7c84879cdb1ed1b3f257c31b9f1905a371753af0`）
- **GitHub Actions Run ID**: `45745122647`（`Deploy to GitHub Pages`: `build` = `success`, `deploy` = `success`）
- **検証ランク**: **状態B**（コード実装・CIビルド＆GitHub Pagesデプロイ成功／実ブラウザ・iPad Air 第5世代実機での描画＝状態C・タッチUI維持/AI交通走行/前方停止動作＝状態D・実機検証＝状態Eは未実施）

#### 実装内容
1. **iPadタッチ操作UI（移動スティック・車ステアリングアイコン）が途中で消える不具合の修正**:
   - `src/input/inputManager.ts` にタッチ対応端末判定 `isTouchCapableDevice()`（`'ontouchstart' in window || navigator.maxTouchPoints > 0`）を追加し、タッチ対応端末ではマウスやキーボードイベントが発生してもタッチ入力を無効化しないこと、またタッチ直後にブラウザが発火する互換マウスイベントの干渉を防止するよう修正。
   - `src/ui/TouchControls.tsx` から徒歩／運転 UI の条件付きアンマウントおよび `opacity: 0` を廃止し、移動スティック（ベースリング＋ノブ）および運転時左右ステアリングボタンを常時 DOM マウント・固定表示化。
   - マルチタッチ・`pointercancel`・`touchcancel`・`lostpointercapture`・`blur`・`visibilitychange` 発生時はポインタID解放とノブ原点復帰のみを行い描画自体を絶対に消さない保護処理、および iPadOS Safari のマルチタッチ時ピンチ誤爆を防ぐ `gesturestart` / `gesturechange` / `gestureend` 抑止を追加。
   - `src/index.css` にて `.viewport-root`（`100dvw` / `100dvh` 固定）と `.touch-layer`（`position: fixed; isolation: isolate; transform: translate3d(0, 0, 0)`）を補強し、WebGL キャンバス上でのコンポジット欠落を防止。
2. **AI交通車両の自動走行システム（作業ID: 3-A）**:
   - `src/traffic/` モジュール（`roadNetwork.ts` / `trafficConfig.ts` / `trafficVehicle.ts` / `trafficManager.ts` / `index.ts`）を新規作成。
   - 既存の承認済み実車 GLB（`2011_-_13_toyota_kijang_innova_2.0_g_tgn40.glb` × 2台、`thunderbolt_96_interceptor_-_low_poly_model.glb` × 2台、計 **4台**）を URL 単位のテンプレートキャッシュから `clone(true)` で軽量ロード（M1 iPad Air 最適化、`castShadow: false`）。
   - **日本の左側通行**（内側走行レーン中心 `±1.65m`）に基づく十字路道路ネットワーク（直進・小回り左折・大回り右折の2次ベジェ曲線＋街区端折り返しループ）を構築し、4輪独立回転と曲率連動の前輪ステアリングで **約 32〜38 km/h** にて自動走行。
   - 毎フレーム前方障害物（歩行中プレイヤー・運転可能車両2台・他のAI交通車両・交差点内交差車両）を OBB ベースの前方コリドーで検知し、衝突せず手前で滑らかに減速・完全停止・車間距離維持（交差点デッドロック防止ロジック付き）。
   - 全 AI 車両の OBB コライダーを毎フレーム `CollisionWorld` へ動的同期し、プレイヤーや自車がすり抜けないように実装。あわせて既存路肩駐車車両および運転可能車両2台の初期位置を路肩側（`±4.1m〜±4.35m`）へ微調整し、走行レーンとの干渉を解消。

#### 変更ファイル一覧
- `src/input/inputManager.ts`（タッチ対応端末判定・互換マウスイベント干渉防止）
- `src/ui/TouchControls.tsx`（条件付きアンマウント廃止・マルチタッチ/`pointercancel`/`touchcancel`保護・Safariジェスチャー抑止）
- `src/index.css`（固定ビューポート・コンポジットレイヤー固定・`opacity: 1` 固定表示スタイル）
- `src/traffic/roadNetwork.ts`（新規作成：日本の左側通行十字路ネットワーク・交差点ベジェ曲線・折り返しループ）
- `src/traffic/trafficConfig.ts`（新規作成：承認済み車両GLB 4台の設定・4輪独立ノード定義）
- `src/traffic/trafficVehicle.ts`（新規作成：自動走行・車輪回転・前方障害物検知・車間距離維持・OBB同期）
- `src/traffic/trafficManager.ts`（新規作成：テンプレートキャッシュ＆クローンによる4台統括管理）
- `src/traffic/index.ts`（新規作成：モジュールエクスポート）
- `src/vehicle/vehicleConfig.ts`・`src/vehicle/vehicleController.ts`・`src/world/cityLayout.ts`（路肩駐車位置の微調整・`getDimensions()` 追加）
- `src/engine/scene.ts`・`src/App.tsx`・`src/ui/DebugHud.tsx`（`TrafficManager` 統合・HUD に Phase 3-A / AI Traffic 稼働数追加）
- `docs/PROGRESS.md`（本記録を更新）

---

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
