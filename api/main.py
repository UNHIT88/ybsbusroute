"""YBS Bus Route API — compatible with the Expo mobile app (services/ybsRouteApi.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.app_adapter import (
    get_route_by_number,
    load_app_routes,
    load_app_stops,
    plan_by_stop_ids,
)
from api.routing import find_routes

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

app = FastAPI(
    title="YBS Bus Route API",
    description=(
        "Open API for Yangon Bus Service (YBS) routes and stops. "
        "Compatible with the ybsbusroute Expo mobile app."
    ),
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    routes = load_app_routes()
    return {
        "name": "YBS Bus Route API",
        "version": "1.2.0",
        "route_count": len(routes),
        "stop_count": len(load_app_stops()),
        "endpoints": {
            "routes": "/api/routes",
            "route_detail": "/api/routes/{route_number}",
            "stops": "/api/stops.json",
            "stops_search": "/api/stops?q={query}",
            "plan": "/api/plan?from={stop_id}&to={stop_id}",
            "health": "/health",
        },
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/routes")
def list_routes() -> dict[str, Any]:
    routes = load_app_routes()
    summaries = [
        {
            "id": route["id"],
            "route_number": route["route_number"],
            "display_number": route["display_number"],
            "name": route["name"],
            "color": route["color"],
            "operator": route.get("operator"),
            "stop_count": route["stop_count"],
        }
        for route in routes
    ]
    return {"total": len(summaries), "routes": summaries}


@app.get("/api/routes/{route_number}")
def get_route(route_number: str) -> dict[str, Any]:
    route = get_route_by_number(route_number)
    if not route:
        raise HTTPException(status_code=404, detail=f"Route {route_number} not found")
    return route


@app.get("/api/stops.json")
def list_all_stops() -> dict[str, Any]:
    stops = load_app_stops()
    return {"total": len(stops), "stops": stops}


@app.get("/api/stops")
def search_stops(
    q: str | None = Query(default=None),
    route_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    stops = load_app_stops()

    if route_id:
        stops = [stop for stop in stops if route_id in stop["routes"]]

    if q:
        query = q.strip().lower()
        stops = [
            stop
            for stop in stops
            if query in stop["name_en"].lower()
            or query in stop["name_mm"]
            or query in stop["road_en"].lower()
            or query in stop["township_en"].lower()
        ]

    page = stops[offset : offset + limit]
    return {"total": len(stops), "stops": page}


@app.get("/api/search")
def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    query = q.strip().lower()
    routes = load_app_routes()
    stops = load_app_stops()

    matched_routes = [
        route
        for route in routes
        if query in route["route_number"].lower()
        or query in route["name"].lower()
        or query in (route.get("description") or "").lower()
    ][:limit]

    matched_stops = [
        stop
        for stop in stops
        if query in stop["name_en"].lower() or query in stop["name_mm"]
    ][:limit]

    return {"query": q, "routes": matched_routes, "stops": matched_stops}


@app.get("/api/plan")
def plan_route(
    from_stop: str = Query(..., alias="from"),
    to_stop: str = Query(..., alias="to"),
    max_transfers: int = Query(default=2, ge=0, le=4),
) -> dict[str, Any]:
    # Expo app sends numeric stop IDs
    if from_stop.isdigit() and to_stop.isdigit():
        try:
            return plan_by_stop_ids(int(from_stop), int(to_stop), max_transfers)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Also support stop names for direct API use
    try:
        plans = find_routes(from_stop, to_stop, max_transfers=max_transfers)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not plans:
        raise HTTPException(status_code=404, detail="No route found")

    return {"from": from_stop, "to": to_stop, "plans": plans}


# Static file aliases for GitHub raw / Expo static host
@app.get("/data/bus_routes_list.json")
def static_routes_list() -> list[dict[str, Any]]:
    return load_app_routes()


@app.get("/data/bus_stops_list.json")
def static_stops_list() -> list[dict[str, Any]]:
    return load_app_stops()
