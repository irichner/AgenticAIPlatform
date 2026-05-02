import { test, expect } from "@playwright/test";

test.describe("Swarm drill-down navigation", () => {
  test("root view shows swarm card grid", async ({ page }) => {
    await page.goto("/canvas");
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) return;

    // Swarm card grid should be visible in root view
    await expect(page.getByTestId("swarm-card-grid")).toBeVisible();
  });

  test("clicking swarm card drills into swarm view", async ({ page }) => {
    await page.goto("/canvas");
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) return;

    const cardGrid = page.getByTestId("swarm-card-grid");
    if (!(await cardGrid.isVisible())) return;

    const swarmCard = page.getByTestId("swarm-card").first();
    if (!(await swarmCard.isVisible())) return;

    await swarmCard.click();

    // Breadcrumb should now show the swarm name
    await expect(page.getByTestId("breadcrumb-current")).toBeVisible();

    // Swarm card grid should no longer be shown
    await expect(page.getByTestId("swarm-card-grid")).not.toBeVisible();
  });

  test("breadcrumb back navigation returns to root view", async ({ page }) => {
    await page.goto("/canvas");
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) return;

    const swarmCard = page.getByTestId("swarm-card").first();
    if (!(await swarmCard.isVisible())) return;

    await swarmCard.click();
    await expect(page.getByTestId("breadcrumb-current")).toBeVisible();

    // Click "Canvas" in the breadcrumb to go back
    await page.getByText("Canvas").first().click();

    // Root swarm card grid should reappear
    await expect(page.getByTestId("swarm-card-grid")).toBeVisible();
    await expect(page.getByTestId("breadcrumb-current")).not.toBeVisible();
  });
});
