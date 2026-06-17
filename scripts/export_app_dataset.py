#!/usr/bin/env python3
"""Export app-compatible JSON files for Expo bundle and GitHub static hosting."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from api.app_adapter import load_app_routes, load_app_stops

ROOT = Path(__file__).resolve().parents[1]
ASSETS_DATA = ROOT / "assets" / "data"
API_DATA = ROOT / "data"


def main() -> None:
    routes = load_app_routes()
    stops = load_app_stops()

    metadata = {
        "source": "yangonbusroute.com + YRTA open data",
        "city": "Yangon",
        "country": "Myanmar",
        "agency": "Yangon Bus Service (YBS)",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_routes": len(routes),
        "total_stops": len(stops),
        "unique_bus_numbers": len({route["route_number"] for route in routes}),
    }

    for target_dir in (ASSETS_DATA, API_DATA):
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "bus_routes_list.json").write_text(
            json.dumps(routes, ensure_ascii=False),
            encoding="utf-8",
        )
        (target_dir / "bus_stops_list.json").write_text(
            json.dumps(stops, ensure_ascii=False),
            encoding="utf-8",
        )
        (target_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(f"Exported {len(routes)} routes and {len(stops)} stops")
    print(f"  -> {ASSETS_DATA}")
    print(f"  -> {API_DATA}")


if __name__ == "__main__":
    main()
