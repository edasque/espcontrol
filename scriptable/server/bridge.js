#!/usr/bin/env node
"use strict";

// EspControl Scriptable bridge.
//
// Runs on a machine on the same network as Home Assistant and plays the part a
// physical panel normally plays:
//
//   * it serves the unmodified EspControl setup page, so a virtual panel is
//     configured exactly like a real one (tiles, labels, icons, sizes, colour);
//   * it stores that configuration in a JSON file instead of device flash;
//   * it proxies Home Assistant, so the iPad never holds a long-lived token;
//   * it renders the saved config plus live state into /widget/tiles, which the
//     Scriptable widget on the iPad draws.

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { PANEL_JSON, PUBLIC_DIR, BUNDLE_JS, BUNDLE_BUILDER, REPO_ROOT } = require("./lib/paths");
const { EntityRegistry, detailJson, applyAction } = require("./lib/entities");
const { PanelStore } = require("./lib/store");
const { HomeAssistantClient } = require("./lib/ha");
const { widgetPayload } = require("./lib/tiles");
const { runTap } = require("./lib/actions");
const { sendJson, sendText, sendFile } = require("./lib/http_util");

const ENTITY_DOMAINS = new Set([
  "text",
  "select",
  "number",
  "switch",
  "button",
  "sensor",
  "text_sensor",
  "update",
]);

function parseArgs(argv) {
  const options = {
    port: Number(process.env.ESPCONTROL_PORT || 8099),
    host: process.env.ESPCONTROL_HOST || "0.0.0.0",
    config: process.env.ESPCONTROL_CONFIG || path.join(REPO_ROOT, "scriptable", "panels", "default.json"),
    haUrl: process.env.HA_URL || "",
    haToken: process.env.HA_TOKEN || "",
    cacheMs: Number(process.env.ESPCONTROL_HA_CACHE_MS || 5000),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === "--port") options.port = Number(next());
    else if (arg === "--host") options.host = next();
    else if (arg === "--config") options.config = path.resolve(next());
    else if (arg === "--ha-url") options.haUrl = next();
    else if (arg === "--ha-token") options.haToken = next();
    else if (arg === "--cache-ms") options.cacheMs = Number(next());
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const USAGE = `Usage: node scriptable/server/bridge.js [options]

  --port <n>        Listen port (default 8099, or ESPCONTROL_PORT)
  --host <addr>     Bind address (default 0.0.0.0, or ESPCONTROL_HOST)
  --config <file>   Panel config file (default scriptable/panels/default.json)
  --ha-url <url>    Home Assistant base URL, e.g. http://homeassistant.local:8123
  --ha-token <tok>  Home Assistant long-lived access token
  --cache-ms <n>    How long to reuse a Home Assistant state snapshot (default 5000)

HA_URL and HA_TOKEN environment variables work in place of the flags.
`;

function ensureBundle() {
  if (fs.existsSync(BUNDLE_JS)) return;
  process.stdout.write("Setup page bundle missing; building it...\n");
  try {
    execFileSync("python3", [BUNDLE_BUILDER], { cwd: REPO_ROOT, stdio: "inherit" });
  } catch {
    throw new Error(
      `Could not build ${path.relative(REPO_ROOT, BUNDLE_JS)}.\n` +
        "Run 'npm ci' then 'npm run scriptable:build' in the repo first.",
    );
  }
}

function localAddresses(port) {
  const urls = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) urls.push(`http://${entry.address}:${port}/`);
    }
  }
  return urls;
}

