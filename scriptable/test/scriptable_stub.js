"use strict";

// Runs the Scriptable widget script under stub Scriptable globals and returns
// the widget tree it built. Enough of the API is modelled to check layout and
// content; nothing here tries to be a rendering engine.

const fs = require("fs");
const path = require("path");

const WIDGET_JS = path.join(__dirname, "..", "widget", "espcontrol-widget.js");

// SF Symbols the stub pretends this iOS version has. Anything else makes
// SFSymbol.named return null, which is how Scriptable reports an unknown name.
const AVAILABLE_SYMBOLS = new Set([
  "lightbulb.fill",
  "powerplug.fill",
  "gauge.medium",
  "theatermasks.fill",
  "square.grid.2x2",
  "lock.fill",
]);

class StubStack {
  constructor(kind = "stack") {
    this.kind = kind;
    this.children = [];
    this.layout = "vertical";
    this.size = null;
    this.url = null;
    this.backgroundColor = null;
    this.cornerRadius = 0;
    this.padding = null;
  }

  layoutHorizontally() {
    this.layout = "horizontal";
  }

  layoutVertically() {
    this.layout = "vertical";
  }

  setPadding(top, left, bottom, right) {
    this.padding = [top, left, bottom, right];
  }

  addStack() {
    const stack = new StubStack();
    this.children.push(stack);
    return stack;
  }

  addText(text) {
    const node = {
      kind: "text",
      text,
      font: null,
      textColor: null,
      lineLimit: 0,
      minimumScaleFactor: 1,
      centerAlignText() {},
    };
    this.children.push(node);
    return node;
  }

  addImage(image) {
    const node = { kind: "image", image, imageSize: null, tintColor: null, resizable: false };
    this.children.push(node);
    return node;
  }

  addSpacer(amount) {
    const node = { kind: "spacer", amount: amount == null ? null : amount };
    this.children.push(node);
    return node;
  }
}

class StubWidget extends StubStack {
  constructor() {
    super("widget");
    this.refreshAfterDate = null;
    this.presented = null;
  }

  async presentLarge() {
    this.presented = "large";
  }
}

/**
 * @param {object} options
 * @param {string} options.widgetParameter - the widget's Parameter field.
 * @param {(url: string) => Promise<object>} options.loadJSON - stands in for Request.
 */
async function runWidgetScript({ widgetParameter, loadJSON, widgetFamily = "large" }) {
  const requested = [];
  let produced = null;

  const globals = {
    args: { widgetParameter },
    config: { widgetFamily, runsInWidget: true },
    Script: {
      setWidget(widget) {
        produced = widget;
      },
      complete() {},
    },
    ListWidget: StubWidget,
    Color: class {
      constructor(hex) {
        this.hex = hex;
      }
    },
    Size: class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
    },
    Font: {
      systemFont: (size) => ({ size, weight: "regular" }),
      mediumSystemFont: (size) => ({ size, weight: "medium" }),
      semiboldSystemFont: (size) => ({ size, weight: "semibold" }),
      semiboldRoundedSystemFont: (size) => ({ size, weight: "semibold-rounded" }),
    },
    SFSymbol: {
      named: (name) => (AVAILABLE_SYMBOLS.has(name) ? { name, image: { symbol: name } } : null),
    },
    Request: class {
      constructor(url) {
        this.url = url;
        this.timeoutInterval = 0;
        requested.push(url);
      }

      async loadJSON() {
        return loadJSON(this.url);
      }
    },
  };

  const source = fs.readFileSync(WIDGET_JS, "utf8");
  const names = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `return (async () => {\n${source}\n})();`);
  await factory(...names.map((name) => globals[name]));

  return { widget: produced, requested, AVAILABLE_SYMBOLS };
}

module.exports = { runWidgetScript, StubStack, StubWidget, AVAILABLE_SYMBOLS };
