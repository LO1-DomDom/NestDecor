# NestDecor API

Backend for **NestDecor** (group *Domdom*, CO3043 Mobile Application Development). Node.js + Express, documented and testable through **Swagger UI**.

Two API collections:

| Collection | Base path | What it does |
| --- | --- | --- |
| **Catalog** | `/api/catalog` | Curated furniture catalog: list/filter/search, detail, categories, styles, seller-link click tracking, admin CRUD (API key). |
| **Rooms** | `/api/rooms` | Room plan (size + budget), on-device analysis result (style, light, palette), matched recommendations, saved shortlist with budget totals. |

Swagger UI is served at **`/docs`**, the raw OpenAPI 3 document at **`/openapi.json`**, and a liveness check at `/health`.

## Run locally

```bash
npm install
npm start          # http://localhost:3000/docs
npm test           # 27 checks across every endpoint, with response validation against openapi.yaml
```

## Deploy (public Swagger link)

### Option A: Render (free, no card)
1. Push this folder to a GitHub repository.
2. Render dashboard, **New**, **Blueprint**, select the repository. `render.yaml` configures everything.
   (Or **New**, **Web Service**: build command `npm ci`, start command `npm start`, health check path `/health`.)
3. When the deploy finishes, the submission link is `https://<your-service>.onrender.com/docs`.

Free instances sleep after ~15 minutes idle, and the first request after that takes about 30 to 60 seconds. Open the link once before presenting or submitting.

### Option B: any Docker host (Railway, Fly.io, Koyeb, Cloud Run)
The included `Dockerfile` listens on `$PORT` (default 3000). Point the platform at the repository and deploy.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (set by the platform). |
| `ADMIN_API_KEY` | `nestdecor-demo-key` | Value required in the `x-api-key` header for catalog write operations. |

## Notes
- **Data is in memory** and resets on restart. The catalog is seeded from `data/products.json` (31 *illustrative* items; seller links are marketplace search pages). Replace them with the team's verified items (backlog T7) by editing `data/build-seed.js` and running `node data/build-seed.js`.
- Photos are never sent to this API. The mobile app analyses the room photo on the phone and sends only the result to `PUT /api/rooms/{roomId}/analysis`.
- Rooms are scoped to an anonymous device through the optional `X-Device-Id` header (the app has no accounts).
- Requests are rate limited to 120 per minute per IP.

## Typical flow

```text
POST /api/rooms                              { lengthM: 4, widthM: 3, budgetVnd: 3000000 }
PUT  /api/rooms/{roomId}/analysis            { style: "minimalism", lightLevel: "bright", palette: [...], source: "on-device" }
GET  /api/rooms/{roomId}/recommendations     -> items that fit the room and the remaining budget
POST /api/rooms/{roomId}/saved-items         { productId: "p001" }
POST /api/catalog/products/p001/click        -> seller URL, counts the link open (assumption A6)
```
