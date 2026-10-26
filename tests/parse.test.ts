import { it } from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "../app/api/parse/route";

it("模型只可修改白名单阈值，缺失项明确沿用默认值", () => {
  const result = parseResponse(JSON.stringify({ rules: { growthMin: 12, promisedReturn: 30 }, note: "营收增长至少 12%" }));
  assert.equal(result.rules.growthMin, 12);
  assert.equal("promisedReturn" in result.rules, false);
  assert.match(result.note, /未返回的条件沿用默认值/);
});

it("拒绝冲突阈值并压制模型给出的交易建议", () => {
  assert.throws(() => parseResponse(JSON.stringify({ rules: { peMin: 40, peMax: 20 } })), /条件无效/);
  const result = parseResponse(JSON.stringify({ rules: {}, note: "建议立即买入，稳赚" }));
  assert.doesNotMatch(result.note, /买入|稳赚/);
});
