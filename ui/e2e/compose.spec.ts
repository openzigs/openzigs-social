import { expect, test } from "@playwright/test";

import { ComposePage, type StubConnection } from "./pages/compose.page";

/**
 * E2E coverage for the composer publish-target picker (epic #53).
 *
 * The composer reads `GET /api/connections` to render a per-account checkbox
 * for each connected social account (Instagram / Facebook Pages / Threads).
 * The endpoint is intercepted with `page.route` so the test is deterministic
 * and never hits a real backend or Meta.
 */
const CONNECTIONS: StubConnection[] = [
  { platform: "instagram", label: "Instagram", connected: true, needsReconsent: false },
  { platform: "facebook", label: "Facebook Pages", connected: true, needsReconsent: false },
  { platform: "threads", label: "Threads", connected: false, needsReconsent: true }
];

test.describe("Composer publish targets (#53)", () => {
  let compose: ComposePage;

  test.beforeEach(async ({ page }) => {
    compose = new ComposePage(page);
    await compose.stubConnections(CONNECTIONS);
    await compose.goto();
  });

  test("renders a checkbox per connection with disabled state for unconnected accounts", async () => {
    await expect(compose.heading).toBeVisible();
    await expect(compose.publishFieldset).toBeVisible();

    await expect(compose.target("Instagram")).toBeEnabled();
    await expect(compose.target("Facebook Pages")).toBeEnabled();

    const threads = compose.target("Threads");
    await expect(threads).toBeDisabled();
    await expect(compose.page.getByText(/reconnect required/i)).toBeVisible();
  });

  test("selecting connected accounts updates the publish summary", async () => {
    await expect(compose.status).toHaveText(/select at least one connected account/i);

    await compose.target("Instagram").check();
    await expect(compose.status).toHaveText(/publishing to: instagram/i);

    await compose.target("Facebook Pages").check();
    await expect(compose.status).toHaveText(/instagram, facebook/i);
  });
});
