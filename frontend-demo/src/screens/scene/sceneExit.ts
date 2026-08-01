import type { SceneDetail } from "./shared";

export type BringChoice = "remember" | "small_action" | "replay" | "witness";

export interface SceneReviewSummary {
  key_quote?: string;
  reflection_options?: string[];
  companion_comment?: string;
  action_hint?: string;
  response_count?: number;
  custom_response_count?: number;
  setting_label?: string;
}

export interface PerspectiveCardData {
  said: string;
  saw: string;
  will: string;
}

const FALLBACK_REFLECTIONS = [
  "我不是不在乎，只是当时不知道怎么表达",
  "那时的我，也在尽力面对这一刻",
  "我希望自己的感受能被认真听见",
];

export function normalizeReflections(summary: SceneReviewSummary | null): string[] {
  const options = Array.isArray(summary?.reflection_options)
    ? summary!.reflection_options!.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return [...new Set([...options, ...FALLBACK_REFLECTIONS])].slice(0, 3);
}

export function getReviewFacts(scene: SceneDetail | null, summary: SceneReviewSummary | null) {
  const history = (scene?.history ?? []).filter((item) => typeof item?.choice === "string" && item.choice.trim());
  const responseCount = Number.isFinite(summary?.response_count)
    ? Math.max(0, Number(summary?.response_count))
    : history.length;
  const customCount = Number.isFinite(summary?.custom_response_count)
    ? Math.max(0, Number(summary?.custom_response_count))
    : history.filter((item) => item?.source === "custom").length;
  const setting = String(summary?.setting_label || scene?.setting || scene?.title || "这一幕").trim();
  return { responseCount, customCount, setting };
}

export function bringChoiceText(choice: BringChoice, actionHint: string): string {
  if (choice === "small_action") return actionHint.trim() || "下次可以先说清自己的感受";
  if (choice === "witness") return "暂时什么都不做，只是看见";
  if (choice === "replay") return "回到片场，再试一次";
  return "记住这句话，慢慢来";
}

export function buildPerspectiveCard(
  said: string,
  saw: string,
  choice: BringChoice,
  actionHint: string,
): PerspectiveCardData {
  return {
    said: said.trim(),
    saw: saw.trim(),
    will: bringChoiceText(choice, actionHint),
  };
}

export function buildSettlementPayload(card: PerspectiveCardData, choice: BringChoice, actionHint: string) {
  const cardText = [
    `这一次，我对当时的自己说：${card.said}`,
    `退到画面之外，我看见：${card.saw}`,
    `回到今天，我愿意：${card.will}`,
  ].join("\n");
  return {
    card_text: cardText,
    insight_text: null,
    action_text: choice === "small_action" ? bringChoiceText(choice, actionHint) : null,
    keep: true,
  };
}
