import test from "node:test";
import assert from "node:assert/strict";
import { parseLoudnessAnalysis } from "./loudness.mjs";

test("parses the JSON block emitted by FFmpeg loudnorm", () => {
  const result = parseLoudnessAnalysis(`
    ffmpeg diagnostic output {"nested":{"metadata":"contains braces"}}
    {
      "input_i" : "-22.85",
      "input_tp" : "-8.29",
      "input_lra" : "2.70",
      "input_thresh" : "-33.11",
      "target_offset" : "0.15"
    }
  `);

  assert.equal(Number(result.input_i), -22.85);
  assert.equal(Number(result.input_tp), -8.29);
  assert.equal(Number(result.target_offset), 0.15);
});

test("rejects incomplete loudness analysis", () => {
  assert.throws(
    () => parseLoudnessAnalysis('{"input_i":"-20"}'),
    /不完整/u
  );
});
