#!/usr/bin/env node
"use strict";

// Bridge checks: entity emulation, config persistence, the widget payload, and
// what a tile tap actually asks Home Assistant to do.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createBridge } = require("../server/bridge");
const fakeHa = require("./fake_home_assistant");
const { resolveIcon } = require("../server/lib/icons");
const { behaviourFor, isUnsupported } = require("../server/lib/cards");
const { runWidgetScript } = require("./scriptable_stub");

const ROOT = path.resolve(__dirname, "..", "..");

function serialize(fields) {
  // Compact saved-card format: "~" + comma-joined fields (see model/card.ts).
  return `~${fields.join(",")}`;
}

async function withBridge(run) {
  const ha = await fakeHa.start();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "espcontrol-scriptable-"));
  const configFile = path.join(dir, "panel.json");
  const options = {
    port: 0,
    host: "127.0.0.1",
    config: configFile,
    haUrl: ha.url,
    haToken: ha.token,
    cacheMs: 0,
  };
  const bridge = createBridge(options);
  await new Promise((resolve) => bridge.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${bridge.server.address().port}`;

  const client = {
    base,
    configFile,
    options,
    async get(pathname) {
      const response = await fetch(`${base}${pathname}`);
      const text = await response.text();
      return { status: response.status, text, json: () => JSON.parse(text) };
    },
    async post(pathname) {
      const response = await fetch(`${base}${pathname}`, { method: "POST" });
      return { status: response.status, text: await response.text() };
    },
    async setCard(slot, fields) {
      const value = encodeURIComponent(serialize(fields));
      const res = await client.post(`/text/button_${slot}_config/set?value=${value}`);
      assert.strictEqual(res.status, 200, `slot ${slot} config POST`);
    },
    async setOrder(order) {
      const res = await client.post(`/text/button_order/set?value=${encodeURIComponent(order)}`);
      assert.strictEqual(res.status, 200, "button order POST");
    },
    async tiles() {
      return (await client.get("/widget/tiles?refresh=1")).json();
    },
  };

  try {
    await run(client, ha, bridge);
  } finally {
    bridge.store.flush();
    await new Promise((resolve) => bridge.server.close(resolve));
    await ha.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function tileAt(payload, pos) {
  const tile = (payload.tiles || []).find((item) => item.pos === pos);
  assert(tile, `expected a tile at position ${pos}`);
  return tile;
}

// ---------------------------------------------------------------------------

async function checkEntitySurface() {
  await withBridge(async (client) => {
    const detail = (await client.get("/text/button_1_config")).json();
    assert.strictEqual(detail.id, "text-button_1_config", "entity id matches the ESPHome shape");
    assert.strictEqual(detail.state, "", "a fresh panel has empty card slots");

    const color = (await client.get("/text/Button%20On%20Color?detail=all")).json();
    assert.strictEqual(color.state, "FF8C00", "default active colour matches common/config/colors.yaml");

    // The setup page addresses entities by object id, by alias, and by name.
    for (const pathname of [
      "/switch/screen__clock_bar",
      "/switch/clock_bar_enabled",
      "/switch/Screen%3A%20Clock%20Bar",
    ]) {
      assert.strictEqual((await client.get(pathname)).status, 200, `resolves ${pathname}`);
    }

    assert.strictEqual((await client.post("/switch/screen__clock_bar/turn_off")).status, 200);
    assert.strictEqual((await client.get("/switch/screen__clock_bar")).json().state, "OFF");

    const select = (await client.get("/select/screen__temperature_unit")).json();
    assert(Array.isArray(select.option) && select.option.includes("°F"), "selects expose their options");

    assert.strictEqual((await client.get("/text/does_not_exist")).status, 404);
    assert.strictEqual((await client.post("/text/button_1_config/set")).status, 400, "set needs a value");

    const version = (await client.get("/espcontrol/version")).json();
    assert(version.firmware_version, "reports a firmware version to the setup page");
  });
}

async function checkPersistence() {
  const ha = await fakeHa.start();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "espcontrol-scriptable-"));
  const configFile = path.join(dir, "panel.json");
  const options = { port: 0, host: "127.0.0.1", config: configFile, haUrl: "", haToken: "", cacheMs: 0 };

  try {
    const first = createBridge(options);
    await new Promise((resolve) => first.server.listen(0, "127.0.0.1", resolve));
    const firstBase = `http://127.0.0.1:${first.server.address().port}`;
    const card = serialize(["light.kitchen", "Kitchen", "Lightbulb", "Auto", "", "", "", "", ""]);
    await fetch(`${firstBase}/text/button_1_config/set?value=${encodeURIComponent(card)}`, { method: "POST" });
    await fetch(`${firstBase}/text/button_order/set?value=1`, { method: "POST" });
    first.store.flush();
    await new Promise((resolve) => first.server.close(resolve));

    assert(fs.existsSync(configFile), "panel config is written to disk");
    const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
    assert.strictEqual(saved.format, "espcontrol-scriptable-panel");
    assert.strictEqual(saved.entities["text/button_1_config"], card);

    const second = createBridge(options);
    await new Promise((resolve) => second.server.listen(0, "127.0.0.1", resolve));
    const secondBase = `http://127.0.0.1:${second.server.address().port}`;
    const reloaded = await (await fetch(`${secondBase}/text/button_1_config`)).json();
    assert.strictEqual(reloaded.state, card, "config survives a bridge restart");
    await new Promise((resolve) => second.server.close(resolve));
  } finally {
    await ha.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function checkWidgetPayload() {
  await withBridge(async (client) => {
    await client.setCard(1, ["light.kitchen", "Kitchen", "Lightbulb", "Auto", "", "", "", "", ""]);
    await client.setCard(2, ["switch.desk_lamp", "Desk", "Auto", "Auto", "", "", "", "", ""]);
    await client.setCard(3, [
      "",
      "Lounge",
      "Auto",
      "Auto",
      "sensor.living_room_temperature",
      "°C",
      "sensor",
      "1",
      "",
    ]);
    await client.setCard(4, ["scene.movie_night", "Movie", "Auto", "Auto", "", "", "action", "", ""]);
    await client.setCard(5, [
      "light.kitchen",
      "Dimmer",
      "Auto",
      "Auto",
      "",
      "",
      "light_brightness",
      "",
      "",
    ]);
    await client.setOrder("1,2,3,4,5");

    const payload = await client.tiles();
    assert.strictEqual(payload.panel.cols, 4, "panel is 4 columns wide");
    assert.strictEqual(payload.panel.rows, 4, "panel is 4 rows tall");
    assert.strictEqual(payload.panel.slots, 16, "4x4 gives 16 tiles");
    assert.strictEqual(payload.onColor, "#FF8C00");
    assert.strictEqual(payload.homeAssistant.configured, true);
    assert.strictEqual(payload.homeAssistant.error, null, "no Home Assistant error");
    assert.strictEqual(payload.tiles.length, 5, "only configured slots become tiles");

    const light = tileAt(payload, 0);
    assert.strictEqual(light.slot, 1);
    assert.strictEqual(light.label, "Kitchen");
    assert.strictEqual(light.active, true, "light.kitchen is on");
    assert.strictEqual(light.tap, "toggle");
    assert.strictEqual(light.icon.mdi, "lightbulb", "saved icon name resolves to its MDI slug");
    assert.strictEqual(light.detail, null, "a Switch card shows on/off only, as it does on a panel");

    const dimmer = tileAt(payload, 4);
    assert.strictEqual(dimmer.detail, "50%", "a Lights card shows brightness 128/255 as a percentage");
    assert.strictEqual(dimmer.tap, "toggle");

    const desk = tileAt(payload, 1);
    assert.strictEqual(desk.active, false, "switch.desk_lamp is off");
    assert.strictEqual(desk.icon.mdi, "power-plug", "Auto icon falls back to the domain default");

    const sensor = tileAt(payload, 2);
    assert.strictEqual(sensor.face, "value");
    assert.strictEqual(sensor.reading, "21.4°C", "precision and unit are applied");
    assert.strictEqual(sensor.tap, "none", "sensor cards are read-only");

    const scene = tileAt(payload, 3);
    assert.strictEqual(scene.tap, "action");
    assert.strictEqual(scene.label, "Movie");
  });
}

async function checkSpansAndEmptySlots() {
  await withBridge(async (client) => {
    await client.setCard(1, ["light.kitchen", "Wide", "Lightbulb", "Auto", "", "", "", "", ""]);
    // "1w" = slot 1 rendered as a wide (2x1) card, per model/grid.ts size tokens.
    await client.setOrder("1w,,,,");

    const payload = await client.tiles();
    const tile = tileAt(payload, 0);
    assert.strictEqual(tile.colSpan, 2, "wide cards report a 2-cell span");
    assert.strictEqual(tile.rowSpan, 1);
    assert.strictEqual(payload.tiles.length, 1, "cells covered by a wide card are not separate tiles");
  });
}

async function checkMissingEntity() {
  await withBridge(async (client) => {
    await client.setCard(1, ["light.not_in_home_assistant", "Ghost", "Auto", "Auto", "", "", "", "", ""]);
    await client.setOrder("1");
    const tile = tileAt(await client.tiles(), 0);
    assert.strictEqual(tile.missing, true, "a card pointing at an unknown entity is flagged");
    assert.strictEqual(tile.active, false);
  });
}

async function checkUnsupportedCard() {
  await withBridge(async (client, ha) => {
    await client.setCard(1, ["", "Relays", "Auto", "Auto", "", "", "internal", "", ""]);
    await client.setOrder("1");
    const tile = tileAt(await client.tiles(), 0);
    assert.strictEqual(tile.unsupported, true, "device-only cards are marked, not silently wrong");
    assert.strictEqual(tile.tap, "none");

    const tap = await client.get("/widget/tap/1?format=json");
    assert.strictEqual(tap.status, 400);
    assert.match(tap.json().message, /not available on a widget/);
    assert.strictEqual(ha.calls.length, 0, "an unsupported card calls no service");
  });
}

async function checkTaps() {
  await withBridge(async (client, ha) => {
    await client.setCard(1, ["light.kitchen", "Kitchen", "Lightbulb", "Auto", "", "", "", "", ""]);
    await client.setCard(2, ["scene.movie_night", "Movie", "Auto", "Auto", "", "", "action", "", ""]);
    await client.setCard(3, ["lock.front_door", "Front", "Auto", "Auto", "", "", "lock", "", ""]);
    await client.setCard(4, [
      "",
      "Lounge",
      "Auto",
      "Auto",
      "sensor.living_room_temperature",
      "°C",
      "sensor",
      "1",
      "",
    ]);
    await client.setOrder("1,2,3,4");
    await client.tiles();

    const toggle = await client.get("/widget/tap/1?format=json");
    assert.strictEqual(toggle.status, 200);
    assert.deepStrictEqual(ha.calls.at(-1), {
      domain: "homeassistant",
      service: "toggle",
      data: { entity_id: "light.kitchen" },
    });

    await client.get("/widget/tap/2?format=json");
    assert.deepStrictEqual(ha.calls.at(-1), {
      domain: "scene",
      service: "turn_on",
      data: { entity_id: "scene.movie_night" },
    });

    // lock.front_door is locked, so a tap unlocks it.
    await client.get("/widget/tap/3?format=json");
    assert.deepStrictEqual(ha.calls.at(-1), {
      domain: "lock",
      service: "unlock",
      data: { entity_id: "lock.front_door" },
    });

    const readOnly = await client.get("/widget/tap/4?format=json");
    assert.strictEqual(readOnly.status, 400, "a sensor tap is refused");
    assert.strictEqual(ha.calls.length, 3, "and calls no service");

    // A tap from the widget is a plain browser navigation, so it must render.
    const page = await client.get("/widget/tap/1");
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /<!doctype html>/i);

    assert.strictEqual((await client.get("/widget/tap/99?format=json")).status, 404);
    assert.strictEqual((await client.get("/widget/tap/0?format=json")).status, 404);
  });
}

