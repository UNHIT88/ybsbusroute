# ybsbusroute

Open API and dataset for **Yangon Bus Service (YBS)** routes and stops, collected from [yangonbusroute.com](https://yangonbusroute.com/) with GPS coordinates from [YRTA open data](https://github.com/eimg/ybs-data-json).

## What's included

| Resource | Description |
|----------|-------------|
| `data/routes.json` | Index of all 149 bus routes with summary info |
| `data/routes/{id}.json` | Full route detail with ordered stop list + GPS where matched |
| `data/stops.json` | Stop name index mapped to serving routes + coordinates |
| `data/yrta-stops-index.json` | YRTA stop name → coordinate lookup table |
| `api/main.py` | FastAPI server exposing the dataset as REST endpoints |
| `api/routing.py` | Route planning engine (A→B with transfers) |
| `scripts/scrape_yangonbusroute.py` | Scraper to refresh data from yangonbusroute.com |
| `scripts/enrich_coordinates.py` | Adds GPS coordinates from YRTA open data |

## Data sources

| Source | Data |
|--------|------|
| [yangonbusroute.com](https://yangonbusroute.com/) | Route numbers, stop names, stop sequences |
| [eimg/ybs-data-json](https://github.com/eimg/ybs-data-json) | GPS coordinates (YRTA Open Data License 1.0) |

**Last scraped:** see `metadata.scraped_at` in `data/routes.json`.

## Quick start (API)

```bash
pip install -r requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for interactive API documentation.

### React Native Expo

See **[examples/expo/README.md](examples/expo/README.md)** for a ready-to-copy API client, hooks, and demo app.

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
| `GET` | `/api/plan?from=...&to=...` | Plan a trip with transfer support |

### Example requests

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

**Plan a trip (A → B)**

```bash
curl "http://localhost:8000/api/plan?from=နတ်စင်&to=စံပြဈေး"
```

Example response:

```json
{
  "from": "နတ်စင်",
  "to": "စံပြဈေး",
  "plans": [{
    "type": "direct",
    "transfer_count": 0,
    "segments": [{
      "route_number": "71",
      "from_stop": "နတ်စင်",
      "to_stop": "စံပြဈေး",
      "stops": ["နတ်စင်", "တောင်မြောက်လမ်းဆုံ", "တံတားဖြူ", "ကားကြီးဂိတ်", "စံပြဈေး"]
    }]
  }]
}
```

## Deploy

### Render (recommended)

1. Fork/push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect the repo — `render.yaml` is included
4. Your API will be live at `https://<app-name>.onrender.com`

### Docker

```bash
docker build -t ybsbusroute-api .
docker run -p 8000:8000 ybsbusroute-api
```

### Railway

```bash
# Install Railway CLI, then:
railway init
railway up
```

Uses the included `Procfile` (`uvicorn api.main:app --host 0.0.0.0 --port $PORT`).

## Using raw JSON (no server)

You can also consume the data directly from GitHub without running the API:

```
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/routes.json
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/routes/1.json
https://raw.githubusercontent.com/UNHIT88/ybsbusroute/main/data/stops.json
```

## Data schema

### Route stop (with coordinates)

```json
{
  "sequence": 106,
  "name": "နတ်စင်",
  "type": null,
  "yrta_id": "1",
  "location": { "lng": 96.222571, "lat": 16.868886 },
  "road": "အမှတ်(၂)လမ်းမ",
  "township": "တောင်ဒဂုံ"
}
```

### Route plan segment

```json
{
  "route_id": "71",
  "route_number": "71",
  "prefix": null,
  "from_stop": "နတ်စင်",
  "to_stop": "စံပြဈေး",
  "stop_count": 5,
  "stops": ["နတ်စင်", "..."],
  "is_transfer": false
}
```

## Refresh data

```bash
# 1. Re-scrape routes from yangonbusroute.com
python scripts/scrape_yangonbusroute.py

# 2. Re-add GPS coordinates from YRTA data
python scripts/enrich_coordinates.py
```

## License note

Route and stop data originates from publicly available YBS records. GPS coordinates come from YRTA open data (via eimg/ybs-data-json). This repository organizes and serves that data for developer use; it does not claim ownership of the underlying transit data.
