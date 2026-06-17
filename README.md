# ybsbusroute

Open API and dataset for **Yangon Bus Service (YBS)** routes and stops, collected from [yangonbusroute.com](https://yangonbusroute.com/).

## What's included

| Resource | Description |
|----------|-------------|
| `data/routes.json` | Index of all 149 bus routes with summary info |
| `data/routes/{id}.json` | Full route detail with ordered stop list |
| `data/stops.json` | Stop name index mapped to serving routes |
| `api/main.py` | FastAPI server exposing the dataset as REST endpoints |
| `scripts/scrape_yangonbusroute.py` | Scraper to refresh data from yangonbusroute.com |

## Data source

Data is scraped from publicly available route listings on [yangonbusroute.com](https://yangonbusroute.com/). See their [about page](https://yangonbusroute.com/about) for the data transparency disclaimer.

**Last scraped:** see `metadata.scraped_at` in `data/routes.json`.

## Quick start (API)

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for interactive API documentation.

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API info and endpoint list |
| `GET` | `/health` | Health check |
| `GET` | `/api/routes` | List all routes |
| `GET` | `/api/routes?prefix=YPS` | Filter routes by prefix |
| `GET` | `/api/routes/{id}` | Get route with full stop list |
| `GET` | `/api/stops` | List/search stops |
| `GET` | `/api/stops?route_id=1` | Stops on a specific route |
| `GET` | `/api/search?q=နတ်စင်` | Search routes and stops |

### Example responses

**List routes**

```bash
curl http://localhost:8000/api/routes
```

**Get route 1 with all stops**

```bash
curl http://localhost:8000/api/routes/1
```

**Search for a stop**

```bash
curl "http://localhost:8000/api/stops?q=နတ်စင်"
```

## Using raw JSON (no server)

You can also consume the data directly from GitHub without running the API:

```
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/routes.json
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/routes/1.json
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/stops.json
```

## Data schema

### Route (index)

```json
{
  "id": "1",
  "number": "1",
  "prefix": null,
  "color": "#2b6cb0",
  "url": "https://yangonbusroute.com/ybs-route/1",
  "summary": "လှည်းကူးဈေး - ... - ဇဝန",
  "major_stops": ["လှည်းကူးဈေး", "..."],
  "origin": "လှည်းကူးဈေး",
  "destination": "ဇဝန",
  "stop_count": 114
}
```

### Route detail (includes stops)

```json
{
  "id": "1",
  "number": "1",
  "stops": [
    { "sequence": 1, "name": "လှည်းကူးဈေး", "type": "start" },
    { "sequence": 114, "name": "ဇဝန", "type": "end" }
  ]
}
```

### Stop index entry

```json
{
  "name": "နတ်စင်",
  "routes": [
    { "route_id": "2", "route_number": "2", "prefix": "YPS", "sequence": 42 }
  ]
}
```

## Refresh data

```bash
python scripts/scrape_yangonbusroute.py
```

This re-fetches all routes from yangonbusroute.com and updates the `data/` directory.

## License note

Route and stop data originates from publicly available YBS records. This repository organizes and serves that data for developer use; it does not claim ownership of the underlying transit data.