async function checkHomeAssistantOutage() {
  await withBridge(async (client, ha, bridge) => {
    await client.setCard(1, ["light.kitchen", "Kitchen", "Lightbulb", "Auto", "", "", "", "", ""]);
    await client.setOrder("1");
    assert.strictEqual(tileAt(await client.tiles(), 0).active, true);

    await ha.close();
    const payload = await client.tiles();
    assert(payload.homeAssistant.error, "an outage is reported to the widget");
    assert.strictEqual(
      tileAt(payload, 0).active,
      true,
      "the last known state keeps showing instead of blanking the tile",
    );
    assert(bridge, "bridge handle is available to the check");
  });
}

function checkCardCoverage() {
  const contract = JSON.parse(
    fs.readFileSync(path.join(ROOT, "common", "config", "card_contract.json"), "utf8"),
  );
  for (const type of Object.keys(contract.cards)) {
    const behaviour = behaviourFor(type);
    assert(behaviour && behaviour.tap && behaviour.face, `card type ${type || "(switch)"} has a behaviour`);
    if (isUnsupported(type)) {
      assert.strictEqual(behaviour.tap !== undefined, true);
    }
  }
}

function checkIconMapping() {
  assert.strictEqual(resolveIcon("Lightbulb", "light.kitchen").mdi, "lightbulb");
  assert.strictEqual(resolveIcon("Auto", "light.kitchen").mdi, "lightbulb", "Auto uses the domain default");
  assert.strictEqual(resolveIcon("Auto", "switch.desk").mdi, "power-plug");
  assert.strictEqual(resolveIcon("Auto", "sausage.thing").mdi, "cog", "unknown domains use the fallback icon");
  assert.strictEqual(resolveIcon("Not A Real Icon", "light.kitchen").mdi, "lightbulb");
}

