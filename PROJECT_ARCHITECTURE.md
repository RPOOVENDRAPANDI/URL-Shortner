# URL Shortener — Internal Tool
## Project Architecture Document

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Draft — Pending Engineering Review  
**Owner:** Product Team  

---

## 1. Overview

An internal URL shortener that lets any team member convert long URLs into short, shareable links. Every short link tracks click counts so the team can see which links are being used and how often.

### Goals
- Paste a long URL → receive a short internal link instantly
- Short link redirects to the original destination
- Dashboard shows click count per short link
- Internal-only: no public registration, secured behind company auth

---

## 2. User Flow

```
User pastes long URL
        ↓
System generates a unique short code (e.g. /abc123)
        ↓
User receives: https://go.internal/abc123
        ↓
Anyone clicks the short link
        ↓
System logs the click + increments counter
        ↓
System 301/302 redirects to the original URL
```

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                        │
└───────────────────┬─────────────────────┬───────────────────┘
                    │                     │
              (Create link)         (Click short link)
                    │                     │
┌───────────────────▼─────────────────────▼───────────────────┐
│                    Frontend (React SPA)                       │
│   - Paste URL form                                            │
│   - Generated short link display + copy button               │
│   - My Links dashboard with click counts                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST API calls
┌───────────────────────────▼─────────────────────────────────┐
│                  Backend API (Node.js / Express)              │
│                                                               │
│  POST /api/shorten     → create short link                   │
│  GET  /:shortCode      → redirect + log click                │
│  GET  /api/links       → list user's links with click counts │
│  GET  /api/links/:id   → single link stats                   │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
┌──────────▼──────────┐          ┌──────────▼──────────┐
│   PostgreSQL DB      │          │    Redis Cache       │
│                      │          │                      │
│  - urls table        │          │  - Hot short codes   │
│  - clicks table      │          │    cached for fast   │
│  - users table       │          │    redirect lookup   │
└──────────────────────┘          └──────────────────────┘
```

---

## 4. Technology Stack

| Layer        | Technology          | Reason                                              |
|--------------|---------------------|-----------------------------------------------------|
| Frontend     | React + Vite        | Fast dev experience, component reuse for dashboard  |
| Backend      | Node.js + Express   | Lightweight, fast I/O for high-volume redirects     |
| Primary DB   | PostgreSQL          | Relational model fits URL + click audit trail       |
| Cache        | Redis               | Sub-millisecond redirect lookups for hot links      |
| Auth         | JWT + SSO (OIDC)    | Internal SSO login, no new user management needed   |
| Deployment   | Docker + Docker Compose | Portable, runs on any internal server          |
| Reverse Proxy| Nginx               | TLS termination, routes traffic to backend          |

---

## 5. Database Schema

### `urls` table
```sql
id           UUID         PRIMARY KEY
short_code   VARCHAR(10)  UNIQUE NOT NULL   -- e.g. "abc123"
original_url TEXT         NOT NULL
created_by   VARCHAR(255) NOT NULL          -- user email
created_at   TIMESTAMP    DEFAULT NOW()
is_active    BOOLEAN      DEFAULT TRUE
```

### `clicks` table
```sql
id           UUID         PRIMARY KEY
url_id       UUID         REFERENCES urls(id)
clicked_at   TIMESTAMP    DEFAULT NOW()
user_agent   TEXT                            -- browser/device info
referrer     TEXT                            -- where click came from
ip_hash      VARCHAR(64)                     -- hashed for privacy
```

> The `clicks` table is append-only. Click count = `SELECT COUNT(*) FROM clicks WHERE url_id = ?`. Aggregates cached in Redis.

---

## 6. API Specification

### POST `/api/shorten`
Create a new short link.

**Request:**
```json
{
  "url": "https://very-long-internal-url.example.com/path?query=value"
}
```
**Response:**
```json
{
  "short_code": "abc123",
  "short_url": "https://go.internal/abc123",
  "original_url": "https://very-long-internal-url.example.com/...",
  "created_at": "2026-05-28T10:00:00Z"
}
```

### GET `/:shortCode`
Redirect to original URL. Logs the click server-side before responding.

**Response:** `302 Found` → `Location: <original_url>`

### GET `/api/links`
Returns all links created by the authenticated user.

**Response:**
```json
[
  {
    "id": "uuid",
    "short_code": "abc123",
    "short_url": "https://go.internal/abc123",
    "original_url": "https://...",
    "click_count": 42,
    "created_at": "2026-05-28T10:00:00Z"
  }
]
```

### GET `/api/links/:id/stats`
Detailed stats for a single link.

**Response:**
```json
{
  "id": "uuid",
  "short_code": "abc123",
  "click_count": 42,
  "clicks_last_7_days": 18,
  "clicks_last_30_days": 37,
  "top_referrers": ["slack.com", "notion.so"]
}
```

---

## 7. Short Code Generation

- **Method:** NanoID (7 characters, URL-safe alphabet)
- **Collision handling:** On collision, regenerate — probability is negligible at internal scale
- **Custom aliases:** Optional — users can request a custom code (e.g. `/go/q4-roadmap`)
- **Example:** `https://go.internal/x7kR2mP`

