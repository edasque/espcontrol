"use strict";

// Turns the saved panel config plus live Home Assistant state into the flat
// tile list the Scriptable widget draws. All layout maths (which slot sits in
// which cell, and how far a card spans) comes from the shared web model, so the
// widget grid matches what the setup page previews.

const model = require("./model");
const { resolveIcon } = require("./icons");
const { behaviourFor, isUnsupported, isActiveState } = require("./cards");

function cardConfigFor(registry, slot) {
  const entity = registry.byKey("button_config", slot);
  return model.parseRawButtonConfig(entity ? String(entity.value || "") : "");
}

// Matches configOptionValue() in src/webserver/modules/config_option_core.js.
function optionValue(options, name) {
  const prefix = `${name}=`;
  for (const part of String(options || "").split(",")) {
    if (part.startsWith(prefix)) return model.decodeConfigField(part.slice(prefix.length));
  }
  return "";
}

function titleFromEntityId(entityId) {
  const objectId = String(entityId || "").split(".")[1] || "";
  return objectId.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatNumber(raw, precision) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const digits = parseInt(precision, 10);
  if (Number.isFinite(digits) && digits >= 0) return value.toFixed(digits);
  return String(value);
}

/** The reading a "value" face shows: sensor entity first, then the card entity. */
function readingFor(card, haState, sensorState) {
  const source = sensorState || haState;
  if (!source) return null;
  if (card.precision === "text") return String(source.state);
  const unit = card.unit || (source.attributes && source.attributes.unit_of_measurement) || "";
  const numeric = formatNumber(source.state, card.precision);
  if (numeric == null) return String(source.state);
  return unit ? `${numeric}${unit.startsWith("°") ? "" : " "}${unit}` : numeric;
}

/**
 * The small badge in a tile corner. Only cards whose face is something else
 * (a switch showing power draw, say) get one: on a card whose face already *is*
 * the sensor reading, a badge would just repeat it.
 */
function badgeFor(card, sensorState, face) {
  if (face === "value") return null;
  if (!card.sensor || card.sensor === "local" || !sensorState) return null;
  const unit = card.unit || (sensorState.attributes && sensorState.attributes.unit_of_measurement) || "";
  const numeric = formatNumber(sensorState.state, card.precision);
  const text = numeric == null ? String(sensorState.state) : numeric;
  return unit ? `${text}${unit.startsWith("°") ? "" : " "}${unit}` : text;
}

function detailFor(behaviour, haState) {
  if (!behaviour.detail || !haState || !haState.attributes) return null;
  const raw = haState.attributes[behaviour.detail];
  if (raw == null || raw === "") return null;
  if (behaviour.detail === "brightness") {
    const percent = Math.round((Number(raw) / 255) * 100);
    return Number.isFinite(percent) ? `${percent}%` : null;
  }
  if (behaviour.detail === "percentage" || behaviour.detail === "current_position") {
    return `${Math.round(Number(raw))}%`;
  }
  if (behaviour.detail === "current_temperature" || behaviour.detail === "temperature") {
    const unit = (haState.attributes && haState.attributes.temperature_unit) || "";
    return `${raw}${unit || "°"}`;
  }
  return String(raw);
}

function buildTile(card, slot, pos, layout, ha) {
  const behaviour = behaviourFor(card.type);
  const unsupported = isUnsupported(card.type);
  const haState = card.entity ? ha.stateOf(card.entity) : null;
  const sensorEntity = card.sensor && card.sensor !== "local" ? card.sensor : "";
  const sensorState = sensorEntity ? ha.stateOf(sensorEntity) : null;
  const active = !unsupported && !!haState && isActiveState(haState.state);
  const iconSource = card.entity || sensorEntity;
  const icon = resolveIcon(active && card.icon_on !== "Auto" ? card.icon_on : card.icon, iconSource);
  const face = unsupported ? "text" : behaviour.face;

  const tile = {
    slot,
    pos,
    row: Math.floor(pos / layout.cols),
    col: pos % layout.cols,
    colSpan: model.sizeColSpan(layout.sizes[String(slot)]),
    rowSpan: model.sizeRowSpan(layout.sizes[String(slot)]),
    type: card.type,
    label: card.label || titleFromEntityId(card.entity || sensorEntity) || "",
    entity: card.entity || "",
    icon,
    face,
    active,
    state: haState ? String(haState.state) : "",
    reading: null,
    detail: null,
    badge: badgeFor(card, sensorState, face),
    tap: unsupported ? "none" : behaviour.tap,
    unsupported,
  };

  if (unsupported) {
    tile.reading = "Not on widget";
  } else if (tile.face === "value") {
    tile.reading = readingFor(card, haState, sensorState);
  } else if (tile.face === "text") {
    tile.reading = haState ? String(haState.state) : null;
  }

  if (!unsupported) tile.detail = detailFor(behaviour, haState);

  if (card.entity && !haState && ha.configured && card.type !== "webhook") tile.missing = true;

  // The webhook card is a plain HTTP request, not a Home Assistant entity:
  // entity holds the URL, sensor the method. It never resolves to an HA state.
  if (card.type === "webhook") {
    tile.entity = "";
    tile.state = "";
    tile.reading = null;
    tile.label = card.label || "Webhook";
  }

  return tile;
}

/** Slot -> grid position, honouring saved card sizes, from the shared web model. */
function layoutFor(registry, panel) {
  const orderEntity = registry.byKey("button_order");
  const parsed = model.parseGridOrder(
    orderEntity ? String(orderEntity.value || "") : "",
    panel.slots,
    panel.layout.cols,
  );
  return { cols: panel.layout.cols, rows: panel.layout.rows, grid: parsed.grid, sizes: parsed.sizes };
}

function normalizeColor(raw) {
  const hex = String(raw || "").replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : "#FF8C00";
}

function buildTiles(registry, panel, ha) {
  const layout = layoutFor(registry, panel);
  const tiles = [];
  for (let pos = 0; pos < layout.grid.length; pos += 1) {
    const slot = layout.grid[pos];
    if (!slot || slot < 1) continue; // 0 = empty cell, -1 = covered by a spanning card
    const card = cardConfigFor(registry, slot);
    if (!card.entity && !card.type && !card.label) continue;
    tiles.push(buildTile(card, slot, pos, layout, ha));
  }
  return tiles;
}

function widgetPayload(registry, panel, ha) {
  const onColor = registry.byKey("button_on_color");
  return {
    panel: {
      id: panel.id,
      name: panel.public.name,
      cols: panel.layout.cols,
      rows: panel.layout.rows,
      slots: panel.slots,
    },
    onColor: normalizeColor(onColor && onColor.value),
    generated: new Date().toISOString(),
    homeAssistant: {
      configured: ha.configured,
      error: ha.lastError,
    },
    tiles: buildTiles(registry, panel, ha),
  };
}

module.exports = { widgetPayload, buildTiles, layoutFor, cardConfigFor, optionValue, normalizeColor };
