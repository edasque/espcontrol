// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: th;

// EspControl widget for Scriptable (iPadOS / iOS).
//
// Draws the tile grid configured in the EspControl setup page that the bridge
// serves, using live Home Assistant state the bridge fetches. Tapping a tile
// opens the bridge's /widget/tap/<slot> URL, which performs the action.
//
// Setup
//   1. Run the bridge on a machine on your network:
//        node scriptable/server/bridge.js --ha-url http://homeassistant.local:8123 \
//                                         --ha-token <long-lived token>
//   2. Copy this file into Scriptable on the iPad (Files -> Scriptable folder,
//      or paste it into a new script called "EspControl").
//   3. Add a Scriptable widget to the home screen, choose this script, and set
//      the widget Parameter to the bridge URL, e.g.
//        http://192.168.1.20:8099
//      Optionally tune the tile size:   http://192.168.1.20:8099?cell=82
//
// Running the script inside Scriptable shows a preview of the same grid.

const DEFAULT_BRIDGE_URL = "http://192.168.1.20:8099";

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

const THEME = {
  background: new Color("#111214"),
  tile: new Color("#1f2126"),
  tileEmpty: new Color("#17181b"),
  label: new Color("#f2f2f7"),
  labelActive: new Color("#141414"),
  muted: new Color("#8e8e93"),
  error: new Color("#ff453a"),
  gap: 6,
  radius: 10,
  padding: 8,
};

