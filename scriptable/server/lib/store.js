"use strict";

// Panel config lives in one JSON file so a prototype panel can be backed up,
// copied between machines, or hand-edited the same way a device backup can.

const fs = require("fs");
const path = require("path");

const FORMAT = "espcontrol-scriptable-panel";
const VERSION = 1;

class PanelStore {
  constructor(file, registry) {
    this.file = file;
    this.registry = registry;
    this._writeTimer = null;
  }

  load() {
    if (!fs.existsSync(this.file)) return false;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (err) {
      throw new Error(`${this.file} is not valid JSON: ${err.message}`);
    }
    if (parsed.format !== FORMAT) {
      throw new Error(`${this.file} is not a ${FORMAT} file`);
    }
    this.registry.load(parsed.entities);
    return true;
  }

  /** Debounced so a burst of card edits becomes one write. */
  scheduleSave() {
    if (this._writeTimer) return;
    this._writeTimer = setTimeout(() => {
      this._writeTimer = null;
      this.save();
    }, 250);
    if (this._writeTimer.unref) this._writeTimer.unref();
  }

  save() {
    const body = {
      format: FORMAT,
      version: VERSION,
      saved: new Date().toISOString(),
      entities: this.registry.toJSON(),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
  }

  flush() {
    if (!this._writeTimer) return;
    clearTimeout(this._writeTimer);
    this._writeTimer = null;
    this.save();
  }
}

module.exports = { PanelStore, FORMAT, VERSION };
