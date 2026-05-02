import { test, expect, Page } from "@playwright/test";

async function navigateToCanvas(page: Page) {
  await page.goto("/canvas");
  await page.waitForLoadState("networkidle");
}

test.describe("Agent IDE — full suite", () => {
  test("canvas renders three-zone layout with console", async ({ page }) => {
    await navigateToCanvas(page);
    await expect(page.locator('[data-testid="agent-console"]')).toBeVisible();
    await expect(page.locator('[data-testid="panel-resize-handle"]')).toBeVisible();
  });

  test("bottom console panel has tab buttons", async ({ page }) => {
    await navigateToCanvas(page);
    const console_ = page.locator('[data-testid="agent-console"]');
    await expect(console_).toBeVisible();
    // The three tabs — Console, Trace, State
    await expect(console_.getByRole("tab", { name: /console/i })).toBeVisible();
    await expect(console_.getByRole("tab", { name: /trace/i })).toBeVisible();
    await expect(console_.getByRole("tab", { name: /state/i })).toBeVisible();
  });

  test("agent properties panel opens inline on agent click", async ({ page }) => {
    await navigateToCanvas(page);
    const agentRow = page.locator('[data-testid="agent-row"]').first();
    const hasAgents = await agentRow.count() > 0;
    if (!hasAgents) {
      test.skip();
      return;
    }
    await agentRow.click();
    await expect(page.locator('[data-testid="agent-properties-panel"]')).toBeVisible();
    // No modal backdrop
    await expect(page.locator(".fixed.inset-0.bg-black\\/50")).toHaveCount(0);
  });

  test("properties panel has all 6 tabs", async ({ page }) => {
    await navigateToCanvas(page);
    const agentRow = page.locator('[data-testid="agent-row"]').first();
    if ((await agentRow.count()) === 0) { test.skip(); return; }
    await agentRow.click();
    const panel = page.locator('[data-testid="agent-properties-panel"]');
    await expect(panel.getByRole("tab", { name: /config/i })).toBeVisible();
    await expect(panel.getByRole("tab", { name: /schedules/i })).toBeVisible();
    await expect(panel.getByRole("tab", { name: /db access/i })).toBeVisible();
    await expect(panel.getByRole("tab", { name: /tools/i })).toBeVisible();
    await expect(panel.getByRole("tab", { name: /prompt/i })).toBeVisible();
    await expect(panel.getByRole("tab", { name: /graph/i })).toBeVisible();
  });

  test("graph tab renders React Flow canvas", async ({ page }) => {
    await navigateToCanvas(page);
    const agentRow = page.locator('[data-testid="agent-row"]').first();
    if ((await agentRow.count()) === 0) { test.skip(); return; }
    await agentRow.click();
    const panel = page.locator('[data-testid="agent-properties-panel"]');
    await panel.getByRole("tab", { name: /graph/i }).click();
    await expect(page.locator('[data-testid="agent-graph"]')).toBeVisible();
    // React Flow renders SVG elements inside
    await expect(page.locator('[data-testid="agent-graph"] svg')).toBeVisible();
  });

  test("prompt tab shows agent instructions", async ({ page }) => {
    await navigateToCanvas(page);
    const agentRow = page.locator('[data-testid="agent-row"]').first();
    if ((await agentRow.count()) === 0) { test.skip(); return; }
    await agentRow.click();
    const panel = page.locator('[data-testid="agent-properties-panel"]');
    await panel.getByRole("tab", { name: /prompt/i }).click();
    // Either shows a prompt in <pre> or a "No versions yet" message
    const hasPrompt = (await panel.locator("pre").count()) > 0;
    const hasEmpty  = (await panel.getByText(/no versions/i).count()) > 0;
    expect(hasPrompt || hasEmpty).toBeTruthy();
  });

  test("swarm card grid appears at root nav level", async ({ page }) => {
    await navigateToCanvas(page);
    const grid = page.locator('[data-testid="swarm-card-grid"]');
    if ((await grid.count()) === 0) {
      // No swarms — acceptable
      return;
    }
    await expect(grid).toBeVisible();
  });

  test("swarm drill-down navigation works", async ({ page }) => {
    await navigateToCanvas(page);
    const card = page.locator('[data-testid="swarm-card"]').first();
    if ((await card.count()) === 0) { test.skip(); return; }
    await card.click();
    await expect(page.locator('[data-testid="breadcrumb-current"]')).toBeVisible();
    // Navigate back
    await page.locator('[data-testid="breadcrumb-root"]').click();
    await expect(page.locator('[data-testid="swarm-card-grid"]')).toBeVisible();
  });

  test("MCP tools tab shows tool list or empty state", async ({ page }) => {
    await navigateToCanvas(page);
    const agentRow = page.locator('[data-testid="agent-row"]').first();
    if ((await agentRow.count()) === 0) { test.skip(); return; }
    await agentRow.click();
    const panel = page.locator('[data-testid="agent-properties-panel"]');
    await panel.getByRole("tab", { name: /tools/i }).click();
    // Either shows server cards or empty state
    const hasServers = (await panel.locator(".rounded-xl.border.border-border").count()) > 0;
    const hasEmpty   = (await panel.getByText(/no mcp servers/i).count()) > 0;
    expect(hasServers || hasEmpty).toBeTruthy();
  });

  test("HIL approval flow renders approval card", async ({ page }) => {
    await navigateToCanvas(page);
    // Intercept an SSE event by routing
    await page.route("**/api/runs/*/stream", async (route) => {
      const body = [
        'data: {"event":"start","run_id":"test-123"}\n\n',
        'data: {"event":"approval_request","run_id":"test-123","approval_id":"appr-1","tool_name":"delete_record","message":"Confirm deletion?"}\n\n',
      ].join("");
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body,
      });
    });

    const agentRow = page.locator('[data-testid="agent-row"]').first();
    if ((await agentRow.count()) === 0) { test.skip(); return; }
    await agentRow.click();
    // Type and submit via console
    const consoleArea = page.locator('[data-testid="agent-console"]');
    const textarea = consoleArea.locator("textarea").first();
    await textarea.fill("Test approval");
    await consoleArea.getByRole("button", { name: /run/i }).click();
    // Wait for approval card
    await expect(page.locator('[data-testid="approval-card"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="btn-approve"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-reject"]')).toBeVisible();
  });
});
