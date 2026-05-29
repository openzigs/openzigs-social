import { describe, expect, it } from "vitest";

import { makeQueryClient } from "./query-client";

describe("makeQueryClient", () => {
  it("creates a QueryClient with local-first defaults", () => {
    const client = makeQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(1);
  });
});
