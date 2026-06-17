#!/usr/bin/env python3
"""Enrich scraped stop names with GPS coordinates from YRTA open data."""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

YRTA_SOURCES = {
    "bus-stop-data-by-id": (
        "https://raw.githubusercontent.com/eimg/ybs-data-json/master/bus-stop-data-by-id.js"
    ),
    "lines-of-bus-stops": (
        "https://raw.githubusercontent.com/eimg/ybs-data-json/master/lines-of-bus-stops.js"
    ),
}

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


def download_json_payload(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def build_name_index(yrta_stops: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for stop_id, stop in yrta_stops.items():
        names = {normalize_name(stop.get("name", ""))}
        names.update(normalize_name(alias) for alias in stop.get("alias", []))
        names.update(normalize_name(stop.get("label", "")))
        names.discard("")

        entry = {
            "yrta_id": stop_id,
            "name": stop.get("name"),
            "label": stop.get("label"),
            "road": stop.get("road"),
            "township": stop.get("township"),
            "location": {
                "lng": stop["geo"][0],
                "lat": stop["geo"][1],
            },
        }

        for name in names:
            index[name].append(entry)

    return dict(index)


def pick_best_match(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    if len(candidates) == 1:
        return candidates[0]
    return min(candidates, key=lambda item: item["yrta_id"])


def enrich_stop_name(name: str, name_index: dict[str, list[dict[str, Any]]]) -> dict[str, Any] | None:
    normalized = normalize_name(name)
    candidates = name_index.get(normalized)
    if not candidates:
        return None
    match = pick_best_match(candidates)
    return {
        "yrta_id": match["yrta_id"],
        "location": match["location"],
        "road": match.get("road"),
        "township": match.get("township"),
        "match_type": "exact",
    }


def enrich_routes(name_index: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    routes_dir = DATA_DIR / "routes"
    matched = 0
    unmatched = 0
    route_files = sorted(routes_dir.glob("*.json"), key=lambda path: int(path.stem))

    for route_file in route_files:
        route = json.loads(route_file.read_text(encoding="utf-8"))
        for stop in route.get("stops", []):
            enrichment = enrich_stop_name(stop["name"], name_index)
            if enrichment:
                stop.update(enrichment)
                matched += 1
            else:
                unmatched += 1
        route_file.write_text(json.dumps(route, ensure_ascii=False, indent=2), encoding="utf-8")

    stops_index = json.loads((DATA_DIR / "stops.json").read_text(encoding="utf-8"))
    stop_matches = 0
    stop_misses = 0

    for stop in stops_index["stops"]:
        enrichment = enrich_stop_name(stop["name"], name_index)
        if enrichment:
            stop.update(enrichment)
            stop_matches += 1
        else:
            stop_misses += 1

    stops_index["metadata"]["coordinates_source"] = "YRTA open data via eimg/ybs-data-json"
    stops_index["metadata"]["coordinates_enriched_at"] = datetime.now(timezone.utc).isoformat()
    stops_index["metadata"]["coordinate_match_count"] = stop_matches
    stops_index["metadata"]["coordinate_miss_count"] = stop_misses
    (DATA_DIR / "stops.json").write_text(
        json.dumps(stops_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    routes_index = json.loads((DATA_DIR / "routes.json").read_text(encoding="utf-8"))
    routes_index["metadata"]["coordinates_source"] = "YRTA open data via eimg/ybs-data-json"
    routes_index["metadata"]["coordinates_enriched_at"] = datetime.now(timezone.utc).isoformat()
    (DATA_DIR / "routes.json").write_text(
        json.dumps(routes_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    yrta_catalog = {
        "metadata": {
            "source": "https://github.com/eimg/ybs-data-json",
            "license": "YRTA Open Data License 1.0",
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "stop_count": len(name_index),
        },
        "stops_by_name": {
            name: candidates for name, candidates in sorted(name_index.items())
        },
    }
    (DATA_DIR / "yrta-stops-index.json").write_text(
        json.dumps(yrta_catalog, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "route_stop_matches": matched,
        "route_stop_misses": unmatched,
        "unique_stop_matches": stop_matches,
        "unique_stop_misses": stop_misses,
        "match_rate": round(stop_matches / max(stop_matches + stop_misses, 1) * 100, 1),
    }


def main() -> None:
    print("Downloading YRTA stop data...")
    yrta_stops = download_json_payload(YRTA_SOURCES["bus-stop-data-by-id"])
    print(f"Loaded {len(yrta_stops)} YRTA stops")

    name_index = build_name_index(yrta_stops)
    summary = enrich_routes(name_index)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
