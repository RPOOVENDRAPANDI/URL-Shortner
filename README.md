# URL Shortener

Internal tool to shorten long URLs and track how many times each link is clicked.

## Features

- Paste a long URL and get a short link back
- Short links redirect to the original destination
- Click counter for every link, visible on the dashboard

## Quick Start (Node.js)

**Requirements:** Node.js 18+

```bash
git clone https://github.com/RPOOVENDRAPANDI/URL-Shortner.git
cd URL-Shortner

npm install

cp .env.example .env   # edit BASE_URL if deploying to a server

npm start
```

Open **http://localhost:3000** in your browser.

## Quick Start (Docker)

```bash
git clone https://github.com/RPOOVENDRAPANDI/URL-Shortner.git
cd URL-Shortner

docker compose up --build
```

Open **http://localhost:3000** in your browser.

The SQLite database is stored in `./data/urls.db` on the host so links survive container restarts.

## Configuration

Copy `.env.example` to `.env` and edit as needed:

| Variable   | Default                  | Description                                     |
|------------|--------------------------|-------------------------------------------------|
| `PORT`     | `3000`                   | Port the server listens on                      |
| `BASE_URL` | `http://localhost:3000`  | Public URL — set this to your server's domain   |
| `DB_PATH`  | `./urls.db`              | Path to the SQLite database file                |

**Example for a hosted server:**

```env
PORT=3000
BASE_URL=https://go.yourcompany.internal
DB_PATH=/app/data/urls.db
```

## API

| Method | Path              | Description                            |
|--------|-------------------|----------------------------------------|
| POST   | `/api/shorten`    | Create a short link                    |
| GET    | `/api/links`      | List all links with click counts       |
| GET    | `/:code`          | Redirect to original URL, log click    |

**POST `/api/shorten`**

```bash
curl -X POST http://localhost:3000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/very/long/url"}'
```

```json
{
  "short_code": "x7kR2m",
  "short_url": "http://localhost:3000/x7kR2m",
  "original_url": "https://example.com/very/long/url"
}
```

**GET `/api/links`**

```json
[
  {
    "id": 1,
    "short_code": "x7kR2m",
    "short_url": "http://localhost:3000/x7kR2m",
    "original_url": "https://example.com/very/long/url",
    "click_count": 14,
    "created_at": "2026-05-28 10:00:00"
  }
]
```

## Project Structure

```
URL-Shortner/
├── server.js              # Express server — all routes and DB logic
├── public/
│   └── index.html         # Frontend — shorten form + links dashboard
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── PROJECT_ARCHITECTURE.md
```

## Deployment Notes

- The app uses **SQLite** — no external database required.
- For production, set `BASE_URL` to your real domain so generated short links are correct.
- Put Nginx or a reverse proxy in front to handle TLS.
- The `data/` directory (Docker) or the `.db` file should be backed up regularly.