---

## 8. Security Considerations

| Concern                   | Mitigation                                                             |
|---------------------------|------------------------------------------------------------------------|
| Open redirect abuse       | Only internal-authenticated users can create links                     |
| Malicious URL submission  | URL validation + optional blocklist of known malicious domains         |
| Click data privacy        | IP addresses hashed (SHA-256) before storage, never stored raw         |
| Auth bypass               | All `/api/*` routes require valid JWT; redirect route is public-read   |
| Rate limiting             | 20 link creations per user per hour via API rate limiter               |

---

## 9. Component Breakdown for Engineering

| Component           | Description                                          | Priority |
|---------------------|------------------------------------------------------|----------|
| Backend API         | Express server, all routes, short code logic         | P0       |
| PostgreSQL schema   | Migrations for `urls` and `clicks` tables            | P0       |
| Redirect handler    | GET `/:shortCode` → lookup → log click → redirect   | P0       |
| Frontend — Create   | URL input form, short link output, copy button       | P0       |
| Redis caching       | Cache hot short codes, cache click count aggregates  | P1       |
| Frontend — Dashboard| List of user's links with click counts               | P1       |
| Auth / SSO          | OIDC integration with internal identity provider     | P1       |
| Link stats detail   | Per-link analytics: trend by day, top referrers      | P2       |
| Custom aliases      | Let users set a vanity short code                    | P2       |
| Admin panel         | View/disable any link, global stats                  | P3       |

---

## 10. Folder Structure (Proposed)

```
URL-Shortner/
├── backend/
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic (shorten, redirect, stats)
│   │   ├── models/         # DB models
│   │   ├── middleware/     # Auth, rate limiting
│   │   └── index.js        # Entry point
│   ├── migrations/         # SQL migration files
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Create page, Dashboard page
│   │   └── main.jsx        # Entry point
│   └── package.json
├── docker-compose.yml       # Postgres + Redis + API + Frontend
├── nginx.conf               # Reverse proxy config
└── PROJECT_ARCHITECTURE.md  # This document
```

---

## 11. Deployment

- **Environment:** Docker Compose on internal server
- **Ports:** Nginx on 443 (TLS), backend on 3000 (internal), frontend on 5173 (internal)
- **Domain:** `go.internal` (requires internal DNS entry)
- **Secrets:** Managed via `.env` file (not committed) — DB credentials, JWT secret, Redis URL

---

## 12. Out of Scope (v1)

- Public-facing access (internal only for now)
- Link expiry / TTL
- QR code generation
- Bulk URL import
- Webhook notifications on click events

These can be revisited in v2 based on team usage and feedback.

---

## 13. Open Questions for Engineering

1. Which internal SSO provider should we integrate with? (Okta, Azure AD, Google Workspace?)
2. Is there an existing internal domain (`go.internal` or similar) we can use, or does DNS need to be provisioned?
3. Should the redirect endpoint require auth, or should shared links work for anyone on the VPN?
4. Preferred deployment target — existing Docker host, or spin up a new VM?

---

*Document prepared by the Product Team. Engineering team to review, raise questions, and confirm tech stack before implementation begins.*