function checkWidgetScript() {
  const source = fs.readFileSync(path.join(__dirname, "..", "widget", "espcontrol-widget.js"), "utf8");
  const icons = JSON.parse(fs.readFileSync(path.join(ROOT, "common", "assets", "icons.json"), "utf8"));
  const known = new Set(
    [...(icons.structural || []), ...(icons.icons || []), icons.fallback].map((icon) => icon.mdi),
  );

  const map = source.match(/const SYMBOLS = \{([\s\S]*?)\n\};/);
  assert(map, "widget script defines an MDI to SF Symbol map");
  const slugs = [...map[1].matchAll(/^\s+"?([a-z0-9-]+)"?:/gm)].map((match) => match[1]);
  assert(slugs.length > 20, "the symbol map is populated");
  for (const slug of slugs) {
    assert(known.has(slug), `SYMBOLS key "${slug}" is not an icon in common/assets/icons.json`);
  }

  // Every icon the bridge can return for a domain default needs a symbol, or
  // widgets fall back to a generic square for the most common cards.
  for (const name of Object.values(icons.domain_defaults || {})) {
    const icon = [...(icons.icons || []), ...(icons.structural || [])].find((item) => item.name === name);
    assert(icon && slugs.includes(icon.mdi), `domain default icon "${name}" has no SF Symbol mapping`);
  }
}

