# 作業指示書: R2 正本化の検収指摘を直す（公開経路・性別をまたぐ馬 ID・非凡検索・CI・R2 取得の再試行・牝馬の公開判定）

- status: 完了（2026-10-08 検収。修正なし。未コミット）
- 作成日: 2026-10-08（同日、指摘 6「牝馬の公開判定」を追記）
- 依頼元: Claude Code セッション（`codex-implement` 依頼モード）
- 対象リポジトリ: **`dabimas-data`（ダビ娘）**
- 枝: **`release/2026-11`**。R2 正本化の実装は、この枝に**ステージ済み・未コミット**の状態で置かれている。その上に重ねて作業する
- 上位設計: `docs/r2_source_migration_design.md`（R2 正本化 生成処理 設計書）
- 運用メモ: `docs/r2_generation.md`

---

## いちばん大事な制約

### 11 月まで公開しない

- **コミットしない。push しない。`main` にマージしない。**
- **リポジトリの `dist/` を書き換えない。** ビルドの確認は必ず `npm run build -- --outDir .tools/r2-build` のように `.tools/` 配下へ出す。
  作業の最後に `git status --short --untracked-files=all dist` が空であること。
- `.tools/` は `.gitignore` 済み。検証用の一時ファイルはすべて `.tools/` に置く。

### 既存の馬 ID と通し番号を変えない

- `data/source/id_ledger.json` を変更しない（作業の最後に `git diff --stat -- data/source/id_ledger.json` が空）。
- 生成し直した `json/horselist.json` で、既存の馬の `HorseId` と `SerialNumber` が変わらないこと（受け入れ基準 A5）。

---

## 背景と目的

ダビ娘のデータを、ダビマス全書（公式攻略サイト）ではなく、ゲーム本体から取得して R2 に置いたデータ（以下 R2）を正本にして作る改修を実装した。その検収で、次の問題が見つかった。本指示書はこれらを直す。

### 指摘 1（重大）: 毎日生成しても公開サイトに届かない

- GitHub Pages は **「main ブランチの中身をそのまま配信」**（`build_type: legacy`、source: `main` の `/`）で動いている。
- 公開中のダビ娘は `https://love-dabimas.github.io/dabimas-data/dist/` で、**リポジトリにコミットされた `dist/` を配信**している。アプリは `${BASE_URL}json/horselist.json`、つまり `dist/json/horselist.json` を読む（`src/features/horses/api/loadHorseData.ts:18`）。
- 旧週次ワークフローは `VITE_BASE_PATH=/dabimas-data/dist/` でビルドして `dist/` をコミットしていた。ボットによる push でも Pages の再構築（`pages-build-deployment`）が毎回動いていることを、過去の実行履歴で確認済み。
- 新しい日次ワークフロー（`.github/workflows/generate-from-r2.yml`）は `json/` だけをコミットし、`deploy-pages.yml`（Actions 経由の配信）を起動している。この起動は今の Pages 設定では効かない。**その結果、毎日生成しても利用者に届かない。**

### 指摘 2（今回の改修で発生）: 同じ馬 ID の牝馬が、種牡馬の非凡データを上書きする

- ダビマス全書の 10 桁の馬 ID は、**種牡馬と牝馬で同じ番号が使われることがある**。現在の生成結果では 463 件が重複している。
- `tools/horse_data/r2_source.py` の `convert_source`（210 行付近）は、非凡・天性などのデータを **`HorseId` だけをキーにした辞書**（`horse_metadata`）に入れる。種牡馬の後に牝馬を処理するため、同じ ID の牝馬（非凡なし）が種牡馬の分を上書きする。
- 読み出す側の `generate_horselist.build_records_from_source` も、`site_metadata_horses.get(horse_id)` と **`HorseId` だけで引いている**。
- 実害: **オルフェーヴル2013（種牡馬、HorseId `3614530278`）のカードから、非凡「破天」の詳細と R2 の非凡 ID が消える。** 同じ ID の牝馬はペスカトーレ。
- 改修前の処理でも、逆向きの害があった。改修前の `json/horselist.json`（HEAD）では、**牝馬ペスカトーレのカードに種牡馬の非凡「破天」が出ていた**。性別をキーに含めれば、両方とも直る。

### 指摘 3（改修前からある不具合）: 非凡検索で種牡馬の代わりに牝馬が出る

