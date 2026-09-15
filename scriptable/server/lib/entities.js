"use strict";

// An in-memory stand-in for the ESPHome web server entities a physical panel
// exposes. The setup page reads and writes nothing else, so emulating this
// surface is what lets the unmodified configurator bundle drive a virtual panel.

const fs = require("fs");
const path = require("path");

const { ENTITY_NAMES_JSON } = require("./paths");

const DEFAULTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "entity_defaults.json"), "utf8"),
);

const SLOT_GROUPS = new Set(["card_slot", "subpage_slot"]);

// Mirrors esphomeObjectId() in src/webserver/modules/entity_state.js.
function objectIdFor(name) {
  return String(name || "")
    .split("")
    .map((ch) => {
      if (ch === " ") return "_";
      const lower = ch.toLowerCase();
      if ((lower >= "a" && lower <= "z") || (ch >= "0" && ch <= "9") || ch === "-" || ch === "_") {
        return lower;
      }
      return "_";
    })
    .join("");
}

function emptyValueFor(domain) {
  if (domain === "switch") return false;
  if (domain === "number") return 0;
  return "";
}

function defaultsFor(key, slot) {
  const spec = DEFAULTS[key];
  if (!spec || slot != null) return {};
  return spec;
}

class EntityRegistry {
  constructor(slots) {
    this.slots = slots;
    this.byObjectId = new Map();
    this.order = [];
    this._build();
  }

  _build() {
    const definitions = JSON.parse(fs.readFileSync(ENTITY_NAMES_JSON, "utf8")).entities;
    for (const def of definitions) {
      const groups = def.groups || [];
      const slotted = groups.some((group) => SLOT_GROUPS.has(group));
      if (slotted) {
        for (let slot = 1; slot <= this.slots; slot += 1) {
          this._add(def, String(def.template).replace("{slot}", String(slot)), slot);
        }
      } else if (def.name) {
        this._add(def, def.name, null);
      }
    }
  }

  _add(def, name, slot) {
    const spec = defaultsFor(def.key, slot);
    const entity = {
      key: def.key,
      slot,
      domain: def.domain,
      name,
      objectId: objectIdFor(name),
      aliases: (def.objectIds || []).slice(),
      value: spec.value !== undefined ? spec.value : emptyValueFor(def.domain),
      option: spec.option || null,
      min: spec.min != null ? spec.min : null,
      max: spec.max != null ? spec.max : null,
      step: spec.step != null ? spec.step : null,
    };
    this.order.push(entity);
    this._index(entity);
  }

  _index(entity) {
    const keys = [entity.objectId, ...entity.aliases];
    for (const key of keys) {
      const mapKey = `${entity.domain}/${key}`;
      // The first entity claiming an object id wins; aliases exist so older
      // firmware names keep resolving, and must never shadow a real entity.
      if (!this.byObjectId.has(mapKey)) this.byObjectId.set(mapKey, entity);
    }
    this.byObjectId.set(`${entity.domain}/${entity.name}`, entity);
  }

  /** Resolve a REST path segment, which may be an object id, alias, or full name. */
  find(domain, identifier) {
    const direct = this.byObjectId.get(`${domain}/${identifier}`);
    if (direct) return direct;
    return this.byObjectId.get(`${domain}/${objectIdFor(identifier)}`) || null;
  }

  byKey(key, slot) {
    return (
      this.order.find((entity) => entity.key === key && (slot == null || entity.slot === slot)) || null
    );
  }

  /** Values worth persisting: everything the setup page can change. */
  toJSON() {
    const out = {};
    for (const entity of this.order) {
      out[`${entity.domain}/${entity.objectId}`] = entity.value;
    }
    return out;
  }

  load(saved) {
    if (!saved) return;
    for (const entity of this.order) {
      const stored = saved[`${entity.domain}/${entity.objectId}`];
      if (stored !== undefined) entity.value = stored;
    }
  }
}

function stateString(entity) {
  if (entity.domain === "switch") return entity.value ? "ON" : "OFF";
  return String(entity.value == null ? "" : entity.value);
}

/** The JSON body ESPHome's web server returns for `GET /<domain>/<id>?detail=all`. */
function detailJson(entity) {
  const body = {
    id: `${entity.domain}-${entity.objectId}`,
    name: entity.name,
    domain: entity.domain,
    state: stateString(entity),
    value: entity.value,
  };
  if (entity.option) body.option = entity.option.slice();
  if (entity.min != null) body.min_value = entity.min;
  if (entity.max != null) body.max_value = entity.max;
  if (entity.step != null) body.step = entity.step;
  return body;
}

/**
 * Apply a POST action. Returns true when the action was understood, so the
 * caller can answer 404 for anything a real panel would also reject.
 */
function applyAction(entity, action, query) {
  if (entity.domain === "switch") {
    if (action === "turn_on") entity.value = true;
    else if (action === "turn_off") entity.value = false;
    else if (action === "toggle") entity.value = !entity.value;
    else return false;
    return true;
  }
  if (entity.domain === "button") return action === "press";
  if (action !== "set") return false;
  if (entity.domain === "select") {
    const option = query.get("option");
    if (option == null) return false;
    entity.value = option;
    return true;
  }
  if (entity.domain === "number") {
    const parsed = Number(query.get("value"));
    if (!Number.isFinite(parsed)) return false;
    entity.value = parsed;
    return true;
  }
  const value = query.get("value");
  if (value == null) return false;
  entity.value = value;
  return true;
}

module.exports = { EntityRegistry, objectIdFor, detailJson, stateString, applyAction };