/** Cells a rendered row occupies, so span handling can be checked exactly. */
function rowCells(rowStack) {
  return rowStack.children.filter((child) => child.kind !== "spacer");
}

function rowWidth(rowStack) {
  return rowStack.children.reduce((total, child) => {
    if (child.kind === "spacer") return total + (child.amount || 0);
    return total + (child.size ? child.size.width : 0);
  }, 0);
}

function textsIn(node) {
  if (node.kind === "text") return [node.text];
  return (node.children || []).flatMap(textsIn);
}

async function checkWidgetRendering() {
  await withBridge(async (client) => {
    await client.setCard(1, ["light.kitchen", "Kitchen", "Lightbulb", "Auto", "", "", "", "", ""]);
    await client.setCard(2, [
      "",
      "Lounge",
      "Auto",
      "Auto",
      "sensor.living_room_temperature",
      "°C",
      "sensor",
      "1",
      "",
    ]);
    await client.setOrder("1,2");
    await client.tiles();

    const cell = 80;
    const { widget, requested } = await runWidgetScript({
      widgetParameter: `${client.base}?cell=${cell}`,
      loadJSON: async (url) => (await fetch(url)).json(),
    });

    assert.deepStrictEqual(requested, [`${client.base}/widget/tiles`], "the widget reads the tile feed");
    assert(widget, "the widget script produced a widget");

    const rows = widget.children.filter((child) => child.kind === "stack");
    assert.strictEqual(rows.length, 4, "renders one stack per panel row");
    for (const row of rows) {
      assert.strictEqual(row.layout, "horizontal");
      assert.strictEqual(rowCells(row).length, 4, "every row draws 4 cells");
    }

    const [kitchen, lounge] = rowCells(rows[0]);
    assert.deepStrictEqual(textsIn(kitchen), ["Kitchen"], "the first tile is the Kitchen card");
    assert.strictEqual(kitchen.url, `${client.base}/widget/tap/1`, "a tappable tile links to its action");
    assert.deepStrictEqual(textsIn(lounge), ["21.4°C", "Lounge"], "a sensor tile shows its reading");
    assert.strictEqual(lounge.url, null, "a read-only tile has no tap target");

    const expectedWidth = cell * 4 + 6 * 3;
    for (const row of rows) {
      assert.strictEqual(rowWidth(row), expectedWidth, "rows are the same width");
    }
  });
}

