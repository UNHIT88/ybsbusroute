"""YBS Bus Route API - serves scraped Yangon bus route data."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.routing import find_routes

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

app = FastAPI(
    title="YBS Bus Route API",
    description=(
        "Open API for Yangon Bus Service (YBS) routes and stops. "
        "Data collected from https://yangonbusroute.com/."
    ),
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def load_routes_index() -> dict[str, Any]:
    return json.loads((DATA_DIR / "routes.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_stops_index() -> dict[str, Any]:
    return json.loads((DATA_DIR / "stops.json").read_text(encoding="utf-8"))


def load_route_detail(route_id: str) -> dict[str, Any]:
    route_file = DATA_DIR / "routes" / f"{route_id}.json"
    if not route_file.exists():
        raise HTTPException(status_code=404, detail=f"Route {route_id} not found")
    return json.loads(route_file.read_text(encoding="utf-8"))


@app.get("/")
def root() -> dict[str, Any]:
    index = load_routes_index()
    return {
        "name": "YBS Bus Route API",
        "version": "1.1.0",
        "source": index["metadata"]["source"],
        "scraped_at": index["metadata"]["scraped_at"],
        "route_count": index["metadata"]["route_count"],
        "endpoints": {
            "routes": "/api/routes",
            "route_detail": "/api/routes/{route_id}",
            "stops": "/api/stops",
            "search": "/api/search?q={query}",
            "plan": "/api/plan?from={start}&to={end}",
            "health": "/health",
        },
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/routes")
def list_routes(
    prefix: str | None = Query(default=None, description="Filter by route prefix (e.g. YPS, TU)"),
    number: str | None = Query(default=None, description="Filter by route number"),
) -> dict[str, Any]:
    index = load_routes_index()
    routes = index["routes"]

    if prefix:
        routes = [route for route in routes if route.get("prefix") == prefix]
    if number:
        routes = [route for route in routes if route["number"] == number]

    return {
        "metadata": index["metadata"],
        "count": len(routes),
        "routes": routes,
    }


@app.get("/api/routes/{route_id}")
def get_route(route_id: str) -> dict[str, Any]:
    return load_route_detail(route_id)


@app.get("/api/stops")
def list_stops(
    q: str | None = Query(default=None, description="Search stop names (Myanmar or partial match)"),
    route_id: str | None = Query(default=None, description="Filter stops served by a route"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    index = load_stops_index()
    stops = index["stops"]

    if route_id:
        stops = [
            stop
            for stop in stops
            if any(route["route_id"] == route_id for route in stop["routes"])
        ]

    if q:
        query = q.strip().lower()
        stops = [stop for stop in stops if query in stop["name"].lower()]

    page = stops[offset : offset + limit]
    return {
        "metadata": index["metadata"],
        "count": len(stops),
        "offset": offset,
        "limit": limit,
        "stops": page,
    }


@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1, description="Search routes and stops by name"),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    query = q.strip().lower()
    routes_index = load_routes_index()
    stops_index = load_stops_index()

    matched_routes = [
        route
        for route in routes_index["routes"]
        if query in route["number"].lower()
        or query in (route.get("summary") or "").lower()
        or any(query in stop.lower() for stop in route.get("major_stops", []))
    ][:limit]

    matched_stops = [
        stop for stop in stops_index["stops"] if query in stop["name"].lower()
    ][:limit]

    return {
        "query": q,
        "routes": matched_routes,
        "stops": matched_stops,
    }


@app.get("/api/plan")
def plan_route(
    from_stop: str = Query(..., alias="from", min_length=1, description="Start stop name"),
    to_stop: str = Query(..., alias="to", min_length=1, description="Destination stop name"),
    max_transfers: int = Query(default=2, ge=0, le=4, description="Maximum bus transfers"),
) -> dict[str, Any]:
    try:
        plans = find_routes(from_stop, to_stop, max_transfers=max_transfers)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not plans:
        raise HTTPException(
            status_code=404,
            detail=f"No route found from '{from_stop}' to '{to_stop}' with up to {max_transfers} transfers",
        )

    return {
        "from": from_stop,
        "to": to_stop,
        "max_transfers": max_transfers,
        "plans": plans,
    }
