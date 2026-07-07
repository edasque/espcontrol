#pragma once

// Shared UI colour tokens for device-side LVGL rendering.
// Primary is user configurable; secondary and tertiary are fixed defaults.

constexpr uint32_t DEFAULT_PRIMARY_COLOR_RAW = 0xFF8C00;
constexpr uint32_t DEFAULT_SECONDARY_COLOR_RAW = 0x313131;
constexpr uint32_t DEFAULT_TERTIARY_COLOR_RAW = 0x212121;

constexpr uint32_t DEFAULT_SLIDER_COLOR = correct_display_color(DEFAULT_PRIMARY_COLOR_RAW);
constexpr uint32_t DEFAULT_OFF_COLOR = correct_display_color(DEFAULT_SECONDARY_COLOR_RAW);
constexpr uint32_t DEFAULT_TERTIARY_COLOR = correct_display_color(DEFAULT_TERTIARY_COLOR_RAW);

constexpr uint32_t SECONDARY_GREY = DEFAULT_OFF_COLOR;
constexpr uint32_t TERTIARY_GREY = DEFAULT_TERTIARY_COLOR;
constexpr uint32_t DARK_TEXT_PRIMARY = 0xFFFFFF;
constexpr uint32_t DARK_TEXT_INVERTED = 0x000000;
constexpr uint32_t DARK_TEXT_MUTED = 0xB0B0B0;
constexpr uint32_t DARK_TEXT_SOFT = DARK_TEXT_PRIMARY;
constexpr uint32_t DARK_BORDER = SECONDARY_GREY;
constexpr uint32_t DARK_CONTROL_NEUTRAL = SECONDARY_GREY;
constexpr uint32_t DARK_OVERLAY = 0x000000;
constexpr uint32_t DARK_TRACK_BACKGROUND = SECONDARY_GREY;

constexpr uint32_t readable_text_color_for_bg(uint32_t bg_color) {
  uint32_t red = (bg_color >> 16) & 0xFF;
  uint32_t green = (bg_color >> 8) & 0xFF;
  uint32_t blue = bg_color & 0xFF;
  uint32_t brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 186 ? TERTIARY_GREY : DARK_TEXT_PRIMARY;
}

static_assert(readable_text_color_for_bg(0xFFFFFF) == TERTIARY_GREY,
              "light backgrounds need dark text");
static_assert(readable_text_color_for_bg(0x000000) == DARK_TEXT_PRIMARY,
              "dark backgrounds need light text");

inline uint32_t &current_button_primary_color_ref() {
  static uint32_t color = DEFAULT_SLIDER_COLOR;
  return color;
}

inline void set_current_button_primary_color(uint32_t color) {
  current_button_primary_color_ref() = color;
}

inline uint32_t current_button_primary_color() {
  return current_button_primary_color_ref();
}

// Derive a lighter shade of an RGB color by moving each channel toward white by
// `percent`. Used to compute an accent tint from the user's chosen primary
// color at runtime, so the accent tracks whatever primary is configured instead
// of being a hardcoded literal.
inline uint32_t lighten_color(uint32_t rgb, int percent) {
  if (percent <= 0) return rgb;
  if (percent > 100) percent = 100;
  int r = (rgb >> 16) & 0xFF;
  int g = (rgb >> 8) & 0xFF;
  int b = rgb & 0xFF;
  r += (255 - r) * percent / 100;
  g += (255 - g) * percent / 100;
  b += (255 - b) * percent / 100;
  return (static_cast<uint32_t>(r) << 16) | (static_cast<uint32_t>(g) << 8) |
         static_cast<uint32_t>(b);
}

// Darken an RGB color by reducing each channel toward black by `percent`
// (e.g. a darkened-primary fill behind primary-colored text).
inline uint32_t darken_color(uint32_t rgb, int percent) {
  if (percent <= 0) return rgb;
  if (percent > 100) percent = 100;
  int r = (rgb >> 16) & 0xFF;
  int g = (rgb >> 8) & 0xFF;
  int b = rgb & 0xFF;
  r -= r * percent / 100;
  g -= g * percent / 100;
  b -= b * percent / 100;
  return (static_cast<uint32_t>(r) << 16) | (static_cast<uint32_t>(g) << 8) |
         static_cast<uint32_t>(b);
}

// Mix `percent` of `over` into `base` (e.g. a faint accent tint over a surface).
inline uint32_t blend_color(uint32_t base, uint32_t over, int percent) {
  if (percent <= 0) return base;
  if (percent > 100) percent = 100;
  int br = (base >> 16) & 0xFF, bg = (base >> 8) & 0xFF, bb = base & 0xFF;
  int orr = (over >> 16) & 0xFF, og = (over >> 8) & 0xFF, ob = over & 0xFF;
  int r = br + (orr - br) * percent / 100;
  int g = bg + (og - bg) * percent / 100;
  int b = bb + (ob - bb) * percent / 100;
  return (static_cast<uint32_t>(r) << 16) | (static_cast<uint32_t>(g) << 8) |
         static_cast<uint32_t>(b);
}