- `src/features/nonordinary/lib/searchNonordinaryAbilities.ts:295` の `horsesById` は、**牝馬も含めた全馬**を `HorseId` で索引している（`indexBy` は後勝ち）。
- 実データで「破天」を検索すると、オルフェーヴル2013 ではなく、同じ ID の**牝馬ペスカトーレ**が結果に出る（HEAD のデータでも同じ）。
- 非凡検索の結果を一覧に反映する絞り込み（`src/features/search/lib/filterHorseRecords.ts` の `horseIdIndexes`。登録 188 行・使用 435 行）も `HorseId` だけで照合する。そのため、絞り込み中に牝馬タブで同じ ID の牝馬が出てしまう。
- 非凡は種牡馬だけが持つ。非凡検索の絞り込みで牝馬が出るのは誤り。

### 指摘 4（軽微）: CI でテストが動かない

旧週次ワークフローにあった `python -m pytest` とビルドが外れ、日次でもテストせずにコミットしている。

### 指摘 5（軽微）: R2 取得が再試行しない

- R2 の公開ファイルは CDN 経由で、キャッシュは最大 5 分（`Cache-Control: public, max-age=300`）。
- パイプラインが R2 を更新している最中に取得すると、5 ファイルの `dataset_version` が食い違うことがある。今は `load_r2` が `ValueError` で止まり、その日の生成が失敗する。

### 指摘 6（追記）: 牝馬に公開判定がかかっていない

- R2 側で、`broodmare_master.game.json` の各牝馬に `display_start_at`（表示開始日時、UTC の ISO 8601。空なら常に表示）を追加する予定。形式は種牡馬の `display_start_at` と同じ。牝馬側には `display_start_at_raw` と `time_policy` はない。
- 事前に受け取ったサンプル（`schema_version: 6`、`display_start_at_field_map.status: verified`）では、507 頭中 135 頭に日時が入っていた。そのうち 7 頭が 2030-01-01（未公開を表す仮の日付）だった。該当はワンダーメルシャン、コンモベドール、ユイレポート、ローブチェイサー、セットクラクション、カインスレード、リズウェンディ。
- 今の `convert_source` は、公開判定を種牡馬にしかかけていない（`tools/horse_data/r2_source.py:154` の `if gender == "0" and not is_published(horse, cutoff):`）。R2 に日付が入っても、**公開前の牝馬が表示されてしまう**。
- 現在の R2 には牝馬の `display_start_at` がない（すべて空扱い）。そのため、この修正を入れても今のデータでの出力は変わらない。先に入れておいてよい。

---

## 実装方針

### 1. 日次ワークフローで `dist/` をビルドしてコミットする（指摘 1・4）

`.github/workflows/generate-from-r2.yml` を次の手順にする。

1. checkout（`ref: main`）。Python 3.12 と Node.js 22（`cache: npm`）をセットアップし、`pip install -r requirements.txt` と `npm ci` を実行する。
2. R2 の 5 ファイルを取得する（現行どおり `python -m tools.horse_data.download_r2 --output "$RUNNER_TEMP/r2"`。再試行は §5）。
3. 生成する（現行どおり。`--as-of` の扱いも現行どおり）。
4. **テスト:** `python -m pytest` と `npx tsx --test tests/*.test.ts` を実行する。失敗したらジョブを失敗させ、コミットしない。
5. **ビルド:** 旧週次ワークフローと同じ環境変数で `npm run build` する。出力先はリポジトリの `dist/`（CI 上なので書き換えてよい）。
   ```yaml
   env:
     VITE_BASE_PATH: /dabimas-data/dist/
     VITE_DEPLOY_MODE: artifact-root
   ```
   旧週次ワークフローの該当ステップは `git show HEAD:.github/workflows/update-horse-data.yml` で確認できる。
6. **コミット:** `git status --porcelain -- json/horselist.json json/factor.json dist` が空なら終了する。差分があれば、`json/horselist.json`、`json/factor.json`、`dist` を add し、コミットして `git push origin HEAD:main` する。
   - 週次で `json/nonordinary_abilities_bundle.json` だけが変わった場合も、ビルドで `dist/json/` に反映されて差分になる。そのため、この条件だけで週次の変更も公開される。
7. **`deploy-pages.yml` を起動するステップを削除する。** あわせて、このワークフローの `permissions` から `actions: write` を外す（`contents: write` は残す）。

`.github/workflows/update-horse-data.yml`（週次）は変えない。週次は最後に日次を `workflow_dispatch` で起動しているので、上の手順で公開まで届く。

`.github/workflows/deploy-pages.yml` は変更も削除もしない（スコープ外）。

### 2. 非凡・天性データのキーに性別を含める（指摘 2）