// Material Design Icon slug -> SF Symbol. The bridge resolves each tile's icon
// through common/assets/icons.json, so the slugs here are the same ones the
// firmware renders from the MDI font.
const SYMBOLS = {
  account: "person.fill",
  "air-conditioner": "wind",
  "air-filter": "wind",
  "air-humidifier": "humidity.fill",
  "air-purifier": "wind",
  airplane: "airplane",
  "alarm-light": "exclamationmark.triangle.fill",
  "arrow-down": "arrow.down",
  "arrow-up": "arrow.up",
  bathtub: "bathtub.fill",
  battery: "battery.100",
  "battery-charging": "battery.100.bolt",
  "battery-low": "battery.25",
  bed: "bed.double.fill",
  "bed-king": "bed.double.fill",
  "bed-queen": "bed.double.fill",
  bell: "bell.fill",
  "bell-ring": "bell.badge.fill",
  bird: "bird.fill",
  blinds: "blinds.vertical.closed",
  "blinds-open": "blinds.vertical.open",
  "blinds-horizontal": "blinds.horizontal.closed",
  "blinds-horizontal-closed": "blinds.horizontal.closed",
  broom: "sparkles",
  "calendar-check": "calendar",
  camera: "camera.fill",
  "car-electric": "bolt.car.fill",
  cast: "airplayvideo",
  cat: "pawprint.fill",
  cctv: "video.fill",
  "ceiling-fan": "fan.fill",
  "ceiling-light": "light.recessed",
  "ceiling-light-multiple": "light.recessed",
  chandelier: "lightbulb.fill",
  check: "checkmark",
  "check-circle": "checkmark.circle.fill",
  "clock-outline": "clock",
  close: "xmark",
  "coffee-maker": "cup.and.saucer.fill",
  cog: "gearshape.fill",
  curtains: "curtains.open",
  "curtains-closed": "curtains.closed",
  delete: "trash.fill",
  "desk-lamp": "lamp.desk.fill",
  dishwasher: "dishwasher.fill",
  dog: "pawprint.fill",
  door: "door.left.hand.closed",
  "door-open": "door.left.hand.open",
  "doorbell-video": "video.doorbell.fill",
  "dots-horizontal": "ellipsis",
  download: "arrow.down.circle.fill",
  ethernet: "cable.connector",
  "ev-station": "bolt.car.fill",
  fan: "fan.fill",
  "fan-auto": "fan.fill",
  "fan-off": "fan.fill",
  fire: "flame.fill",
  fireplace: "flame.fill",
  flash: "bolt.fill",
  "floor-lamp": "lamp.floor.fill",
  folder: "folder.fill",
  fridge: "refrigerator.fill",
  "gamepad-variant": "gamecontroller.fill",
  garage: "door.garage.closed",
  "garage-open": "door.garage.open",
  gate: "door.left.hand.closed",
  "gate-open": "door.left.hand.open",
  gauge: "gauge.medium",
  "gauge-full": "gauge.high",
  "gauge-low": "gauge.low",
  "gesture-tap": "hand.tap.fill",
  headphones: "headphones",
  "heat-pump": "flame.fill",
  "heat-wave": "flame.fill",
  "heating-coil": "flame.fill",
  home: "house.fill",
  "home-assistant": "house.fill",
  "home-circle": "house.fill",
  "home-thermometer": "thermometer.medium",
  "hot-tub": "bathtub.fill",
  hvac: "wind",
  image: "photo.fill",
  kettle: "kettle.fill",
  "key-variant": "key.fill",
  lamp: "lamp.table.fill",
  lan: "wifi.router.fill",
  leaf: "leaf.fill",
  "led-strip": "lightbulb.fill",
  "light-switch": "switch.2",
  lightbulb: "lightbulb.fill",
  "lightbulb-group": "lightbulb.fill",
  "lightbulb-off": "lightbulb.slash.fill",
  "lightning-bolt": "bolt.fill",
  lock: "lock.fill",
  "lock-open": "lock.open.fill",
  "lock-outline": "lock.fill",
  mailbox: "envelope.fill",
  medication: "pills.fill",
  microphone: "mic.fill",
  "microphone-off": "mic.slash.fill",
  microwave: "microwave.fill",
  minus: "minus",
  monitor: "display",
  "motion-sensor": "figure.walk",
  "movie-roll": "film.fill",
  music: "music.note",
  "music-note": "music.note",
  palette: "paintpalette.fill",
  "package-variant": "shippingbox.fill",
  pause: "pause.fill",
  pill: "pills.fill",
  play: "play.fill",
  "play-pause": "playpause.fill",
  plus: "plus",
  pool: "figure.pool.swim",
  power: "power",
  "power-plug": "powerplug.fill",
  "power-socket": "powerplug.fill",
  printer: "printer.fill",
  "progress-clock": "clock",
  projector: "video.fill",
  radiator: "flame.fill",
  recycle: "arrow.3.trianglepath",
  "robot-mower": "leaf.fill",
  "robot-vacuum": "arrow.clockwise.circle.fill",
  "router-network": "wifi.router.fill",
  "router-wireless": "wifi.router.fill",
  "shield-home": "shield.lefthalf.filled",
  "shield-lock": "lock.shield.fill",
  shower: "shower.fill",
  "shower-head": "shower.fill",
  silverware: "fork.knife",
  "skip-next": "forward.end.fill",
  "skip-previous": "backward.end.fill",
  "smoke-detector": "smoke.fill",
  snowflake: "snowflake",
  sofa: "sofa.fill",
  "solar-panel": "sun.max.fill",
  "solar-power": "sun.max.fill",
  speaker: "hifispeaker.fill",
  "speaker-pause": "hifispeaker.fill",
  "speaker-play": "hifispeaker.fill",
  sprinkler: "drop.fill",
  stop: "stop.fill",
  stove: "oven.fill",
  "string-lights": "lightbulb.fill",
  "swap-horizontal": "arrow.left.arrow.right",
  "table-furniture": "table.furniture",
  tag: "tag.fill",
  television: "tv.fill",
  "television-off": "tv.slash",
  thermometer: "thermometer.medium",
  thermostat: "thermometer.medium",
  "timer-outline": "timer",
  toilet: "toilet.fill",
  "transmission-tower": "bolt.horizontal.fill",
  "trash-can": "trash.fill",
  "tumble-dryer": "dryer.fill",
  update: "arrow.triangle.2.circlepath",
  vacuum: "arrow.clockwise.circle.fill",
  "volume-high": "speaker.wave.2.fill",
  "volume-off": "speaker.slash.fill",
  "wall-sconce": "lightbulb.fill",
  "washing-machine": "washer.fill",
  water: "drop.fill",
  "water-boiler": "flame.fill",
  "water-percent": "humidity.fill",
  "weather-cloudy": "cloud.fill",
  "weather-fog": "cloud.fog.fill",
  "weather-hail": "cloud.hail.fill",
  "weather-lightning": "cloud.bolt.fill",
  "weather-lightning-rainy": "cloud.bolt.rain.fill",
  "weather-night": "moon.stars.fill",
  "weather-night-partly-cloudy": "cloud.moon.fill",
  "weather-partly-cloudy": "cloud.sun.fill",
  "weather-pouring": "cloud.heavyrain.fill",
  "weather-rainy": "cloud.rain.fill",
  "weather-snowy": "cloud.snow.fill",
  "weather-sunny": "sun.max.fill",
  "weather-sunset": "sunset.fill",
  "weather-sunset-up": "sunrise.fill",
  "weather-tornado": "tornado",
  "weather-windy": "wind",
  "white-balance-sunny": "sun.max.fill",
  wifi: "wifi",
  "window-closed": "window.casement",
  "window-open": "window.casement.open",
  "window-shutter": "blinds.horizontal.closed",
  "window-shutter-open": "blinds.horizontal.open",
};

