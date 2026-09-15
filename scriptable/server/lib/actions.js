"use strict";

// Executes a tile tap. The widget can only open a URL, so every tap arrives here
// as a plain GET and the bridge does the Home Assistant work.

const { behaviourFor, isUnsupported } = require("./cards");
const { cardConfigFor, optionValue } = require("./tiles");

const ACTION_SERVICES = {
  scene: "turn_on",
  script: "turn_on",
  automation: "trigger",
  button: "press",
  input_button: "press",
  input_boolean: "toggle",
  select: "select_next",
  input_select: "select_next",
};

function domainOf(entityId) {
  return String(entityId || "").split(".")[0];
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of String(raw || "").split(/[\n;]+/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

async function runWebhookCard(card) {
  const url = String(card.entity || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Webhook card needs an http(s) URL");
  const method = String(card.sensor || "GET").toUpperCase();
  const body = method === "GET" || method === "DELETE" ? undefined : String(card.unit || "");
  const response = await fetch(url, {
    method,
    headers: parseHeaders(optionValue(card.options, "webhook_headers")),
    ...(body !== undefined ? { body } : {}),
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  return `${method} ${url}`;
}

/**
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function runTap(registry, ha, slot) {
  const card = cardConfigFor(registry, slot);
  if (isUnsupported(card.type)) {
    return { ok: false, message: "This card type is not available on a widget." };
  }

  const behaviour = behaviourFor(card.type);
  if (behaviour.tap === "none") {
    return { ok: false, message: "This card is read-only." };
  }
  if (behaviour.tap === "webhook") {
    return { ok: true, message: await runWebhookCard(card) };
  }

  const entityId = String(card.entity || "").trim();
  if (!entityId) return { ok: false, message: "This card has no entity." };
  const domain = domainOf(entityId);
  const current = ha.stateOf(entityId);

  if (behaviour.tap === "toggle") {
    await ha.callService("homeassistant", "toggle", { entity_id: entityId });
    return { ok: true, message: `Toggled ${entityId}` };
  }
  if (behaviour.tap === "action") {
    const service = ACTION_SERVICES[domain];
    if (!service) return { ok: false, message: `No widget action for ${domain} entities.` };
    await ha.callService(domain, service, { entity_id: entityId });
    return { ok: true, message: `Ran ${entityId}` };
  }
  if (behaviour.tap === "lock") {
    const locked = !current || current.state === "locked";
    await ha.callService("lock", locked ? "unlock" : "lock", { entity_id: entityId });
    return { ok: true, message: `${locked ? "Unlocked" : "Locked"} ${entityId}` };
  }
  if (behaviour.tap === "cover") {
    const open = current && (current.state === "open" || current.state === "opening");
    await ha.callService("cover", open ? "close_cover" : "open_cover", { entity_id: entityId });
    return { ok: true, message: `${open ? "Closing" : "Opening"} ${entityId}` };
  }
  if (behaviour.tap === "media") {
    await ha.callService("media_player", "media_play_pause", { entity_id: entityId });
    return { ok: true, message: `Play/pause ${entityId}` };
  }

  return { ok: false, message: `Unknown tap kind: ${behaviour.tap}` };
}

module.exports = { runTap, ACTION_SERVICES, parseHeaders };
