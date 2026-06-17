"""
Transform scraped YBS data into the Expo app's expected API schema.

The mobile app (services/ybsRouteApi.ts) expects:
  - numeric stop IDs
  - name_en / name_mm fields
  - /api/routes, /api/routes/{id}, /api/stops.json, /api/plan?from=&to=
"""

from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _stable_stop_id(name: str, lat: float | None = None, lng: float | None = None) -> int:
    key = f"{name}|{lat}|{lng}"
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()
    return int(digest[:7], 16) % 8_000_000 + 1


def _display_number(number: str, prefix: str | None) -> str:
    if prefix:
        return f"{prefix} {number}".strip()
    return number


def _route_name(route: dict[str, Any]) -> str:
    origin = route.get("origin") or ""
    destination = route.get("destination") or ""
    if origin and destination:
        return f"{origin} ↔ {destination}"
    return route.get("summary", "")


@lru_cache(maxsize=1)
def load_app_routes() -> list[dict[str, Any]]:
    routes_dir = DATA_DIR / "routes"
    app_routes: list[dict[str, Any]] = []

    for route_file in sorted(routes_dir.glob("*.json"), key=lambda p: int(p.stem)):
        route = json.loads(route_file.read_text(encoding="utf-8"))
        stops_out: list[dict[str, Any]] = []

        for stop in route.get("stops", []):
            location = stop.get("location") or {}
            lat = location.get("lat")
            lng = location.get("lng")
            stop_id = _stable_stop_id(stop["name"], lat, lng)
            stops_out.append(
                {
                    "sequence": stop["sequence"],
                    "stop_id": stop_id,
                    "name_en": stop["name"],
                    "name_mm": stop["name"],
                    "road_en": stop.get("road") or "",
                    "road_mm": stop.get("road") or "",
                    "township_en": stop.get("township") or "",
                    "township_mm": stop.get("township") or "",
                    "location": {
                        "lat": lat or 0.0,
                        "lng": lng or 0.0,
                    },
                }
            )

        app_routes.append(
            {
                "id": route["id"],
                "route_number": route["number"],
                "display_number": _display_number(route["number"], route.get("prefix")),
                "name": _route_name(route),
                "color": route.get("color") or "#2563eb",
                "operator": route.get("prefix"),
                "description": route.get("summary") or "",
                "stop_count": len(stops_out),
                "stops": stops_out,
            }
        )

    return app_routes


@lru_cache(maxsize=1)
def load_app_stops() -> list[dict[str, Any]]:
    stops_index = json.loads((DATA_DIR / "stops.json").read_text(encoding="utf-8"))
    app_stops: list[dict[str, Any]] = []

    for stop in stops_index["stops"]:
        location = stop.get("location") or {}
        lat = location.get("lat")
        lng = location.get("lng")
        stop_id = _stable_stop_id(stop["name"], lat, lng)
        routes = sorted(
            {
                route["route_number"]
                for route in stop.get("routes", [])
            }
        )
        app_stops.append(
            {
                "id": stop_id,
                "name_en": stop["name"],
                "name_mm": stop["name"],
                "road_en": stop.get("road") or "",
                "road_mm": stop.get("road") or "",
                "township_en": stop.get("township") or "",
                "township_mm": stop.get("township") or "",
                "location": {"lat": lat or 0.0, "lng": lng or 0.0},
                "routes": routes,
            }
        )

    return sorted(app_stops, key=lambda item: item["name_mm"])


def stop_id_to_name() -> dict[int, str]:
    return {stop["id"]: stop["name_mm"] for stop in load_app_stops()}


def get_route_by_number(route_number: str) -> dict[str, Any] | None:
    for route in load_app_routes():
        if route["route_number"] == route_number or route["id"] == route_number:
            return route
    return None


def _find_stop_id_by_name(name: str) -> int:
    for stop in load_app_stops():
        if stop["name_mm"] == name or stop["name_en"] == name:
            return stop["id"]
    return _stable_stop_id(name)


def plan_by_stop_ids(from_id: int, to_id: int, max_transfers: int = 2) -> dict[str, Any]:
    from api.routing import find_routes

    id_to_name = stop_id_to_name()
    from_name = id_to_name.get(from_id)
    to_name = id_to_name.get(to_id)

    if not from_name:
        raise ValueError(f"Unknown from stop id: {from_id}")
    if not to_name:
        raise ValueError(f"Unknown to stop id: {to_id}")

    raw_plans = find_routes(from_name, to_name, max_transfers=max_transfers)
    routes_by_id = {route["id"]: route for route in load_app_routes()}
    legs_out: list[dict[str, Any]] = []

    if not raw_plans:
        return {"from": from_id, "to": to_id, "plans": []}

    plan = raw_plans[0]
    for segment in plan["segments"]:
        route = routes_by_id.get(segment["route_id"], {})
        from_stop_id = _find_stop_id_by_name(segment["from_stop"])
        to_stop_id = _find_stop_id_by_name(segment["to_stop"])
        legs_out.append(
            {
                "route_number": segment["route_number"],
                "display_number": _display_number(
                    segment["route_number"], segment.get("prefix")
                ),
                "route_name": route.get("name") or segment["from_stop"],
                "color": route.get("color") or "#2563eb",
                "from_stop_id": from_stop_id,
                "to_stop_id": to_stop_id,
                "stop_count": segment["stop_count"],
            }
        )

    return {
        "from": from_id,
        "to": to_id,
        "plans": [
            {
                "legs": legs_out,
                "transfer_count": plan["transfer_count"],
                "total_stops": plan["total_stops"],
            }
        ],
    }
