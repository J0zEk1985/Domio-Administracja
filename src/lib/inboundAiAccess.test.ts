import { describe, expect, it } from "vitest";
import { canEnableInboundAiAuto } from "@/lib/inboundAiAccess";

describe("canEnableInboundAiAuto", () => {
  it("allows the mode when monthly analyses remain even without the AI plan flag", () => {
    expect(canEnableInboundAiAuto({ has_ai_auto: false, ai_parses_remaining: 20 })).toBe(true);
  });

  it("allows the mode when the plan includes AI and the balance is empty", () => {
    expect(canEnableInboundAiAuto({ has_ai_auto: true, ai_parses_remaining: 0 })).toBe(true);
  });

  it("blocks the mode when nothing remains and the plan has no AI", () => {
    expect(canEnableInboundAiAuto({ has_ai_auto: false, ai_parses_remaining: 0 })).toBe(false);
    expect(canEnableInboundAiAuto(null)).toBe(false);
  });
});
