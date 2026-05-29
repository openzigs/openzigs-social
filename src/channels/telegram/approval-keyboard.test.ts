import { describe, expect, it } from "vitest";

import type { PendingApproval } from "../../approvals/index.js";
import {
  APPROVAL_CALLBACK_PREFIX,
  buildApprovalCallbackData,
  buildApprovalKeyboard,
  escapeHtml,
  MAX_DETAIL_CHARS,
  parseApprovalCallbackData,
  renderApprovalMessage,
  truncate
} from "./approval-keyboard.js";

function pending(payload: unknown, id = "abc12345"): PendingApproval {
  return { id, payload, createdAt: 0 };
}

describe("buildApprovalCallbackData / parseApprovalCallbackData", () => {
  it("round-trips a decision and id", () => {
    const data = buildApprovalCallbackData("approve", "id-1");
    expect(data).toBe(`${APPROVAL_CALLBACK_PREFIX}:approve:id-1`);
    expect(parseApprovalCallbackData(data)).toEqual({ decision: "approve", id: "id-1" });
  });

  it("preserves ids that contain colons", () => {
    const data = buildApprovalCallbackData("reject", "a:b:c");
    expect(parseApprovalCallbackData(data)).toEqual({ decision: "reject", id: "a:b:c" });
  });

  it("rejects malformed, foreign, and incomplete callbacks", () => {
    expect(parseApprovalCallbackData(undefined)).toBeNull();
    expect(parseApprovalCallbackData(123 as unknown as string)).toBeNull();
    expect(parseApprovalCallbackData("other:approve:id")).toBeNull();
    expect(parseApprovalCallbackData("oz:appr:maybe:id")).toBeNull();
    expect(parseApprovalCallbackData("oz:appr:approve:")).toBeNull();
    expect(parseApprovalCallbackData("oz:appr:approve")).toBeNull();
  });

  it("stays under Telegram's 64-byte callback limit for a uuid id", () => {
    const data = buildApprovalCallbackData("approve", "f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
  });
});

describe("buildApprovalKeyboard", () => {
  it("emits Approve and Reject buttons with matching callback data", () => {
    const kb = buildApprovalKeyboard("id-9");
    const [row] = kb.inline_keyboard;
    expect(row).toHaveLength(2);
    expect(row[0]).toMatchObject({ callback_data: "oz:appr:approve:id-9" });
    expect(row[1]).toMatchObject({ callback_data: "oz:appr:reject:id-9" });
  });
});

describe("escapeHtml / truncate", () => {
  it("escapes the HTML metacharacters Telegram cares about", () => {
    expect(escapeHtml('<a> & "b"')).toBe('&lt;a&gt; &amp; "b"');
  });

  it("truncates only when longer than the limit", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdef", 3)).toBe("abc…");
  });
});

describe("renderApprovalMessage", () => {
  it("renders a rich card for a social approval payload and escapes content", () => {
    const msg = renderApprovalMessage(
      pending({
        kind: "post",
        platform: "instagram",
        summary: "Post <b>hello</b>",
        detail: "the body & more"
      })
    );
    expect(msg).toContain("<b>Approval required</b>");
    expect(msg).toContain("Action: post");
    expect(msg).toContain("Platform: instagram");
    expect(msg).toContain("Post &lt;b&gt;hello&lt;/b&gt;");
    expect(msg).toContain("the body &amp; more");
  });

  it("bounds long detail to the max length", () => {
    const long = "x".repeat(MAX_DETAIL_CHARS + 50);
    const msg = renderApprovalMessage(pending({ summary: "big", detail: long }));
    expect(msg).toContain("…");
    expect(msg).not.toContain("x".repeat(MAX_DETAIL_CHARS + 1));
  });

  it("falls back to a JSON preview for non-social payloads", () => {
    const msg = renderApprovalMessage(pending({ foo: "bar" }));
    expect(msg).toContain("<code>");
    expect(msg).toContain("foo");
  });
});