キーの形式は **`"<Gender>:<HorseId>"`**（例: `"0:3614530278"`、`"1:3614530278"`）とする。

- `tools/horse_data/r2_source.py` の `convert_source`
  - R2 の行で `horse_metadata[...]` に書き込むキーを、`f"{gender}:{identity['HorseId']}"` に変える。
  - ダビマス全書から補完する行（関数末尾の `official["all"]` のループ）は、従来どおり公式の `site_metadata`（`HorseId` だけのキー）を使う。後述の読み出し規則で引けるので、変換は不要。
- `tools/horse_data/generate_horselist.py` の `build_records_from_source`
  - 読み出しを次の規則にする。この規則は小さな関数に切り出し、`r2_source.py` と同じ形式のキーを組み立てる。
    ```text
    1. site_metadata_horses.get(f"{gender}:{horse_id}") があればそれを使う
    2. なければ、gender == "0"（種牡馬）のときだけ site_metadata_horses.get(horse_id) を使う
    3. 牝馬は 2 の HorseId だけのキーを使わない
    ```
  - ダビマス全書の `site_metadata.json` は種牡馬の非凡・天性しか持たない。そのため規則 3 で、**旧来の処理（`--source-json` だけで生成する場合）でも、牝馬に種牡馬の非凡が付かなくなる。**
- `tools/horse_data/id_ledger.py` の `official_horses`
  - `"ability": metadata.get(horse_id, {}).get("extraordinaryAbility")` は、**種牡馬（Gender `"0"`）のときだけ**引く。牝馬は `None`。
- `tools/horse_data/site_metadata.py` と `data/source/site_metadata.json` の形式は変えない。

### 3. 非凡検索で牝馬を引かない（指摘 3）

- `src/features/nonordinary/lib/searchNonordinaryAbilities.ts`
  - `horsesById` を、**種牡馬（`horse.Gender === "0"`）だけ**から作る。
  - その直後の `legacy_ids` を登録するループも、種牡馬だけを対象にする。
  - `horsesByGameAbility` はすでに種牡馬に絞っているので、そのままでよい。
- `src/features/search/lib/filterHorseRecords.ts`
  - `horseIdIndexes` には**種牡馬だけ**を登録する（188 行付近の `addIndexValue(index.horseIdIndexes, ...)` を `Gender === "0"` のときだけ実行する）。
  - `horseIdIndexes` が非凡の絞り込み（435 行付近）以外で使われていないことを、実装前に grep で確認すること。他でも使われていたら実装せず、完了報告に書いて止まる。
  - 期待する動作: 非凡検索の絞り込みを適用している間、牝馬タブは常に 0 件。絞り込みがない（`nonordinaryHorseIds === null`）ときの動作は変えない。

### 4. R2 取得を再試行する（指摘 5）

- `tools/horse_data/r2_source.py`
  - `class DatasetVersionMismatch(ValueError)` を追加する。`load_r2` の `dataset_version` 不一致・欠落のときは、これを raise する。メッセージは現行と同じでよい。
  - 他の検証エラー（参照切れ、因子 ID 不正など）は従来どおり `ValueError` のまま。
- `tools/horse_data/download_r2.py`
  - 「5 ファイルをすべて一時ディレクトリに取得して `load_r2` で検証する」までを 1 回の試行とする。
  - **再試行するのは、次の例外のときだけ:** `DatasetVersionMismatch`、`urllib.error.URLError`（`HTTPError` を含む）、`TimeoutError`。
  - 試行は最大 3 回。失敗した試行の後は 120 秒待つ。回数と待ち時間は関数の引数にして、テストから小さい値・差し替えた `sleep` を渡せるようにする。
  - 3 回とも失敗したら、最後の例外をそのまま送出する。**出力先（`--output`）には何も書かない。**
  - 再試行するときは、何回目か・理由を標準エラーに 1 行出す。
  - 他の検証エラーは再試行せず、すぐ失敗させる。

### 4-2. 牝馬にも公開判定をかける（指摘 6）

- `tools/horse_data/r2_source.py` の `convert_source` で、公開判定の条件から `gender == "0" and` を外し、種牡馬・牝馬の両方に `is_published(horse, cutoff)` をかける。
- `is_published` は変えない（`display_start_at` が `None` なら公開扱い）。牝馬の行にキー自体がない場合も `None` として扱われることを、テストで確認する。
- 公開前の馬を除外する位置は、今と同じく血統・配合理論の計算より前（`rows` に入れる前）。
- `check_population`（公開頭数の 1% 減少チェック）は種牡馬だけのまま変えない。
- 補完（関数末尾の `official["all"]` のループ）は、R2 にいる牝馬の名前を未公開も含めて `names` に持っている。そのため、未公開の牝馬がダビマス全書の行で補われることはない。この動作は変えず、テストで確認する。