function createBridge(options) {
  const panel = JSON.parse(fs.readFileSync(PANEL_JSON, "utf8"));
  const registry = new EntityRegistry(panel.slots);
  const store = new PanelStore(options.config, registry);
  store.load();

  const ha = new HomeAssistantClient({
    baseUrl: options.haUrl,
    token: options.haToken,
    cacheMs: options.cacheMs,
  });

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      sendJson(res, 500, { error: err.message });
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "bridge"}`);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (segments.length === 0) return sendFile(res, path.join(PUBLIC_DIR, "index.html"));
    if (segments.length === 1 && segments[0] === "www.js") return sendFile(res, BUNDLE_JS);

    // The setup page asks a real panel for its firmware version on load.
    if (url.pathname === "/espcontrol/version") {
      return sendJson(res, 200, { firmware_version: "scriptable-bridge", name: panel.public.name });
    }

    if (segments[0] === "widget") return handleWidget(req, res, segments.slice(1), url);
    if (ENTITY_DOMAINS.has(segments[0])) return handleEntity(req, res, segments, url);

    return sendText(res, 404, "Not found");
  }

  function handleEntity(req, res, segments, url) {
    const [domain, identifier, action] = segments;
    const entity = registry.find(domain, identifier || "");
    if (!entity) return sendText(res, 404, "Not found");

    if (req.method === "GET" && !action) return sendJson(res, 200, detailJson(entity));

    if (req.method === "POST" && action) {
      if (!applyAction(entity, action, url.searchParams)) return sendText(res, 400, "Bad request");
      store.scheduleSave();
      return sendText(res, 200, "");
    }

    return sendText(res, 405, "Method not allowed");
  }

  async function handleWidget(req, res, segments, url) {
    if (segments[0] === "tiles") {
      await ha.states({ force: url.searchParams.get("refresh") === "1" });
      return sendJson(res, 200, widgetPayload(registry, panel, ha));
    }

    if (segments[0] === "tap" && segments[1]) {
      const slot = parseInt(segments[1], 10);
      if (!(slot >= 1 && slot <= panel.slots)) return sendText(res, 404, "Unknown slot");
      await ha.states();
      let result;
      try {
        result = await runTap(registry, ha, slot);
      } catch (err) {
        result = { ok: false, message: err.message };
      }
      if (url.searchParams.get("format") === "json" || req.method === "POST") {
        return sendJson(res, result.ok ? 200 : 400, result);
      }
      // A widget tap opens this URL in the browser, so answer with a page that
      // reports the outcome and gets out of the way.
      return sendText(res, result.ok ? 200 : 400, tapPage(result), "text/html; charset=utf-8");
    }

    if (segments[0] === "health") {
      return sendJson(res, 200, {
        ok: true,
        panel: panel.id,
        config: options.config,
        homeAssistant: { configured: ha.configured, error: ha.lastError },
      });
    }

    return sendText(res, 404, "Not found");
  }

  return { server, registry, store, ha, panel };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
  });
}

function tapPage(result) {
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<title>EspControl</title><style>",
    "body{font:17px -apple-system,system-ui,sans-serif;margin:0;display:flex;",
    "align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;text-align:center}",
    "p{margin:0 24px}</style></head><body>",
    `<p>${escapeHtml(result.message)}</p>`,
    // Leave the failure on screen; close a success so the tap feels instant.
    result.ok ? "<script>setTimeout(function(){window.close();},600);</script>" : "",
    "</body></html>",
  ].join("");
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  ensureBundle();
  const bridge = createBridge(options);

  bridge.server.listen(options.port, options.host, () => {
    process.stdout.write(`EspControl Scriptable bridge for ${bridge.panel.public.name}\n`);
    process.stdout.write(`  config   ${options.config}\n`);
    process.stdout.write(
      `  home assistant ${bridge.ha.configured ? options.haUrl : "not configured (tiles will show no state)"}\n`,
    );
    for (const address of localAddresses(options.port)) {
      process.stdout.write(`  setup page  ${address}\n`);
      process.stdout.write(`  widget feed ${address}widget/tiles\n`);
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      bridge.store.flush();
      bridge.server.close(() => process.exit(0));
    });
  }
}

if (require.main === module) main();

module.exports = { createBridge, parseArgs };
