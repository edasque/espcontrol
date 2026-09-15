#!/usr/bin/env python3
"""Build the web configurator bundle for the virtual Scriptable widget panel.

The Scriptable prototype reuses the exact same setup page that runs on a
physical panel. Instead of a device slug from ``devices/manifest.json`` the
layout comes from ``scriptable/panel.json``, so the panel can use a tile grid
(4x4 by default) that no physical screen ships with.

Usage:
    python3 scripts/build_scriptable_bundle.py           # build the bundle
    python3 scripts/build_scriptable_bundle.py --check   # exit 1 if stale
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build import (  # noqa: E402  (path setup must happen first)
    BuildError,
    WWW_SOURCE,
    load_timezone_options,
    minify_js,
    replace_config,
    replace_modules,
    replace_types,
)

ROOT = Path(__file__).resolve().parent.parent
PANEL_JSON = ROOT / "scriptable" / "panel.json"
BUNDLE_OUTPUT = ROOT / "scriptable" / "server" / "public" / "www.js"


def load_panel() -> dict:
    if not PANEL_JSON.exists():
        raise BuildError(f"Missing panel profile: {PANEL_JSON.relative_to(ROOT)}")
    return json.loads(PANEL_JSON.read_text())


def panel_web_config(panel: dict) -> dict:
    """Mirror device_profiles.web_config() for a panel with no firmware."""
    layout = panel["layout"]
    cfg: dict = {
        "slots": panel["slots"],
        "cols": layout["cols"],
        "rows": layout["rows"],
        "screenSize": panel["public"]["screenSize"],
        "largeSensorUnitOffsetPercent": panel["settings"]["largeSensorUnitOffsetPercent"],
        "imageCardLimit": panel.get("imageCardLimit", 0),
    }
    features = panel.get("features") or {}
    for key, value in panel["web"].items():
        cfg[key] = copy.deepcopy(value)
        if key == "dragAnimation" and features:
            cfg["features"] = copy.deepcopy(features)
    if cfg["imageCardLimit"] == 0:
        disabled = list(cfg.get("disabledCardTypes") or [])
        if "image" not in disabled:
            disabled.append("image")
        cfg["disabledCardTypes"] = disabled
    if features and "features" not in cfg:
        cfg["features"] = copy.deepcopy(features)
    cfg["timezoneOptions"] = load_timezone_options()
    return cfg


def validate_panel(panel: dict) -> None:
    layout = panel["layout"]
    cells = layout["cols"] * layout["rows"]
    if panel["slots"] != cells:
        raise BuildError(
            f"panel.json: slots ({panel['slots']}) must equal cols x rows ({cells})"
        )


def build_bundle() -> str:
    panel = load_panel()
    validate_panel(panel)
    source_text = WWW_SOURCE.read_text()
    source_text = replace_types(source_text)
    source_text = replace_modules(source_text)
    return minify_js(replace_config(source_text, panel["id"], panel_web_config(panel)))


def main() -> int:
    check_only = "--check" in sys.argv[1:]
    try:
        generated = build_bundle()
    except BuildError as exc:
        print(exc)
        return 1

    rel = BUNDLE_OUTPUT.relative_to(ROOT)
    if BUNDLE_OUTPUT.exists() and BUNDLE_OUTPUT.read_text() == generated:
        print(f"{rel} is up to date.")
        return 0

    if check_only:
        print(f"{rel} is out of date. Run 'npm run scriptable:build' to fix.")
        return 1

    BUNDLE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE_OUTPUT.write_text(generated)
    print(f"  updated {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