### 5. 生成済みデータとドキュメントを更新する

- 実装とテストが通った後、実データで `json/horselist.json` と `json/factor.json` を生成し直す（受け入れ基準 A4 の手順）。
- `docs/r2_generation.md` の「GitHub の設定」節を、次の内容に直す。
  - 公開は「main ブランチ配信の GitHub Pages」で、日次ワークフローが `dist/` をビルドしてコミットする。
  - `deploy-pages.yml` は日次・週次から起動しない。
  - 日次はテストが通らなければコミットしない。
  - R2 取得は、版の食い違いと通信エラーのとき最大 3 回再試行する。
- 同じファイルの「ローカル生成」節にある公開判定の説明を、「種牡馬・牝馬とも `display_start_at` で判定する（空なら公開）」に直す。

### 変更対象ファイル

- `.github/workflows/generate-from-r2.yml` — テスト・ビルド・`dist` のコミットを追加。`deploy-pages.yml` の起動と `actions: write` を削除
- `tools/horse_data/r2_source.py` — 非凡データのキーに性別を含める。`DatasetVersionMismatch` を追加。牝馬にも公開判定をかける
- `tools/horse_data/generate_horselist.py` — 非凡データの読み出し規則を変更
- `tools/horse_data/id_ledger.py` — `official_horses` で、非凡を引くのを種牡馬だけにする
- `tools/horse_data/download_r2.py` — 再試行
- `src/features/nonordinary/lib/searchNonordinaryAbilities.ts` — 種牡馬だけを索引
- `src/features/search/lib/filterHorseRecords.ts` — `horseIdIndexes` に種牡馬だけを登録
- `tests/test_r2_source.py` — テスト追加（受け入れ基準 A1）
- `tests/searchNonordinaryAbilities.test.ts` — テスト追加（受け入れ基準 A2）
- 新規 `tests/filterHorseRecords.test.ts` — 非凡の絞り込みのテスト（受け入れ基準 A2）
- `json/horselist.json`、`json/factor.json` — 実データで生成し直す
- `docs/r2_generation.md` — 運用メモの更新

## 制約

- `AGENTS.md` があれば従うこと（現時点ではリポジトリに存在しない）。
- 既存のコードの書き方（関数の粒度、コメントの量、命名）に合わせる。Python は型ヒント付き、TypeScript は既存の `indexBy` / `groupBy` を使う。
- `json/horselist.json` の構造（キー名・入れ子）を変えない。値が変わってよいのは受け入れ基準 A5 で許した項目だけ。
- 依存パッケージを追加しない（`requirements.txt`、`package.json` を変えない）。
- ネットワークに出るのは、受け入れ基準の手順で指定したものだけ。R2 の実データは、下記のローカル Zip を使う。

## スコープ外（やらないこと）

- `.github/workflows/deploy-pages.yml` と `.github/workflows/update-horse-data.yml` の変更
- GitHub Pages の設定変更
- `data/source/id_ledger.json`、`data/source/ability_links*.json`、`data/source/workbook.json`、`data/source/site_metadata.json`、`json/nonordinary_abilities_bundle.json` の変更
- `docs/r2_source_migration_design.md`（設計書）の変更。設計書との差は Claude 側で直す
- 馬 ID の形式や台帳の仕組みの見直し
- 気づいた別の問題は直さず、完了報告の「残課題・気づき」に書く。

## 受け入れ基準

### A1. Python のテストが通り、次のテストが追加されている

`python -m pytest` がすべて成功し（skip は現状の 3 件まで）、`tests/test_r2_source.py` に次のテストがある。

