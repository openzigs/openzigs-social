import { describe, expect, it } from "vitest";

import { isActiveRoute, NAV_ROUTES } from "./nav";

describe("NAV_ROUTES", () => {
  it("exposes the six primary destinations in order", () => {
    expect(NAV_ROUTES.map((r) => r.label)).toEqual([
      "Inbox",
      "Compose",
      "Calendar",
      "Analytics",
      "Contacts",
      "Settings"
    ]);
  });

  it("uses lowercase hrefs matching the labels", () => {
    expect(NAV_ROUTES.map((r) => r.href)).toEqual([
      "/inbox",
      "/compose",
      "/calendar",
      "/analytics",
      "/contacts",
      "/settings"
    ]);
  });
});

describe("isActiveRoute", () => {
  it("matches an exact path", () => {
    expect(isActiveRoute("/inbox", "/inbox")).toBe(true);
  });

  it("matches a nested path", () => {
    expect(isActiveRoute("/inbox/thread-1", "/inbox")).toBe(true);
  });

  it("does not match an unrelated path", () => {
    expect(isActiveRoute("/compose", "/inbox")).toBe(false);
  });

  it("does not match a prefix that is not a path segment", () => {
    expect(isActiveRoute("/inboxes", "/inbox")).toBe(false);
  });
});
