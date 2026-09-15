# Scriptable iPad Widget (prototype)

A virtual EspControl panel. Instead of flashing an ESP32 touchscreen, you run a
small server on a machine at home and put a [Scriptable](https://scriptable.app)
widget on an iPad home screen. The widget draws the tiles; tapping one controls
Home Assistant.

The point of the prototype is that **nothing about configuring it is new**. The
setup page is the same one a physical panel serves — same tile grid, same card
types, same icons, same settings — it is just served by a local server rather
than by a screen on the wall.

> Status: prototype. It starts with a single 4x4 panel, and a first pass at the
> card types that make sense on a home-screen widget. See
> [What is not there yet](#what-is-not-there-yet).

## How the pieces fit together

```
  iPad home screen                  your computer / server                Home Assistant
┌───────────────────┐        ┌──────────────────────────────┐        ┌──────────────────┐
│ Scriptable widget │──GET──▶│  bridge (node)               │──REST─▶│  /api/states     │
│  4x4 tile grid    │◀─JSON──│   · serves the setup page    │◀───────│  /api/services   │
│                   │        │   · stores the panel config  │        └──────────────────┘
│  tap a tile ──────┼──GET──▶│   · proxies Home Assistant   │
└───────────────────┘        └──────────────────────────────┘
                                          ▲
                                   browser│ setup page
                                          │ (the normal EspControl UI)
```

The bridge holds the Home Assistant token, so it never has to be typed into a
script on the iPad. The widget only ever talks to the bridge.

## Run it

You need Node 20+ and Python 3 (the same prerequisites as the rest of the repo),
plus `npm ci` for esbuild.

```bash
npm ci
npm run scriptable:build          # builds the setup page bundle for the 4x4 panel

node scriptable/server/bridge.js \
  --ha-url http://homeassistant.local:8123 \
  --ha-token <long-lived access token>
```

Create the token in Home Assistant under your profile → Security → Long-lived
access tokens. `HA_URL` and `HA_TOKEN` environment variables work instead of the
flags.

The bridge prints the addresses it is reachable on:

```
EspControl Scriptable bridge for Scriptable iPad Widget
  config   /path/to/espcontrol/scriptable/panels/default.json
  home assistant http://homeassistant.local:8123
  setup page  http://192.168.1.20:8099/
  widget feed http://192.168.1.20:8099/widget/tiles
```

### Configure the panel

Open the setup page address in a browser. It is the normal EspControl setup
page: click an empty cell to add a card, pick a card type, set the entity, label
and icon, drag cards around, change the active colour. Everything is saved to
the bridge as you go, into `scriptable/panels/default.json`.

### Put the widget on the iPad

1. Install Scriptable from the App Store.
2. Copy `scriptable/widget/espcontrol-widget.js` into Scriptable — either drop it
   into the Scriptable folder in the Files app, or create a new script called
   `EspControl` and paste the contents in.
3. Long-press the home screen → add a Scriptable widget (large or extra large).
4. Edit the widget: choose the `EspControl` script and set **Parameter** to the
   bridge URL, for example `http://192.168.1.20:8099`.

Running the script inside the Scriptable app previews the same grid, which is
the quickest way to check the connection.

If tiles clip or leave a wide margin, tune the tile size in the parameter:
`http://192.168.1.20:8099?cell=76`. Widget point sizes are not exposed to
scripts, so the widget estimates them per widget family.

## Changing the layout

`scriptable/panel.json` describes the virtual panel the same way
`devices/manifest.json` describes a physical one: the tile grid, the preview
sizing, and the card types to hide. To try a different grid, change `layout` and
`slots` (they must agree — `slots` = `cols` x `rows`) and rebuild:

```bash
npm run scriptable:build
```

## What the bridge serves

| Path | Purpose |
|---|---|
| `/` | The EspControl setup page. |
| `/www.js` | The setup page bundle built for this panel. |
| `/<domain>/<entity>` | Entity state, in the shape ESPHome's web server returns. |
| `/<domain>/<entity>/<action>` | Entity writes (`set`, `turn_on`, `turn_off`, `press`). |
| `/widget/tiles` | The tile list the widget draws. |
| `/widget/tap/<slot>` | Performs a tile's action. Opened by the widget on tap. |
| `/widget/health` | Bridge and Home Assistant status. |

The entity paths exist because that is the API the setup page speaks: on a real
panel it reads and writes ESPHome entities such as `Button 1 Config` and
`Button On Color`. The bridge emulates just that surface, which is why the
configurator bundle works against it unmodified.

A card's saved configuration is parsed with the repo's own model
(`src/webserver/model/*.ts`, bundled into
`src/webserver/modules/model_generated.js`), so the bridge, the setup page and
the firmware all read the compact saved format the same way.

## What tapping a tile does

An iOS widget cannot run code when you tap it; it can only open a URL. Each tile
opens `/widget/tap/<slot>` on the bridge, which performs the action and returns a
small page that closes itself. Actions by card type:

| Card | Tap |
|---|---|
| Switch, Lights, Fans, Slider | `homeassistant.toggle` |
| Action | `scene.turn_on`, `script.turn_on`, `automation.trigger`, `button.press`, … |
| Lock | `lock.lock` / `lock.unlock`, depending on the current state |
| Cover, Garage Door, Gate | `cover.open_cover` / `cover.close_cover` |
| Media | `media_player.media_play_pause` |
| Webhook | The card's own HTTP request |
| Sensor, Presence, Doors & Windows, Weather, Climate, Alarm, Vacuum, … | read-only |

Read-only here means "shows state, does not act on tap". On a real panel most of
those open a modal with controls, which a widget has no way to do.

## What is not there yet

- **Subpages.** A widget has no navigation, so subpage cards are hidden.
- **Panel-only cards.** Camera, Internal Switches, Screen Lock and Local Sensor
  need panel hardware, so they are hidden too. A saved config that already has
  one renders as a "Not on widget" tile rather than something misleading.
- **Tall cards.** Wide (2x1) cards render at full width; cards that span rows
  render one row tall and leave the rest of their footprint empty.
- **Icons.** Tiles use SF Symbols mapped from the panel's Material Design Icon
  names, so an icon can differ from the one the setup page previews. The bridge
  already sends the MDI name and codepoint, so a later pass can render the real
  glyph.
- **One panel per bridge.** Run a second bridge on another port with its own
  `--config` file for a second panel.
- **Refresh rate.** iOS decides when a widget reloads; the widget asks for about
  five minutes. Tiles are a recent snapshot, not live state.
- **No authentication.** The bridge is unauthenticated and assumes a trusted home
  network. Do not expose it to the internet.

## Checks

```bash
npm run check:scriptable           # bridge, widget payload, tile taps, icon mapping
npm run check:scriptable-browser   # drives the real setup page against the bridge
```

`check:scriptable-browser` needs Playwright's Chromium (`npx playwright install
chromium`). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if it lives somewhere unusual.

## Files

| Path | What it is |
|---|---|
| `panel.json` | The virtual panel profile: grid, preview sizing, hidden card types. |
| `server/bridge.js` | The server: routing, CLI, startup. |
| `server/lib/entities.js` | The emulated ESPHome entity surface the setup page talks to. |
| `server/lib/store.js` | Panel config persistence. |
| `server/lib/ha.js` | Home Assistant REST client and state cache. |
| `server/lib/cards.js` | What each card type does on a widget. |
| `server/lib/tiles.js` | Saved config + live state → the widget's tile list. |
| `server/lib/actions.js` | What a tile tap asks Home Assistant to do. |
| `server/lib/icons.js` | Saved icon name → Material Design Icon slug. |
| `widget/espcontrol-widget.js` | The Scriptable script that draws the grid. |
| `test/` | The checks above. |

The setup page bundle is generated by `scripts/build_scriptable_bundle.py` from
the same `src/webserver/` sources as every device bundle.