- **同じ HorseId の種牡馬と牝馬:** 台帳で種牡馬 1 頭と牝馬 1 頭に同じ `HorseId` を割り当て、`convert_source` → `build_records_from_source` する。種牡馬のレコードには `card.abilityData` と `card.abilityGameId` があり、牝馬のレコードは `card.abilityData` が `None`、`card.ability` が空。
- **旧来の処理の牝馬:** `site_metadata` に `HorseId` だけのキーで非凡がある場合、同じ ID の種牡馬には付き、牝馬には付かない（`build_records_from_source` を直接呼ぶ）。
- **再試行（成功）:** 1 回目は `DatasetVersionMismatch`、2 回目は成功する偽の取得処理で、2 回目の結果が出力先に書かれる。`sleep` が 1 回呼ばれる。
- **再試行（失敗）:** 3 回とも `DatasetVersionMismatch` なら、例外が送出され、出力先にファイルが作られない。`sleep` が 2 回呼ばれる。
- **再試行しない:** 参照切れの `ValueError` では 1 回で失敗し、`sleep` は呼ばれない。
- **牝馬の公開判定:** 牝馬 3 頭を用意する。`display_start_at` が基準時刻以前の牝馬、基準時刻より後（例: `"2030-01-01T00:00:00Z"`）の牝馬、キー自体がない牝馬の 3 頭。`--as-of` 相当の基準日で `convert_source` → `build_records_from_source` すると、1 頭目と 3 頭目だけが出力される。
- **未公開の牝馬を補完しない:** 未来日付の R2 牝馬と同じ名前の牝馬が、ダビマス全書の行（`official["all"]`）にある場合、その牝馬は出力されない（R2 の行も全書の行も出ない）。

テストからネットワークに出ないこと（`urlopen` 相当と `sleep` は差し替える）。

### A2. TypeScript のテストが通る

`npx tsx --test tests/*.test.ts` がすべて成功し、次がある。

- `tests/searchNonordinaryAbilities.test.ts`: 種牡馬と牝馬が同じ `HorseId` を持つとき、公式経路（`ability_stallions`）で解決される馬が**種牡馬**であること。`source_stallions` の `horse.Gender` がすべて `"0"` であること。
- 新規 `tests/filterHorseRecords.test.ts`: `nonordinaryHorseIds` にある ID を、種牡馬と牝馬が共有しているとき、絞り込み結果に牝馬が含まれないこと。`nonordinaryHorseIds` が `null` のときは、牝馬も従来どおり含まれること。テストの書き方は `tests/searchNonordinaryAbilities.test.ts`（`node:test` と `node:assert/strict`）に合わせる。

### A3. ビルドが通り、リポジトリの `dist/` が変わらない

```sh
npm run build -- --outDir .tools/r2-build
git status --short --untracked-files=all dist
```

ビルドが成功し、2 行目の出力が空。

### A4. 実データで、オルフェーヴル2013 とペスカトーレが正しい

実データの R2 Zip: `C:\derby\data\pedigree_r2_pipeline\runs\20261007T121737Z\output.zip`
（dataset_version `2026-10-07T123420Z+raw.0ecfb7053e97`）

**実装を始める前に**、比較用の基準を保存しておく。

```sh
mkdir -p .tools/r2-20261007 .tools/baseline
unzip -o "C:/derby/data/pedigree_r2_pipeline/runs/20261007T121737Z/output.zip" -d .tools/r2-20261007
cp json/horselist.json .tools/baseline/horselist.json
cp json/factor.json .tools/baseline/factor.json
```

実装後に生成し直す（`--previous` には必ず基準を渡す）。

```sh
python -m tools.horse_data.generate_horselist --r2-dir .tools/r2-20261007/output --as-of 2026-10-07 --previous .tools/baseline/horselist.json
```

生成した `json/horselist.json` で、次が成り立つ。

- `Gender == "0"` かつ `HorseId == "3614530278"`（オルフェーヴル2013）: `card.abilityData.name == "破天"`、`card.abilityGameId == "10022"`、`card.sourceGameId == "145"`
- `Gender == "1"` かつ `HorseId == "3614530278"`（ペスカトーレ）: `card.abilityData` が `null`、`card.ability` が空文字
- `Gender == "1"` のレコードで、`card.abilityData`・`card.temperamentData`・`card.ability` のいずれかを持つものが 0 件
- 牝馬のレコード数が 507 のまま（この R2 には牝馬の `display_start_at` がないため、指摘 6 の修正で減らない）

### A5. 実データで、意図しない変化がない

A4 で生成した結果と `.tools/baseline/` を比べて、次が成り立つ。

- `json/factor.json` は基準とバイト単位で一致する。
- レコード数、`(Gender, HorseId)` の集合、各レコードの `SerialNumber` が基準と一致する。
- 基準と内容が異なるレコードは、**牝馬と `HorseId` を共有している種牡馬**（`Gender == "0"` で、同じ `HorseId` の `Gender == "1"` レコードがあるもの）に限る。
- そのレコードで異なってよいのは `card.abilityData`、`card.temperamentData`、`card.ability`、`card.abilityGameId`、`card.sourceGameId`、`legacy_ids` だけ。
- 異なるレコードの件数と馬名を、完了報告に列挙する。

