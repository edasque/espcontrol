"use strict";

// How each saved card type behaves on a widget.
//
// The firmware renders these card types with LVGL and full touch interaction.
// A home-screen widget is a static picture with tappable regions, so a card here
// declares two much simpler things: what its tap does, and what its face shows.
// Card types not listed fall back to "show the state, do nothing on tap", which
// is the honest behaviour for anything that needs a modal on a real panel.

/**
 * tap kinds:
 *   toggle   - homeassistant.toggle on the card entity
 *   action   - domain-appropriate "run this" service (scene, script, button, …)
 *   lock     - lock.lock / lock.unlock depending on current state
 *   cover    - cover.open_cover / cover.close_cover depending on current state
 *   media    - media_player.media_play_pause
 *   webhook  - POST the card's configured webhook id
 *   none     - read-only face
 *
 * face kinds:
 *   state    - on/off style face driven by the entity state
 *   value    - big reading driven by the sensor entity (or the card entity)
 *   text     - plain state text
 */
const CARD_BEHAVIOUR = {
  "": { tap: "toggle", face: "state" },
  action: { tap: "action", face: "state" },
  light_switch: { tap: "toggle", face: "state", detail: "brightness" },
  light_brightness: { tap: "toggle", face: "state", detail: "brightness" },
  light_temperature: { tap: "toggle", face: "state", detail: "brightness" },
  light_control: { tap: "toggle", face: "state", detail: "brightness" },
  slider: { tap: "toggle", face: "state", detail: "brightness" },
  fan_speed: { tap: "toggle", face: "state", detail: "percentage" },
  fan_switch: { tap: "toggle", face: "state", detail: "percentage" },
  fan_control: { tap: "toggle", face: "state", detail: "percentage" },
  fan_preset: { tap: "none", face: "state", detail: "preset_mode" },
  fan_direction: { tap: "none", face: "state", detail: "direction" },
  fan_oscillate: { tap: "toggle", face: "state" },
  lock: { tap: "lock", face: "state" },
  cover: { tap: "cover", face: "state", detail: "current_position" },
  garage: { tap: "cover", face: "state" },
  gate: { tap: "cover", face: "state" },
  media: { tap: "media", face: "state", detail: "media_title" },
  climate: { tap: "none", face: "state", detail: "current_temperature" },
  climate_control: { tap: "none", face: "state", detail: "current_temperature" },
  alarm: { tap: "none", face: "text" },
  alarm_action: { tap: "none", face: "text" },
  vacuum: { tap: "none", face: "text" },
  lawn_mower: { tap: "none", face: "text" },
  option_select: { tap: "none", face: "text" },
  sensor: { tap: "none", face: "value" },
  door_window: { tap: "none", face: "state" },
  presence: { tap: "none", face: "state" },
  weather: { tap: "none", face: "value", detail: "temperature" },
  webhook: { tap: "webhook", face: "state" },
  push: { tap: "none", face: "state" },
  solar: { tap: "none", face: "value" },
  clock: { tap: "none", face: "text" },
  calendar: { tap: "none", face: "value" },
  timezone: { tap: "none", face: "text" },
  ha_calendar: { tap: "none", face: "text" },
};

const DEFAULT_BEHAVIOUR = { tap: "none", face: "text" };

// Card types the widget cannot render at all, rather than render wrongly.
const UNSUPPORTED_TYPES = new Set(["image", "internal", "screen_lock", "local_sensor", "subpage"]);

const ACTIVE_STATES = new Set([
  "on",
  "open",
  "opening",
  "unlocked",
  "playing",
  "home",
  "cleaning",
  "mowing",
  "heat",
  "cool",
  "heat_cool",
  "auto",
  "dry",
  "fan_only",
  "armed_home",
  "armed_away",
  "armed_night",
  "armed_vacation",
  "triggered",
  "detected",
]);

function behaviourFor(type) {
  return CARD_BEHAVIOUR[type || ""] || DEFAULT_BEHAVIOUR;
}

function isUnsupported(type) {
  return UNSUPPORTED_TYPES.has(type || "");
}

function isActiveState(state) {
  return ACTIVE_STATES.has(String(state || "").toLowerCase());
}

module.exports = { behaviourFor, isUnsupported, isActiveState, CARD_BEHAVIOUR, UNSUPPORTED_TYPES };
