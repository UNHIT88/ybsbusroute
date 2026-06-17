"""Bus route pathfinding using scraped YBS stop sequences."""

from __future__ import annotations

import heapq
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TRANSFER_PENALTY = 3


@dataclass(frozen=True)
class RoutePosition:
    route_id: str
    sequence: int


@dataclass(frozen=True)
class SearchState:
    position: RoutePosition
    transfers: int


@dataclass
class PathStep:
    route_id: str
    route_number: str
    prefix: str | None
    from_stop: str
    to_stop: str
    stop_names: list[str]
    is_transfer: bool


def normalize_name(name: str) -> str:
    return " ".join(name.split()).strip().lower()


@lru_cache(maxsize=1)
def _load_route_catalog() -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for route_file in (DATA_DIR / "routes").glob("*.json"):
        route = json.loads(route_file.read_text(encoding="utf-8"))
        catalog[route["id"]] = route
    return catalog


@lru_cache(maxsize=1)
def _build_indexes() -> tuple[
    dict[str, list[RoutePosition]],
    dict[RoutePosition, str],
    dict[RoutePosition, list[RoutePosition]],
]:
    catalog = _load_route_catalog()
    stop_positions: dict[str, list[RoutePosition]] = {}
    position_names: dict[RoutePosition, str] = {}
    adjacency: dict[RoutePosition, list[RoutePosition]] = {}

    for route_id, route in catalog.items():
        stops = route.get("stops", [])
        for stop in stops:
            position = RoutePosition(route_id=route_id, sequence=stop["sequence"])
            name_key = normalize_name(stop["name"])
            stop_positions.setdefault(name_key, []).append(position)
            position_names[position] = stop["name"]

        for index in range(len(stops) - 1):
            current = RoutePosition(route_id=route_id, sequence=stops[index]["sequence"])
            nxt = RoutePosition(route_id=route_id, sequence=stops[index + 1]["sequence"])
            adjacency.setdefault(current, []).append(nxt)

        for index in range(1, len(stops)):
            current = RoutePosition(route_id=route_id, sequence=stops[index]["sequence"])
            prev = RoutePosition(route_id=route_id, sequence=stops[index - 1]["sequence"])
            adjacency.setdefault(current, []).append(prev)

    for positions in stop_positions.values():
        if len(positions) < 2:
            continue
        for left in positions:
            for right in positions:
                if left != right:
                    adjacency.setdefault(left, []).append(right)

    return stop_positions, position_names, adjacency


def _reconstruct_path(
    came_from: dict[SearchState, SearchState | None],
    goal: SearchState,
) -> list[RoutePosition]:
    path: list[RoutePosition] = []
    current: SearchState | None = goal
    while current is not None:
        path.append(current.position)
        current = came_from[current]
    path.reverse()
    return path


def _segment_positions(
    positions: list[RoutePosition],
    position_names: dict[RoutePosition, str],
    catalog: dict[str, dict[str, Any]],
) -> list[PathStep]:
    if len(positions) < 2:
        return []

    segments: list[PathStep] = []
    segment_start = 0

    for index in range(1, len(positions)):
        previous = positions[index - 1]
        current = positions[index]
        is_transfer = previous.route_id != current.route_id
        is_last = index == len(positions) - 1
        next_is_transfer = (
            not is_last and positions[index + 1].route_id != current.route_id
        )

        if is_transfer or is_last or next_is_transfer:
            chunk = positions[segment_start : index + 1]
            route_id = chunk[0].route_id
            route = catalog[route_id]
            stop_names = [position_names[position] for position in chunk]
            segments.append(
                PathStep(
                    route_id=route_id,
                    route_number=route["number"],
                    prefix=route.get("prefix"),
                    from_stop=stop_names[0],
                    to_stop=stop_names[-1],
                    stop_names=stop_names,
                    is_transfer=is_transfer,
                )
            )
            segment_start = index

    return segments


def find_routes(
    start_name: str,
    end_name: str,
    max_transfers: int = 2,
) -> list[dict[str, Any]]:
    stop_positions, position_names, adjacency = _build_indexes()
    catalog = _load_route_catalog()

    start_key = normalize_name(start_name)
    end_key = normalize_name(end_name)
    starts = stop_positions.get(start_key, [])
    goals = {position for position in stop_positions.get(end_key, [])}

    if not starts:
        raise ValueError(f"Start stop not found: {start_name}")
    if not goals:
        raise ValueError(f"End stop not found: {end_name}")

    best_cost: dict[SearchState, int] = {}
    came_from: dict[SearchState, SearchState | None] = {}
    queue: list[tuple[int, int, SearchState]] = []
    tie_breaker = 0

    for start in starts:
        state = SearchState(position=start, transfers=0)
        best_cost[state] = 0
        came_from[state] = None
        heapq.heappush(queue, (0, tie_breaker, state))
        tie_breaker += 1

    found_goal: SearchState | None = None

    while queue:
        cost, _, current = heapq.heappop(queue)
        if cost > best_cost.get(current, 10**9):
            continue

        if current.position in goals:
            found_goal = current
            break

        for neighbor in adjacency.get(current.position, []):
            move_cost = 1
            next_transfers = current.transfers
            if neighbor.route_id != current.position.route_id:
                move_cost = TRANSFER_PENALTY
                next_transfers = current.transfers + 1

            if next_transfers > max_transfers:
                continue

            next_state = SearchState(position=neighbor, transfers=next_transfers)
            next_cost = cost + move_cost
            if next_cost >= best_cost.get(next_state, 10**9):
                continue

            best_cost[next_state] = next_cost
            came_from[next_state] = current
            heapq.heappush(queue, (next_cost, tie_breaker, next_state))
            tie_breaker += 1

    if found_goal is None:
        return []

    positions = _reconstruct_path(came_from, found_goal)
    segments = _segment_positions(positions, position_names, catalog)

    return [
        {
            "type": "direct" if len(segments) == 1 else "transfer",
            "transfer_count": found_goal.transfers,
            "total_stops": len(positions),
            "segments": [
                {
                    "route_id": segment.route_id,
                    "route_number": segment.route_number,
                    "prefix": segment.prefix,
                    "from_stop": segment.from_stop,
                    "to_stop": segment.to_stop,
                    "stop_count": len(segment.stop_names),
                    "stops": segment.stop_names,
                    "is_transfer": segment.is_transfer,
                }
                for segment in segments
            ],
        }
    ]