### A6. 実データの非凡検索で、牝馬が出ない

A4 で生成した `json/horselist.json` と、リポジトリの `json/nonordinary_abilities_bundle.json` に対して、`searchNonordinaryAbilities` を条件なし（`{ race_id: null, tactics: [], going: [], weather: [] }`）で実行する。

- `source_stallions` のうち `horse.Gender !== "0"` のものが 0 件
- 「破天」の `source_stallions` に、`HorseId` `3614530278` の種牡馬オルフェーヴル2013 と、`r100026` の種牡馬オルフェーヴル2013 の両方が含まれる

確認用のスクリプトは `.tools/` に置き、`npx tsx` で実行する。結果の数値を完了報告に書く。

### A7. ワークフロー

`.github/workflows/generate-from-r2.yml` が次を満たす（目視で確認し、完了報告に該当行を引用する）。

- テスト（pytest と tsx）がコミットより前にあり、失敗すればコミットに進まない
- `VITE_BASE_PATH: /dabimas-data/dist/` と `VITE_DEPLOY_MODE: artifact-root` でビルドする
- コミット対象が `json/horselist.json`、`json/factor.json`、`dist` で、差分がなければコミットしない
- `deploy-pages.yml` を起動するステップがなく、`permissions` に `actions: write` がない

YAML として読み込めることを確認する。Python に `yaml` があれば `python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1], encoding='utf-8'))" .github/workflows/generate-from-r2.yml` で確認する。なければ、その旨を完了報告に書く。

### A8. 変えてはいけないものが変わっていない

```sh
git diff --stat -- data/source .github/workflows/deploy-pages.yml .github/workflows/update-horse-data.yml json/nonordinary_abilities_bundle.json
git status --short --untracked-files=all dist
```

どちらの出力も空（ステージ済みの差分と比べて、作業ツリー側の変更がないこと）。

## 検証コマンド

```sh
# 事前（実装前に 1 回だけ）
mkdir -p .tools/r2-20261007 .tools/baseline
unzip -o "C:/derby/data/pedigree_r2_pipeline/runs/20261007T121737Z/output.zip" -d .tools/r2-20261007
cp json/horselist.json .tools/baseline/horselist.json
cp json/factor.json .tools/baseline/factor.json

# 実装後
python -m pytest
npx tsx --test tests/*.test.ts
npm run build -- --outDir .tools/r2-build
python -m tools.horse_data.generate_horselist --r2-dir .tools/r2-20261007/output --as-of 2026-10-07 --previous .tools/baseline/horselist.json
# A4〜A6 の確認スクリプト（.tools/ に作成）
git status --short --untracked-files=all dist
git diff --stat -- data/source .github/workflows/deploy-pages.yml .github/workflows/update-horse-data.yml json/nonordinary_abilities_bundle.json
```

---

## 完了報告（Codex が記入する）

> 実装完了後、この節を埋めてから作業を終えること。

### 変更ファイル一覧

- `.github/workflows/generate-from-r2.yml`: Node.js 22 / npm ci、Python・TypeScript テスト、既存の公開パス用ビルド、`dist/` を含む差分判定・コミットを追加。Actions 配信の起動と `actions: write` を削除。
- `tools/horse_data/r2_source.py`: 性別付きメタデータキー、`DatasetVersionMismatch`、牝馬の公開判定。
- `tools/horse_data/generate_horselist.py`: キー生成とメタデータ読込規則を関数化。公式の HorseId 単独キーは種牡馬のみ参照。
- `tools/horse_data/id_ledger.py`: 公式メタデータの非凡は種牡馬のみ参照。台帳ファイルは変更していない。
- `tools/horse_data/download_r2.py`: 最大3回の取得・検証、120秒待機、指定例外だけの再試行と監査ログ。
- `src/features/nonordinary/lib/searchNonordinaryAbilities.ts`: 公式ID・legacy IDの索引を種牡馬に限定。
- `src/features/search/lib/filterHorseRecords.ts`: 非凡絞り込み用の馬ID索引を種牡馬に限定。
- `tests/test_r2_source.py`: 性別衝突、旧ソース、公開判定、版の不一致・欠落、通信エラー、再試行の成功・失敗・非対象エラーを検証。
- `tests/searchNonordinaryAbilities.test.ts`: 同一IDと同一legacy IDを持つ牝馬がいても種牡馬を解決するテスト。
- `tests/filterHorseRecords.test.ts`（新規）: 非凡絞り込み時の牝馬除外、null時の従来動作、空配列時の0件を検証。
- `json/horselist.json`: 指定した基準日・前回データで再生成。
- `json/factor.json`: 同時に再生成したが、基準とバイト単位で一致し、今回の差分なし。
- `docs/r2_generation.md`: 公開経路、テスト、再試行、牝馬の公開判定の説明を更新。
- 本作業指示書: 完了報告を記入。

