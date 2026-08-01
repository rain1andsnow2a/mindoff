import assert from "node:assert/strict";

import {
  getSceneAdvancePhase,
  getLastSceneBeat,
  getLastUserExpression,
} from "../src/screens/scene/sceneReview.ts";
import {
  buildPerspectiveCard,
  buildSettlementPayload,
  getReviewFacts,
  normalizeReflections,
} from "../src/screens/scene/sceneExit.ts";

const scene = {
  history: [
    { turn: 1, choice: "我先听你说" },
    { turn: 2, choice: "我想把那天没说完的话告诉你" },
  ],
  beats: [
    { speaker: "旁白", text: "风吹过院子，故事在这里停下。" },
  ],
};

assert.equal(
  getLastUserExpression(scene),
  "我想把那天没说完的话告诉你",
  "回顾页必须展示最后一次真实回应，不能展示最后一段旁白",
);
assert.equal(getLastSceneBeat(scene), "风吹过院子，故事在这里停下。");
assert.equal(getLastUserExpression({ history: [], beats: [] }), "");
assert.equal(getSceneAdvancePhase({ ended: false, closure_ready: false }), "playing");
assert.equal(getSceneAdvancePhase({ ended: false, closure_ready: true }), "closure");
assert.equal(getSceneAdvancePhase({ ended: true, closure_ready: true }), "ending");

assert.deepEqual(getReviewFacts(scene, null), {
  responseCount: 2,
  customCount: 0,
  setting: "这一幕",
});
assert.equal(normalizeReflections({ reflection_options: ["我希望被听见"] }).length, 3);

const card = buildPerspectiveCard(
  "现在我听见你了",
  "那时的我已经尽力了",
  "witness",
  "下次先说清感受",
);
const witnessPayload = buildSettlementPayload(card, "witness", "下次先说清感受");
assert.equal(witnessPayload.action_text, null, "只是看见不能暗中生成待办");
assert.match(witnessPayload.card_text, /现在我听见你了/);

const actionPayload = buildSettlementPayload(card, "small_action", "下次先说清感受");
assert.equal(actionPayload.action_text, "下次先说清感受", "只有明确选择小动作才生成待办");

console.log("scene review: all assertions passed");
