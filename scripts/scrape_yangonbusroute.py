#!/usr/bin/env python3
"""Scrape YBS bus route data from yangonbusroute.com."""

from __future__ import annotations

import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://yangonbusroute.com"
HEADERS = {
    "User-Agent": "ybsbusroute-data-collector/1.0 (+https://github.com/UNHIT88/ybsbusroute)",
    "Accept-Language": "my,en;q=0.9",
}
REQUEST_DELAY = 0.35
MAX_WORKERS = 4


def fetch_html(url: str, session: requests.Session) -> str:
    response = session.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.text


def parse_homepage_routes(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    routes: list[dict[str, Any]] = []

    for card in soup.select("div.rounded-xl.my-4"):
        link = card.select_one('a[href*="/ybs-route/"]')
        if not link:
            continue

        href = link.get("href", "")
        match = re.search(r"/ybs-route/(\d+)", href)
        if not match:
            continue

        route_id = match.group(1)
        number_el = card.select_one("span.text-xs.md\\:text-2xl")
        prefix_el = card.select_one("span.bg-yellow-400")
        color_el = card.select_one("div[style*='background-color']")
        summary_el = card.select_one("p.text-gray-700")

        number = number_el.get_text(strip=True) if number_el else route_id
        prefix = prefix_el.get_text(strip=True) if prefix_el else None
        color = None
        if color_el and color_el.get("style"):
            color_match = re.search(r"background-color:\s*([^;]+)", color_el["style"])
            if color_match:
                color = color_match.group(1).strip()

        summary = summary_el.get_text(" ", strip=True) if summary_el else ""
        major_stops = [s.strip() for s in re.split(r"\s*-\s*", summary) if s.strip()]

        routes.append(
            {
                "id": route_id,
                "number": number,
                "prefix": prefix,
                "color": color,
                "url": f"{BASE_URL}/ybs-route/{route_id}",
                "summary": summary,
                "major_stops": major_stops,
                "origin": major_stops[0] if major_stops else None,
                "destination": major_stops[-1] if major_stops else None,
            }
        )

    return routes


def parse_route_stops(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    stops: list[dict[str, Any]] = []

    for item in soup.select("ul.divide-y > li"):
        number_el = item.select_one("div.rounded-full")
        name_el = item.select_one("p.text-gray-800")
        marker_el = item.select_one("span.text-xs")

        if not number_el or not name_el:
            continue

        sequence_text = number_el.get_text(strip=True)
        if not sequence_text.isdigit():
            continue

        stop_type = None
        if marker_el:
            marker = marker_el.get_text(strip=True)
            if "Start" in marker:
                stop_type = "start"
            elif "Final" in marker:
                stop_type = "end"

        stops.append(
            {
                "sequence": int(sequence_text),
                "name": name_el.get_text(strip=True),
                "type": stop_type,
            }
        )

    return stops


def scrape_route_detail(route: dict[str, Any], session: requests.Session) -> dict[str, Any]:
    html = fetch_html(route["url"], session)
    stops = parse_route_stops(html)
    enriched = dict(route)
    enriched["stops"] = stops
    enriched["stop_count"] = len(stops)
    return enriched


def build_stops_index(routes: list[dict[str, Any]]) -> dict[str, Any]:
    by_name: dict[str, dict[str, Any]] = {}

    for route in routes:
        for stop in route.get("stops", []):
            name = stop["name"]
            entry = by_name.setdefault(
                name,
                {
                    "name": name,
                    "routes": [],
                },
            )
            entry["routes"].append(
                {
                    "route_id": route["id"],
                    "route_number": route["number"],
                    "prefix": route.get("prefix"),
                    "sequence": stop["sequence"],
                }
            )

    return {
        "count": len(by_name),
        "stops": sorted(by_name.values(), key=lambda item: item["name"]),
    }


def scrape_all(output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    routes_dir = output_dir / "routes"
    routes_dir.mkdir(exist_ok=True)

    session = requests.Session()

    print("Fetching homepage...")
    homepage_html = fetch_html(f"{BASE_URL}/", session)
    homepage_routes = parse_homepage_routes(homepage_html)
    print(f"Found {len(homepage_routes)} routes on homepage")

    detailed_routes: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(scrape_route_detail, route, session): route["id"]
            for route in homepage_routes
        }

        for index, future in enumerate(as_completed(futures), start=1):
            route_id = futures[future]
            try:
                route_data = future.result()
                detailed_routes.append(route_data)
                route_file = routes_dir / f"{route_id}.json"
                route_file.write_text(
                    json.dumps(route_data, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                print(f"[{index}/{len(homepage_routes)}] Scraped route {route_id} ({route_data['stop_count']} stops)")
            except Exception as exc:  # noqa: BLE001
                errors.append({"route_id": route_id, "error": str(exc)})
                print(f"[{index}/{len(homepage_routes)}] Failed route {route_id}: {exc}", file=sys.stderr)

            time.sleep(REQUEST_DELAY / MAX_WORKERS)

    detailed_routes.sort(key=lambda item: int(item["id"]))

    metadata = {
        "source": BASE_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "route_count": len(detailed_routes),
        "error_count": len(errors),
        "license_note": (
            "Data sourced from publicly available records via yangonbusroute.com. "
            "See https://yangonbusroute.com/about for their data transparency disclaimer."
        ),
    }

    routes_index = {
        "metadata": metadata,
        "routes": [
            {
                key: route[key]
                for key in (
                    "id",
                    "number",
                    "prefix",
                    "color",
                    "url",
                    "summary",
                    "major_stops",
                    "origin",
                    "destination",
                    "stop_count",
                )
            }
            for route in detailed_routes
        ],
    }

    stops_index = build_stops_index(detailed_routes)
    stops_index["metadata"] = metadata

    (output_dir / "routes.json").write_text(
        json.dumps(routes_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "stops.json").write_text(
        json.dumps(stops_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if errors:
        (output_dir / "errors.json").write_text(
            json.dumps({"metadata": metadata, "errors": errors}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return {
        "metadata": metadata,
        "routes": len(detailed_routes),
        "stops": stops_index["count"],
        "errors": len(errors),
    }


def main() -> None:
    output_dir = Path(__file__).resolve().parents[1] / "data"
    summary = scrape_all(output_dir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
