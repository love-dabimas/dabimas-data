# dabimasData 現行仕様

更新日: 2026-04-29
対象: `dabimas-data` の現行 React 版実装
正とする実装: `src/`, `tools/`, `json/`, `.github/workflows/`

---

## 1. 位置づけ

この文書は、旧HTML/Vue/AlaSQL版を再構築するためのメモではなく、現在このリポジトリで動いている実装の仕様をまとめる。

現行アプリは次の構成で動く。

- React 19 + TypeScript + Vite
- 状態管理は Zustand
- 検索はフロント側の TypeScript 実装
- 実行時データは静的 JSON
- GitHub Pages では `dist/` を Pages artifact として配信する

旧実装由来の用語や互換データは残っているが、画面の正は `src/` 配下の React 実装である。

---

## 2. 実行時に読むデータ

アプリ起動時、`src/features/horses/api/loadHorseData.ts` が以下を並列取得する。

```txt
json/horselist.json
json/factor.json
json/nonordinary_abilities_bundle.json
```

取得パスは `import.meta.env.BASE_URL` を基準に組み立てる。
GitHub Pages のサブパス配信でも壊れないようにするため、直接 `/json/...` では参照しない。

`vite.config.ts` では `json/*.json` と `static/` 配下の必要ファイルを `dist/` へコピーする。

---

## 3. 馬データ

`horselist.json` の1件は `HorseRecord` として扱う。

主なフィールドは以下。

```ts
interface HorseRecord {
  SerialNumber: string;
  Gender: "0" | "1";
  HorseId: string;
  FactorFlg: string;
  RareCd: string;
  Category: string;
  Category_ht: string;
  Paternal_t: string;
  Paternal_ht: string;
  Paternal_jik: string;
  Paternal_mig: string;
  Ped_All: string;
  card: HorseCardData;
}
```

`card` には表示用に整形済みのデータを持つ。

- 馬名
- 非凡名
- 非凡詳細
- 天性詳細
- レア表示
- 能力値
- 因子カウント
- 血統表
- 配合理論

`site_metadata.json` から取得した非凡・天性の詳細は、`generate_horselist.py` の生成時に `card.abilityData` / `card.temperamentData` へ取り込まれる。

---

## 4. 非凡詳細の補完

`loadHorseData.ts` は `json/nonordinary_abilities_bundle.json` も読み込む。

`card.abilityData` が空で、かつ `card.ability !== "なし"` の馬については、非凡バンドルの `abilities` と `ability_details` を能力名で引き、`card.abilityData` を補完する。

この補完は主に、馬データ側に詳細がない非凡の紹介画面を表示するためのもの。

---

## 5. 検索条件

検索条件は `SearchCriteria` に集約する。

```ts
interface SearchCriteria {
  fatherLines: string[];
  damSireLines: string[];
  migotoLines: string[];
  thinLines: string[];
  rareCodes: string[];
  keyword: string;
  theory: string[];
  runningStyle: string[];
  growth: string[];
  dirt: string[];
  achievement: string[];
  stable: string[];
  clemency: string[];
  potential: string[];
  health: string[];
  temperamentNames: string[];
  nonordinaryHorseIds: string[] | null;
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}
```

条件なしでは結果を出さない。
`hasPrimaryCondition` が false の場合、種牡馬・牝馬とも空配列を返す。

---

## 6. メイン検索

メイン検索は `src/features/search/lib/filterHorseRecords.ts` で行う。

初回に `createHorseSearchIndex()` でビットセット形式の検索インデックスを作る。

インデックス化する主な条件は以下。

- `HorseId`
- 自身の親系統
- 母父の親系統
- 見事系統
- 1薄系統
- レア
- 配合理論
- 脚質
- 成長型
- ダート適性
- 実績、安定、気性、底力、体質
- 天性名

キーワード、子系統、祖先位置検索は正規表現ベースで後段判定する。

---

## 7. キーワード検索

キーワード検索用テキストは `Ped_All` そのものではなく、`keywordTexts` として検索インデックスに保持する。

現在の構成は以下。

```txt
Ped_All + card.ability + card.abilityData.name
```

これにより、血統表や祖先名だけでなく、カードに表示される非凡名でも検索できる。

例:

```txt
明鏡止水
```

を入力した場合、血統文字列に含まれていなくても、非凡名として保持している馬が検索対象になる。

非凡名を `Ped_All` 自体へ書き込むのではなく、検索用テキストへ合成する。
これにより、血統データ本体の意味を汚さず、検索だけ高速化できる。

---

## 8. レア条件

レア条件の表示順とラベルは `src/shared/constants/rareCodes.ts` を正とする。

```txt
真 / 極 / 驫 / ５ / ４ / ３ / ２ / １ / 券 / 名 / 優 / 良 / 可 / 無
```

数字ラベルは全角で表示する。

初期選択は以下。

```txt
8, 7, 6, 5, 4, Z, Y, X
```

レアだけが選ばれている状態は、主検索条件とは扱わない。
キーワード、系統、能力、天性、非凡検索などの主条件が入って初めて結果を出す。

---

## 9. 絞り込みモーダル

`src/features/search/ui/AncestorModal.tsx` が詳細絞り込みを担当する。

表示する条件は以下。

- 配合理論
  - 完璧
  - 超完璧
  - 奇跡
  - 至高