### 設計判断

- R2のメタデータは `horse_metadata_key(gender, horse_id)` で `Gender:HorseId` に分離。性別付きの空辞書も優先し、公式のID単独メタデータへのフォールバックは種牡馬だけに限定した。公式メタデータの保存形式は変更していない。
- 実装前の `rg -n horseIdIndexes src tests` で、索引の利用が非凡絞り込みだけであることを確認してから種牡馬に限定した。
- R2再試行は取得・検証の単位で行い、毎回新規の一時ディレクトリを使う。検証成功前には出力先を作成・更新しない。最終失敗は最後の例外をそのまま再送出する。既存の出力がある場合も保持する。
- 再試行回数・待機時間・sleep・取得関数を注入可能にし、テストは通信と実時間待機を行わない。
- 牝馬の公開判定だけを追加し、`is_published` と種牡馬限定の頭数減少チェックは変更していない。公開前の牝馬もR2候補名に残すため、公式補完で復活しない。
- 既存のステージ済み差分は保持し、今回の修正は未ステージの作業ツリー差分として残した。コミット・push・mainへのマージは行っていない。

### 実行した検証と結果

実装前に指定Zipを `.tools/r2-20261007/` に展開し、`json/horselist.json` と `json/factor.json` を `.tools/baseline/` に保存した。

#### A1: Python

`python -m pytest --basetemp .tools/pytest-r2-acceptance-all` → **48 passed, 3 skipped**。全51件。skipは従来の3件（比較用Excelなし2件、openpyxlなし1件）のまま。検証用一時ファイルは `.tools/` 配下へ設定した。新規テストはネットワークを使わず、sleepも差し替えた。

#### A2: TypeScript

`npx.cmd --no-install tsx --test tests/*.test.ts` → **3 passed**。Windowsの実行ポリシーに合わせて `.cmd` を使い、既存のインストール済みパッケージだけで実行した。同一IDの牝馬が後に並ぶ場合・前に並ぶ場合と、legacy IDの衝突も確認した。

#### A3: ビルド

`VITE_BASE_PATH=/dabimas-data/dist/`、`VITE_DEPLOY_MODE=artifact-root` を設定し、`npm.cmd run build -- --outDir .tools/r2-build` → **成功**（TypeScript型検査とViteビルド）。`git status --short --untracked-files=all dist` の出力は空。

#### A4・A5: 実データ生成・比較

```sh
python -m tools.horse_data.generate_horselist --r2-dir .tools/r2-20261007/output --as-of 2026-10-07 --previous .tools/baseline/horselist.json
python .tools/check_r2_acceptance.py
```

- レコード数 **3,028頭**（種牡馬2,521頭、牝馬507頭）。基準と一致。
- `(Gender, HorseId)` の集合と全レコードの `SerialNumber` は基準と一致。
- `factor.json` は基準とバイト単位で一致。
- オルフェーヴル2013（`0:3614530278`）: `abilityData.name = 破天`、`abilityGameId = 10022`、`sourceGameId = 145`。
- ペスカトーレ（`1:3614530278`）: `abilityData = null`、`ability = ""`。
- 非凡・天性・非凡名のいずれかを持つ牝馬は **0頭**。
- 内容が変わったのは以下の **2頭のみ**。どちらも牝馬とHorseIdを共有する種牡馬で、許可された項目以外の差分はない。

| 馬名 | HorseId | 変更項目 |
|---|---|---|
| オルフェーヴル2013 | `3614530278` | `card.abilityData` と `card.abilityGameId` を復元 |
| シュヴァルグラン | `4218645523` | `card.sourceGameId` を `377` から正しい `300021` に修正 |

比較結果は `.tools/r2-acceptance-diff.json` に保存した。

#### A6: 実データの非凡検索

`npx.cmd --no-install tsx .tools/check_r2_search.ts` → **成功**。

- 条件なしの検索結果: 非凡 **1,214件**。
- `source_stallions`: **1,348件**、解決された馬も **1,348件**。
- 解決された馬のうち種牡馬以外: **0件**。
- 「破天」に `3614530278` と `r100026` の両方のオルフェーヴル2013を含み、両方とも `Gender = "0"`。

結果は `.tools/r2-search-acceptance.json` に保存した。

