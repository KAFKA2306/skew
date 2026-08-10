import assert from "node:assert/strict";
import {
  CANVAS_PRESETS,
  DEFAULT_BRAND_PROFILE,
  buildCreatorSvg,
  parseBatchSymbols,
  validateBrandProfile,
} from "../.tmp-test/creator-export.js";

const baseSeries = {
  symbol: "DEMO",
  range: "1y",
  interval: "1d",
  dates: ["2026-01-01", "2026-02-01", "2026-03-01"],
  prices: [100, 105, 102],
  generatedAt: "2026-08-10T14:00:00.000Z",
  sourceLabel: "synthetic test fixture",
};
const metrics = { meanReturnDaily: 0.001, stdReturnDaily: 0.02, sharpeAnnual: 0.8 };

assert.deepEqual(CANVAS_PRESETS.map(({ width, height }) => [width, height]), [
  [1920, 1080],
  [1080, 1080],
  [1200, 630],
]);

for (const preset of CANVAS_PRESETS) {
  const svg = buildCreatorSvg(baseSeries, metrics, DEFAULT_BRAND_PROFILE, preset.id);
  assert.match(svg, new RegExp(`viewBox="0 0 ${preset.width} ${preset.height}"`));
  assert.match(svg, /DEMO · 1y · 1d/);
  assert.match(svg, /Generated: 2026-08-10T14:00:00.000Z/);
  assert.match(svg, /Source \/ method: synthetic test fixture/);
  assert.match(svg, /<polyline points="[^"]+"/);
  assert.ok(!svg.includes("NaN"));
}

assert.deepEqual(parseBatchSymbols("nvda, MSFT nvda 7203.t"), ["NVDA", "MSFT", "7203.T"]);
assert.throws(() => parseBatchSymbols("A B C D E F G H I J K"), /at most 10/);
assert.throws(() => parseBatchSymbols("   "), /At least one symbol/);
assert.throws(() => validateBrandProfile({ ...DEFAULT_BRAND_PROFILE, fontScale: 2 }), /fontScale/);
assert.throws(() => buildCreatorSvg({ ...baseSeries, prices: [100] }, metrics, DEFAULT_BRAND_PROFILE, "social-square"), /aligned observations/);

const escaped = buildCreatorSvg({ ...baseSeries, symbol: "A&B<" }, metrics, { ...DEFAULT_BRAND_PROFILE, displayName: "X<Y" }, "article-ogp");
assert.match(escaped, /A&amp;B&lt;/);
assert.match(escaped, /X&lt;Y/);

console.log("creator export contract: PASS");
