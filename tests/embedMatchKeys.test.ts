import assert from "node:assert/strict";
import { test } from "node:test";

// embedMode.ts は URL とブラウザを見るので、照合の規則だけを同じ形で持ち込んで確かめる。
// 実体を変えたらこちらも合わせること（src/features/embed/model/embedMode.ts）。
type Horse = { HorseId: string; Gender: "0" | "1"; legacy_ids?: string[]; card?: { sourceGameId?: string } };

const gameKeyOf = (horse: Horse) => {
  const gameId = horse.card?.sourceGameId;
  return gameId ? `g${gameId}-${horse.Gender}` : null;
};
const horseKeyOf = (horse: Horse) => `${horse.HorseId}-${horse.Gender}`;
const matchKeysOf = (horse: Horse): string[] => [
  gameKeyOf(horse),
  horseKeyOf(horse),
  ...(horse.legacy_ids ?? []).map((id) => `${id}-${horse.Gender}`),
].filter((key): key is string => key !== null);
const matchedKeyIn = (keys: Set<string>, horse: Horse) => matchKeysOf(horse).find((key) => keys.has(key)) ?? null;

const renamed: Horse = { HorseId: "r101305", Gender: "0", legacy_ids: ["2435330721"], card: { sourceGameId: "101305" } };

test("ゲーム内 ID を持つ親なら、採番が変わっていても当たる", () => {
  assert.equal(matchedKeyIn(new Set(["g101305-0"]), renamed), "g101305-0");
});

test("以前の ID しか持たない親でも当たる（R2 で採番が変わった馬）", () => {
  assert.equal(matchedKeyIn(new Set(["2435330721-0"]), renamed), "2435330721-0");
});

test("親が知らない馬は当たらない", () => {
  assert.equal(matchedKeyIn(new Set(["9999999999-0"]), renamed), null);
});

test("ゲーム内 ID を優先する（親が両方持っていても）", () => {
  assert.equal(matchedKeyIn(new Set(["g101305-0", "2435330721-0"]), renamed), "g101305-0");
});

test("性別が違えば当たらない", () => {
  const mare: Horse = { HorseId: "rb491", Gender: "1", legacy_ids: ["4218614563"], card: { sourceGameId: "491" } };
  assert.equal(matchedKeyIn(new Set(["4218614563-0", "g491-0"]), mare), null);
  assert.equal(matchedKeyIn(new Set(["4218614563-1"]), mare), "4218614563-1");
});
