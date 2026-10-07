# R2 正本の生成・運用

## GitHub の設定

リポジトリの Actions Secret または Variable `R2_BASE_URL` に、5つの公開 JSON を置く HTTPS ディレクトリの URL を設定する（末尾のファイル名は不要）。

- `stallion_master.game.json`
- `broodmare_master.game.json`
- `pedigree_master.json`
- `pedigree_master.game.json`
- `ability_master.game.json`

公開は main ブランチ配信の GitHub Pages（`main` の `/`）で、利用者は `/dabimas-data/dist/` にアクセスする。日次は毎日 11:30 JST、週次の公式取得は金曜 18:00 JST。両ワークフローは `horse-data-main` の concurrency グループで直列化し、週次終了時は日次を dispatch する。

日次は生成後に pytest と TypeScript のテストを実行し、成功した場合だけ `VITE_BASE_PATH=/dabimas-data/dist/`、`VITE_DEPLOY_MODE=artifact-root` で `dist/` をビルドする。`json/horselist.json`、`json/factor.json`、`dist/` に差分があればコミットして main に push する。テストやビルドが失敗した場合はコミットしない。週次の非凡検索データだけの変更も `dist/json/` にコピーされ、公開される。`deploy-pages.yml` は日次・週次から起動しない。

R2 取得は5ファイルの取得と検証を1回の試行とし、版の食い違い・欠落と通信エラーの場合に最大3回試行する。再試行前に120秒待ち、試行回数と理由を標準エラーに記録する。参照切れや不正な因子IDなどは再試行せず停止する。検証に成功するまで出力先には書き込まない。

## ローカル生成

```sh
python -m tools.horse_data.download_r2 --output .tools/r2
python -m tools.horse_data.generate_horselist --r2-dir .tools/r2 --as-of 2026-10-07
```

`--as-of` は JST の基準日。省略時は実行日の 11:30 JST。`--previous` は前回の horselist（既定 `json/horselist.json`）で、1%超の頭数減少検出と、週次台帳にまだない日次追加馬の ID・通し番号の維持に使う。検証前の出力を消さないこと。既知の入力検証エラーでは出力ファイルに書き込まない。

日次は台帳を読み取り専用で使う。新しい馬はメモリ上で割り当て、公開レコードの `card.sourceGameId` にゲームIDを保存する。翌日と週次はその割り当てを引き継ぐ。種牡馬・牝馬とも `display_start_at` で公開判定し、空（null またはキーなし）なら公開扱いとする。公開前の馬は血統・配合理論の計算前に除外し、同名の公式データで補完しない。1%超の頭数減少チェックは種牡馬のみを対象とする。

## 台帳と非凡対応の更新

```sh
python -m tools.horse_data.id_ledger --r2-dir .tools/r2
python -m tools.horse_data.ability_links --r2-dir .tools/r2
```

初回のみ、新規の出力パスを指定して `--initial` で台帳を作成し、IDと通し番号をレビューする。既存台帳への `--initial` は禁止。通常更新で既存の割り当てを変更しない。公式の新しいIDは `legacy_ids` に追加する。

`ability_links_override.json` は公式能力IDとゲーム能力IDの配列。「運否天賦」「快進撃」の2版ずつは保存済みの公式詳細で特殊演出の有無を確認した対応を収録している。自動照合では公式検索の説明文の句読点省略も正規化し、同名・同説明の候補が複数なら `site_metadata.json` の効果・条件で絞る。解決できない能力は警告に残し、推測して追加しない。

標準エラーの監査ログには同名の曖昧な馬、未対応の能力、辿れない祖先を記録する。

## 初回移行の検証

- 入力: R2 run `20261007T121737Z`、dataset version `2026-10-07T123420Z+raw.0ecfb7053e97`
- 基準日: `2026-10-07`
- 台帳: 種牡馬2,532頭、牝馬507頭
- 既存の種牡馬2,480頭・牝馬499頭すべてで HorseId / SerialNumber を維持
- 公開結果: 種牡馬2,521頭・牝馬507頭。公開前の種牡馬11頭を除外
- 15枠の血統に空欄がある馬: 0頭
- 非凡対応: 1,214件。公式にない24件はカード詳細のみ表示
- 設計書に列挙されたコラボ馬15頭が新しい究極レア判定へ変更

## 検証コマンド

```sh
python -m pytest
npx tsx --test tests/*.test.ts
npm run build -- --outDir .tools/r2-build
```

Python の小規模なR2 fixtureで公開境界・入力検証・台帳の不変性・変換と出力の再現性を検証する。既存の旧ソース変換テストも維持する。生成データと同じR2スナップショットはリポジトリに含めない。
