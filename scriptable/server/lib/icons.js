"use strict";

// Resolves the icon names the setup page saves ("Lightbulb", or "Auto") into the
// Material Design Icon slug and codepoint that common/assets/icons.json defines
// for firmware. The widget maps the slug onto an SF Symbol; the codepoint is
// carried through so a future widget can render the real MDI glyph instead.

const fs = require("fs");
const { ICONS_JSON } = require("./paths");

const data = JSON.parse(fs.readFileSync(ICONS_JSON, "utf8"));

const byName = new Map();
for (const icon of [...(data.structural || []), ...(data.icons || [])]) {
  byName.set(icon.name, icon);
}
const fallback = data.fallback;
const domainDefaults = data.domain_defaults || {};

function iconByName(name) {
  return byName.get(String(name || "")) || null;
}

function shape(icon) {
  if (!icon) return { name: fallback.name, mdi: fallback.mdi, codepoint: fallback.codepoint };
  return { name: icon.name, mdi: icon.mdi, codepoint: icon.codepoint };
}

/**
 * @param {string} configured - the card's saved icon name, or "Auto"/"".
 * @param {string} entityId - the Home Assistant entity the card points at.
 */
function resolveIcon(configured, entityId) {
  const name = String(configured || "").trim();
  if (name && name !== "Auto") {
    const direct = iconByName(name);
    if (direct) return shape(direct);
  }
  const domain = String(entityId || "").split(".")[0];
  const defaultName = domainDefaults[domain];
  if (defaultName) return shape(iconByName(defaultName));
  return shape(null);
}

module.exports = { resolveIcon, iconByName, domainDefaults, fallback };