// When a tile's icon has no SF Symbol yet, fall back on the entity domain.
const DOMAIN_SYMBOLS = {
  light: "lightbulb.fill",
  switch: "powerplug.fill",
  fan: "fan.fill",
  lock: "lock.fill",
  cover: "blinds.horizontal.closed",
  climate: "thermometer.medium",
  media_player: "hifispeaker.fill",
  camera: "camera.fill",
  scene: "theatermasks.fill",
  script: "scroll.fill",
  automation: "gearshape.2.fill",
  button: "hand.tap.fill",
  sensor: "gauge.medium",
  binary_sensor: "sensor.fill",
  weather: "cloud.sun.fill",
  vacuum: "robotic.vacuum",
  alarm_control_panel: "shield.lefthalf.filled",
};

const FALLBACK_SYMBOL = "square.grid.2x2";

// Widget point sizes are not exposed to scripts, so estimate a tile size per
// family. Override with ?cell=<points> in the widget parameter if tiles clip.
const CELL_SIZE_BY_FAMILY = {
  small: 70,
  medium: 70,
  large: 80,
  extraLarge: 82,
};

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

function parseParameter(raw) {
  const text = String(raw || "").trim() || DEFAULT_BRIDGE_URL;
  const [base, query] = text.split("?");
  const options = {};
  for (const pair of (query || "").split("&")) {
    const [key, value] = pair.split("=");
    if (key) options[key] = decodeURIComponent(value || "");
  }
  return { baseUrl: base.replace(/\/+$/, ""), options };
}

