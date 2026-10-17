import test from "node:test";
import assert from "node:assert/strict";
import { buildOutroSvg, OUTRO_DURATION_SECONDS } from "./outro-frame.mjs";

test("builds the Xingge branded outro artwork", () => {
  const svg = buildOutroSvg("data:image/png;base64,avatar");

  assert.equal(OUTRO_DURATION_SECONDS, 2.8);
  assert.match(svg, /星格观察局/u);
  assert.match(svg, /看懂性格，也看懂关系/u);
  assert.match(svg, /关注我 · 下一条继续聊/u);
  assert.match(svg, /data:image\/png;base64,avatar/u);
});