#### A7: ワークフロー

PyYAMLで読込成功。ステップ順序・権限・環境変数・コミット対象を目視とassertで確認した。`.github/workflows/generate-from-r2.yml` の該当行は以下。

- 13〜14行: `permissions:` / `contents: write`。`actions: write` はない。
- 50行: `run: python -m pytest`
- 52行: `run: npx tsx --test tests/*.test.ts`
- 54行: `run: npm run build`
- 56行: `VITE_BASE_PATH: /dabimas-data/dist/`
- 57行: `VITE_DEPLOY_MODE: artifact-root`
- 60行: `if [ -z "$(git status --porcelain -- json/horselist.json json/factor.json dist)" ]; then`
- 62行: `exit 0`（差分なしで終了）
- 66行: `git add json/horselist.json json/factor.json dist`
- 67行: `git commit -m "Generate horse data from R2"`

テストとビルドが独立した先行ステップで、失敗を無視する設定はない。`deploy-pages.yml` を起動するステップはない。

#### A8: 変更禁止対象

以下はいずれも出力なし。

```sh
git diff --stat -- data/source .github/workflows/deploy-pages.yml .github/workflows/update-horse-data.yml json/nonordinary_abilities_bundle.json
git diff --stat -- data/source/id_ledger.json
git status --short --untracked-files=all dist
```

`git diff --check` も成功。依存パッケージ・設計書は変更していない。規約レビューと仕様レビューをそれぞれ実施し、両方とも指摘0件。

### 残課題・気づき

- 本指示書の実装・ローカル受け入れ基準に未対応項目はない。
- 11月まで公開しない制約に従い、本番ワークフローの実行・コミット・push・Pages設定変更は行っていない。今回の作業で実ネットワークへのアクセスも行っていない。

---

## 検収記録（Claude Code、2026-10-08）

判定: **完了**（差し戻しなし、検収側での修正なし）

受け入れ基準は、Codex の報告値を使わず、すべて検収側で再実行した。

| 基準 | 検収側の結果 |
|---|---|
| A1 | `python -m pytest` 48 passed / 3 skipped。追加テスト（性別衝突、旧ソースの牝馬、牝馬の公開判定、未公開牝馬の非補完、再試行の成功・失敗・非対象・通信エラー）を確認 |
| A2 | `npx tsx --test tests/*.test.ts` 3 passed |
| A3 | `VITE_BASE_PATH=/dabimas-data/dist/` でのビルドを `.tools/r2-build-claude` に出力して成功。リポジトリの `dist/` に変更なし |
| A4 | 基準はステージ版の `json/horselist.json` から取り直した（Codex の `.tools/baseline` と一致）。R2 20261007 / 基準日 2026-10-07 で生成した結果は、作業ツリーの `json/horselist.json` とバイト単位で一致した。オルフェーヴル2013 は 破天 / 10022 / 145。ペスカトーレは非凡なし。能力を持つ牝馬は 0 頭。牝馬は 507 頭 |
| A5 | 件数・(Gender, HorseId) 集合・通し番号が基準と一致。`factor.json` もバイト単位で一致。内容が変わったのはオルフェーヴル2013（abilityData・abilityGameId）とシュヴァルグラン（sourceGameId 377→300021）の 2 頭だけで、どちらも許容範囲内。シュヴァルグランは、台帳で種牡馬 300021 と牝馬 377（ニシノフラワー）が同じ HorseId を持ち、従来は牝馬の ID で上書きされていた。今回の修正で正しい値になった |
| A6 | 実データの非凡検索: 1214 件・馬の行 1348・牝馬に解決 0。破天は `3614530278` と `r100026` の 2 頭（どちらも種牡馬） |
| A7 | YAML 読込 OK。permissions は `contents: write` のみ。手順は 生成 → pytest → tsx → ビルド → コミットの順。`deploy-pages` の起動と、失敗を無視する設定はない |
| A8 | `data/source`、`deploy-pages.yml`、`update-horse-data.yml`、`nonordinary_abilities_bundle.json` に作業ツリー側の差分なし。`git diff --check` OK |

残課題（本指示書の範囲外）:

- 実際の公開はまだ確認していない。11 月に main へマージした後、初回の日次実行で次を確認する。
  - `dist/` がコミットされること
  - `pages-build-deployment` が動くこと
  - 公開サイトの `/dabimas-data/dist/json/horselist.json` が更新されること
- R2 に牝馬の `display_start_at`（`schema_version: 6`）が載った時点で、未公開の牝馬 7 頭が一覧から消えることを確認する。