- 能力
  - 適応力
  - 実績
  - 安定
  - 気性
  - 底力
  - 体質
- 脚質
- 成長型
- 天性
- 自身の子系統
- 母父の子系統
- 祖先指定
- 祖先位置

天性の選択肢は固定値ではなく、読み込んだ馬データの `card.temperamentData?.name` から導出する。

祖先指定は、祖先名だけでは条件にならない。
祖先位置も同時に指定した場合に `Ped_All` へ正規表現を当てる。

---

## 10. 非凡検索

非凡検索は `src/features/search/ui/NonordinaryModal.tsx` と `src/features/nonordinary/lib/searchNonordinaryAbilities.ts` が担当する。

モーダルで指定できる条件は以下。

- 騎乗指示
- レース
- 馬場状態
- 天候

「検索する」ボタン押下時は、モーダル内で結果一覧を確定表示するのではなく、条件に合う非凡を持つ馬の `HorseId` 配列を呼び出し元へ返す。
呼び出し元は `criteria.nonordinaryHorseIds` にその配列を入れ、メイン検索結果として該当馬を表示する。

`nonordinaryHorseIds` の意味は以下。

```txt
null: 非凡検索条件は未適用
[]: 非凡検索は適用済みだが、該当馬なし
["2737142543", ...]: 該当馬のみ表示
```

---

## 11. 非凡・天性の紹介画面

結果カード上の非凡・天性は `HorseSkillModal` で表示する。

表示上の仕様は以下。

- 見出し色はアプリ全体と同じ緑系
- 発揮効果、発揮条件、発揮対象、発揮確率をセクション表示する
- 箇条書きの継続行は1文字分インデントする
- 複数詳細がある場合は「その1」「その2」などのタブで切り替える

---

## 12. 並び順

検索結果は `sortHorseRecords()` で以下の順に並べる。

1. `FactorFlg` 降順
2. `RareCd` の独自ランク降順
3. `SerialNumber` 昇順

種牡馬・牝馬は同一条件から同時に作られ、タブで表示を切り替える。

---

## 13. 表示件数

初期表示件数は `DEFAULT_VISIBLE_COUNT = 15`。
種牡馬タブと牝馬タブでそれぞれ保持する。

条件がない場合の案内文は以下。

```txt
検索条件を選択してください
キーワード、系統、能力、レア度、非凡・天性などから条件を指定すると、該当する馬を表示します。
```

---

## 14. データ生成

主な生成スクリプトは以下。

```txt
tools/horse_data/scrape_source.py
tools/horse_data/generate_horselist.py
tools/nonordinary_data/generate_nonordinary_bundle.py
```

`scrape_source.py` はダビマス全書の種牡馬・繁殖牝馬ページを巡回し、`data/source/workbook.json` と `data/source/site_metadata.json` を作る。

`site_metadata.json` には、馬ごとの非凡な才能・天性の詳細が入る。

`generate_horselist.py` は `workbook.json` と `site_metadata.json` から以下を作る。

```txt
json/horselist.json
json/factor.json
```

`generate_nonordinary_bundle.py` はダビマス全書の才能一覧ページから非凡検索用バンドルを作る。

```txt
json/nonordinary_abilities_bundle.json
```

---

## 15. 定期実行

`.github/workflows/update-horse-data.yml` が週次更新を担当する。

実行タイミング:

```txt
毎週金曜 18:00 JST
workflow_dispatch による手動実行
```

処理順は以下。

1. Node/Python依存をインストール
2. `scrape_source.py` でソースデータと `site_metadata.json` を更新
3. `generate_horselist.py` で `horselist.json` と `factor.json` を生成
4. `generate_nonordinary_bundle.py --refresh` で非凡バンドルを生成
5. Pythonテスト
6. `npm run build`
7. 生成物に差分があればコミットしてpush

コミット対象は以下。

```txt
data/source/workbook.json
data/source/site_metadata.json
data/nonordinary/raw/official_search/abilities.html
json/horselist.json
json/factor.json
json/nonordinary_abilities_bundle.json
dist
```

---

## 16. デプロイ

`.github/workflows/deploy-pages.yml` が GitHub Pages への配信を担当する。

`main` への push または手動実行で以下を行う。

1. `npm ci`
2. `npm run build`
3. `dist/` を Pages artifact としてアップロード
4. GitHub Pages へデプロイ

Pages用のビルドでは以下を使う。

```txt
VITE_BASE_PATH=/dabimas-data/
VITE_DEPLOY_MODE=artifact-root
```

週次データ更新ワークフロー内のビルドでは、コミットされる `dist/` 用に以下を使う。

```txt
VITE_BASE_PATH=/dabimas-data/dist/
VITE_DEPLOY_MODE=artifact-root
```

---

## 17. 確認コマンド

通常の確認は以下。

```powershell
npm run build
npm run verify:parity
python -m pytest
```

非凡バンドルだけ再生成する場合:

```powershell
python tools/nonordinary_data/generate_nonordinary_bundle.py --refresh
```

馬データをソースJSONから再生成する場合:

```powershell
python tools/horse_data/generate_horselist.py `
  --source-json ./data/source/workbook.json `
  --site-metadata ./data/source/site_metadata.json `
  --output ./json/horselist.json `
  --factor-output ./json/factor.json
```
