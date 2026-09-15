"use strict";

const path = require("path");

const SERVER_DIR = path.resolve(__dirname, "..");
const SCRIPTABLE_DIR = path.resolve(SERVER_DIR, "..");
const REPO_ROOT = path.resolve(SCRIPTABLE_DIR, "..");

module.exports = {
  REPO_ROOT,
  SCRIPTABLE_DIR,
  SERVER_DIR,
  PUBLIC_DIR: path.join(SERVER_DIR, "public"),
  BUNDLE_JS: path.join(SERVER_DIR, "public", "www.js"),
  PANEL_JSON: path.join(SCRIPTABLE_DIR, "panel.json"),
  MODEL_JS: path.join(REPO_ROOT, "src", "webserver", "modules", "model_generated.js"),
  ENTITY_NAMES_JSON: path.join(REPO_ROOT, "common", "config", "entity_names.json"),
  ICONS_JSON: path.join(REPO_ROOT, "common", "assets", "icons.json"),
  BUNDLE_BUILDER: path.join(REPO_ROOT, "scripts", "build_scriptable_bundle.py"),
};
