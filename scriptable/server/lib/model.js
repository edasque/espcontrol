"use strict";

// The saved card-config format is owned by src/webserver/model/*.ts, which the
// repo build bundles into src/webserver/modules/model_generated.js as a browser
// global. Loading that same bundle here keeps the bridge's parsing identical to
// the configurator's and to the firmware contract, instead of a second copy that
// can drift.

const fs = require("fs");
const { MODEL_JS } = require("./paths");

function loadModel() {
  const source = fs.readFileSync(MODEL_JS, "utf8");
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${source}\n;return EspControlModel;`);
  const model = factory();
  if (!model || typeof model.parseRawButtonConfig !== "function") {
    throw new Error(`Unexpected web model bundle at ${MODEL_JS}`);
  }
  return model;
}

module.exports = loadModel();