async function loadPayload(baseUrl) {
  const request = new Request(`${baseUrl}/widget/tiles`);
  request.timeoutInterval = 10;
  return request.loadJSON();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Candidate SF Symbols for a tile, best first: the mapped icon, then the entity
 * domain's symbol, then a generic one. Symbol availability varies by iOS
 * version, so the caller walks the list until one resolves.
 */
function symbolsFor(tile) {
  const mdi = tile.icon && tile.icon.mdi;
  const domain = String(tile.entity || "").split(".")[0];
  return [SYMBOLS[mdi], DOMAIN_SYMBOLS[domain], FALLBACK_SYMBOL].filter(Boolean);
}

function addSymbol(stack, tile, color, size) {
  let image = null;
  for (const name of symbolsFor(tile)) {
    try {
      const symbol = SFSymbol.named(name);
      if (symbol && symbol.image) {
        image = symbol.image;
        break;
      }
    } catch {
      // Not available on this iOS version; try the next candidate.
    }
  }
  if (!image) return;
  const element = stack.addImage(image);
  element.imageSize = new Size(size, size);
  element.tintColor = color;
  element.resizable = true;
}

function addEmptyCell(row, width, height) {
  const cell = row.addStack();
  cell.size = new Size(width, height);
  cell.cornerRadius = THEME.radius;
  cell.backgroundColor = THEME.tileEmpty;
}

function addTile(row, tile, width, height, onColor) {
  const cell = row.addStack();
  cell.layoutVertically();
  cell.size = new Size(width, height);
  cell.cornerRadius = THEME.radius;
  cell.setPadding(6, 6, 6, 6);
  cell.backgroundColor = tile.active ? onColor : THEME.tile;
  if (tile.tap !== "none") cell.url = tile.tapUrl;

  const foreground = tile.active ? THEME.labelActive : THEME.label;
  const secondary = tile.active ? THEME.labelActive : THEME.muted;

  if (tile.badge) {
    const badgeRow = cell.addStack();
    badgeRow.layoutHorizontally();
    badgeRow.addSpacer();
    const badge = badgeRow.addText(tile.badge);
    badge.font = Font.mediumSystemFont(9);
    badge.textColor = secondary;
    badge.lineLimit = 1;
  } else {
    cell.addSpacer(2);
  }

  const iconRow = cell.addStack();
  iconRow.layoutHorizontally();
  iconRow.addSpacer();
  if (tile.face === "value" && tile.reading) {
    const reading = iconRow.addText(tile.reading);
    reading.font = Font.semiboldRoundedSystemFont(Math.round(height * 0.22));
    reading.textColor = tile.unsupported ? THEME.error : foreground;
    reading.lineLimit = 1;
    reading.minimumScaleFactor = 0.5;
  } else {
    addSymbol(iconRow, tile, foreground, Math.round(height * 0.3));
  }
  iconRow.addSpacer();

  cell.addSpacer();

  const label = cell.addText(tile.label || " ");
  label.font = Font.mediumSystemFont(10);
  label.textColor = foreground;
  label.lineLimit = 2;
  label.minimumScaleFactor = 0.7;
  label.centerAlignText();

  const detail = tile.detail || (tile.face === "text" ? tile.reading : null);
  if (detail) {
    const detailText = cell.addText(detail);
    detailText.font = Font.systemFont(9);
    detailText.textColor = tile.unsupported ? THEME.error : secondary;
    detailText.lineLimit = 1;
    detailText.centerAlignText();
  }
}

function addMessage(widget, title, detail) {
  const stack = widget.addStack();
  stack.layoutVertically();
  const heading = stack.addText(title);
  heading.font = Font.semiboldSystemFont(14);
  heading.textColor = THEME.error;
  if (detail) {
    const body = stack.addText(detail);
    body.font = Font.systemFont(11);
    body.textColor = THEME.muted;
    body.lineLimit = 3;
  }
}

/**
 * Index tiles by grid position, and mark the cells a wide card absorbs into its
 * own width so the row does not draw them again.
 *
 * Only horizontal spans are absorbed. A card that spans rows is drawn one row
 * tall in this first cut, and the cells underneath simply have no tile, so they
 * render as empty cells and the grid stays aligned.
 */
function indexTiles(payload) {
  const byPos = new Map();
  const absorbed = new Set();
  for (const tile of payload.tiles || []) {
    byPos.set(tile.pos, tile);
    for (let c = 1; c < (tile.colSpan || 1); c += 1) absorbed.add(tile.pos + c);
  }
  return { byPos, absorbed };
}

function buildWidget(payload, baseUrl, cellSize) {
  const widget = new ListWidget();
  widget.backgroundColor = THEME.background;
  widget.setPadding(THEME.padding, THEME.padding, THEME.padding, THEME.padding);
  widget.url = `${baseUrl}/`;

  const onColor = new Color(payload.onColor || "#FF8C00");
  const { byPos, absorbed } = indexTiles(payload);
  const { cols, rows } = payload.panel;

  for (let row = 0; row < rows; row += 1) {
    if (row > 0) widget.addSpacer(THEME.gap);
    const rowStack = widget.addStack();
    rowStack.layoutHorizontally();
    let firstInRow = true;
    for (let col = 0; col < cols; col += 1) {
      const pos = row * cols + col;
      // A wide card already drew this cell as part of its own width, gap
      // included, so it contributes nothing of its own here.
      if (absorbed.has(pos)) continue;
      if (!firstInRow) rowStack.addSpacer(THEME.gap);
      firstInRow = false;

      const tile = byPos.get(pos);
      if (!tile) {
        addEmptyCell(rowStack, cellSize, cellSize);
        continue;
      }
      const span = Math.max(1, tile.colSpan || 1);
      const width = cellSize * span + THEME.gap * (span - 1);
      addTile(rowStack, tile, width, cellSize, onColor);
    }
  }

  if (payload.homeAssistant && payload.homeAssistant.error) {
    widget.addSpacer(4);
    const note = widget.addText(`Home Assistant: ${payload.homeAssistant.error}`);
    note.font = Font.systemFont(9);
    note.textColor = THEME.error;
    note.lineLimit = 2;
  }

  return widget;
}

function errorWidget(baseUrl, message) {
  const widget = new ListWidget();
  widget.backgroundColor = THEME.background;
  widget.setPadding(16, 16, 16, 16);
  addMessage(widget, "Cannot reach the EspControl bridge", `${baseUrl}\n${message}`);
  return widget;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const { baseUrl, options } = parseParameter(args.widgetParameter);
  const family = config.widgetFamily || "large";
  const cellSize = Number(options.cell) || CELL_SIZE_BY_FAMILY[family] || 80;

  let widget;
  try {
    const payload = await loadPayload(baseUrl);
    for (const tile of payload.tiles || []) {
      tile.tapUrl = `${baseUrl}/widget/tap/${tile.slot}`;
    }
    widget = buildWidget(payload, baseUrl, cellSize);
  } catch (err) {
    widget = errorWidget(baseUrl, String(err && err.message ? err.message : err));
  }

  widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentLarge();
  }
  Script.complete();
}

await main();