async function checkWidgetSpanRendering() {
  await withBridge(async (client) => {
    await client.setCard(1, ["light.kitchen", "Wide", "Lightbulb", "Auto", "", "", "", "", ""]);
    await client.setCard(2, ["switch.desk_lamp", "Tall", "Auto", "Auto", "", "", "", "", ""]);
    // Slot 1 wide (2x1) at cell 0; slot 2 tall (1x2) at cell 2.
    await client.setOrder("1w,,2d");
    await client.tiles();

    const cell = 80;
    const { widget } = await runWidgetScript({
      widgetParameter: `${client.base}?cell=${cell}`,
      loadJSON: async (url) => (await fetch(url)).json(),
    });

    const rows = widget.children.filter((child) => child.kind === "stack");
    const firstRow = rowCells(rows[0]);
    assert.strictEqual(firstRow.length, 3, "a wide card absorbs the cell beside it");
    assert.strictEqual(firstRow[0].size.width, cell * 2 + 6, "the wide card spans two cells plus the gap");
    assert.strictEqual(
      rowWidth(rows[0]),
      cell * 4 + 6 * 3,
      "a row with a wide card is still the full grid width",
    );

    // The tall card is drawn one row tall for now; the cell beneath it stays an
    // empty cell so the grid below does not shift.
    assert.strictEqual(rowCells(rows[1]).length, 4, "the row under a tall card still has 4 cells");
    assert.strictEqual(rowWidth(rows[1]), cell * 4 + 6 * 3);
  });
}

function imagesIn(node) {
  if (node.kind === "image") return [node];
  return (node.children || []).flatMap(imagesIn);
}

async function checkWidgetSymbolFallback() {
  await withBridge(async (client) => {
    // media_player maps to hifispeaker.fill, which the stub pretends this iOS
    // version does not have, so the widget must fall back rather than crash.
    await client.setCard(1, ["media_player.living", "Living", "Auto", "Auto", "", "", "media", "", ""]);
    await client.setOrder("1");
    await client.tiles();

    const { widget } = await runWidgetScript({
      widgetParameter: client.base,
      loadJSON: async (url) => (await fetch(url)).json(),
    });
    const rows = widget.children.filter((child) => child.kind === "stack");
    const [tile] = rowCells(rows[0]);
    const images = imagesIn(tile);
    assert.strictEqual(images.length, 1, "the tile still draws an icon");
    assert.strictEqual(
      images[0].image.symbol,
      "square.grid.2x2",
      "an unavailable SF Symbol falls back to the generic one",
    );
  });
}

async function checkWidgetOffline() {
  const { widget } = await runWidgetScript({
    widgetParameter: "http://127.0.0.1:1/",
    loadJSON: async () => {
      throw new Error("connection refused");
    },
  });
  const texts = textsIn(widget).join(" ");
  assert.match(texts, /Cannot reach the EspControl bridge/, "an unreachable bridge says so on the widget");
  assert.match(texts, /connection refused/, "and includes the reason");
}

// ---------------------------------------------------------------------------

async function main() {
  const checks = [
    ["entity surface", checkEntitySurface],
    ["config persistence", checkPersistence],
    ["widget payload", checkWidgetPayload],
    ["card spans", checkSpansAndEmptySlots],
    ["missing entity", checkMissingEntity],
    ["unsupported card", checkUnsupportedCard],
    ["tile taps", checkTaps],
    ["home assistant outage", checkHomeAssistantOutage],
    ["card coverage", checkCardCoverage],
    ["icon mapping", checkIconMapping],
    ["widget script", checkWidgetScript],
    ["widget rendering", checkWidgetRendering],
    ["widget spans", checkWidgetSpanRendering],
    ["widget symbol fallback", checkWidgetSymbolFallback],
    ["widget offline", checkWidgetOffline],
  ];

  for (const [name, check] of checks) {
    await check();
    process.stdout.write(`  ok  ${name}\n`);
  }
  process.stdout.write("Scriptable bridge checks passed.\n");
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
process.exit(1);
});
