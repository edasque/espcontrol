#!/usr/bin/env node
"use strict";

// End-to-end check: drive the real EspControl setup page in a browser against
// the bridge, then confirm the bridge stored the card and the widget feed shows
// it. This is what proves the prototype actually reuses the configurator rather
// than a look-alike.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const { createBridge } = require("../server/bridge");
const fakeHa = require("./fake_home_assistant");

const LAUNCH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  : {};

async function startBridge() {
  const ha = await fakeHa.start();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "espcontrol-scriptable-browser-"));
  const bridge = createBridge({
    port: 0,
    host: "127.0.0.1",
    config: path.join(dir, "panel.json"),
    haUrl: ha.url,
    haToken: ha.token,
    cacheMs: 0,
  });
  await new Promise((resolve) => bridge.server.listen(0, "127.0.0.1", resolve));
  return {
    ha,
    bridge,
    base: `http://127.0.0.1:${bridge.server.address().port}`,
    async close() {
      await new Promise((resolve) => bridge.server.close(resolve));
      await ha.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function openSetupPage(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  // The setup page pulls its icon font and web font from CDNs exactly as it does
  // on a real panel. Stub them so the check does not need internet access.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (err) => failures.push(String(err)));
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.waitForSelector("#sp-app", { timeout: 20000 });
  return { context, page, failures };
}

async function run() {
  const harness = await startBridge();
  const browser = await chromium.launch(LAUNCH);

  try {
    // Seed one card through the REST surface so the grid has something to draw.
    const seeded = "~light.kitchen,Kitchen,Lightbulb,Auto,,,,,";
    await fetch(`${harness.base}/text/button_1_config/set?value=${encodeURIComponent(seeded)}`, {
      method: "POST",
    });
    await fetch(`${harness.base}/text/button_order/set?value=1`, { method: "POST" });

    const { context, page, failures } = await openSetupPage(browser, harness.base);
    await page.waitForSelector(".sp-main .sp-btn", { timeout: 20000 });

    const layout = await page.evaluate(() => {
      const main = document.querySelector(".sp-main");
      const style = getComputedStyle(main);
      return {
        cols: style.gridTemplateColumns.trim().split(/\s+/).length,
        rows: style.gridTemplateRows.trim().split(/\s+/).length,
        cells: main.children.length,
        cards: [...main.querySelectorAll(".sp-btn")].map((el) => el.textContent.trim()),
      };
    });
    assert.strictEqual(layout.cols, 4, "setup page renders a 4-column grid");
    assert.strictEqual(layout.rows, 4, "setup page renders a 4-row grid");
    assert.strictEqual(layout.cells, 16, "4x4 gives 16 cells");
    assert.deepStrictEqual(layout.cards, ["Kitchen"], "the seeded card is drawn from bridge state");

    // Card types that need panel hardware must not be offered on a widget.
    await page.click(".sp-main > .sp-empty-cell");
    await page.waitForSelector(".sp-settings-modal", { state: "visible", timeout: 10000 });
    const offered = await page.evaluate(() =>
      [...document.querySelectorAll(".sp-settings-modal button")]
        .map((el) => el.textContent.trim())
        .filter(Boolean),
    );
    for (const hidden of ["Camera Card", "Internal Switches", "Screen Lock", "Subpage"]) {
      assert(
        !offered.some((text) => text.startsWith(hidden)),
        `card picker hides "${hidden}" on a widget panel`,
      );
    }
    assert(
      offered.some((text) => text.startsWith("Switch")),
      "card picker still offers a Switch card",
    );

    // Configure the new card the way a person would, then check what was stored.
    await page.getByText("SwitchToggle lights, switches, helpers, or fans.").click();
    await page.waitForSelector("#sp-inp-entity", { timeout: 10000 });
    await page.fill("#sp-inp-entity", "switch.desk_lamp");
    await page.fill("#sp-inp-label", "Desk Lamp");
    await page.locator("#sp-inp-label").blur();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          decodeURIComponent(response.url()).includes("/text/button_2_config/set"),
        { timeout: 10000 },
      ),
      page.locator(".sp-settings-modal .sp-save-btn").click(),
    ]);

    assert.deepStrictEqual(failures, [], "the setup page ran without script errors");

    const stored = await (await fetch(`${harness.base}/text/button_2_config`)).json();
    assert(
      stored.state.includes("switch.desk_lamp") && stored.state.includes("Desk Lamp"),
      `the bridge stored the card the setup page configured (got "${stored.state}")`,
    );

    const payload = await (await fetch(`${harness.base}/widget/tiles?refresh=1`)).json();
    const labels = payload.tiles.map((tile) => tile.label).sort();
    assert.deepStrictEqual(
      labels,
      ["Desk Lamp", "Kitchen"],
      "the widget feed shows both the seeded and the newly configured card",
    );
    const desk = payload.tiles.find((tile) => tile.label === "Desk Lamp");
    assert.strictEqual(desk.entity, "switch.desk_lamp");
    assert.strictEqual(desk.tap, "toggle", "the new card is tappable from the widget");

    // A reload must show exactly what the bridge has, with no leftover UI state.
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".sp-main .sp-btn", { timeout: 20000 });
    const reloaded = await page.evaluate(() =>
      [...document.querySelectorAll(".sp-main .sp-btn")].map((el) => el.textContent.trim()).sort(),
    );
    assert.deepStrictEqual(reloaded, ["Desk Lamp", "Kitchen"], "config survives a setup page reload");

    await context.close();
    process.stdout.write("  ok  setup page drives the bridge end to end\n");
    process.stdout.write("Scriptable browser check passed.\n");
  } finally {
    await browser.close();
    await harness.close();
  }
}

run().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
