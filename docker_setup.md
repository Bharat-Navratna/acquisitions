# Acquisitions – Docker & Neon Database Setup

This project is a Node.js/Express backend that uses [Neon](https://neon.tech) as its Postgres database via the `@neondatabase/serverless` driver and Drizzle ORM.

This document explains how to run the application with Docker in two environments:

- **Local development** using **Neon Local** (ephemeral branches)
- **Production / production-like** using **Neon Cloud** directly (no Neon Local)

---

## 1. Overview

### Services

- **Application (`app`)** – Node/Express API, defined by the `Dockerfile` in this repo.
- **Neon Local (`neon-local`)** – A local proxy that exposes a Postgres endpoint and connects to your Neon Cloud project. It can automatically create **ephemeral branches** for development/testing.

### Files involved

- `Dockerfile` – Builds the Node.js app image.
- `.dockerignore` – Excludes unnecessary files from the Docker build context.
- `docker-compose.dev.yml` – Runs the app + Neon Local for local development.
- `docker-compose.prod.yml` – Runs the app only, connecting to Neon Cloud.
- `.env.development` – Environment variables for local development (Neon Local).
- `.env.production` – Environment variables for production/production-like runs (Neon Cloud).
- `src/config/database.js` – Database configuration using Neon serverless + Drizzle.

---

## 2. Docker image (Dockerfile)

The `Dockerfile` builds a minimal Node.js image for the app:

```dockerfile
FROM node:22-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the app
COPY . .

# Defaults (overridden via env in docker-compose)
ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Default prod command (dev overrides with npm run dev)
CMD ["npm", "start"]
```

- Uses `node:22-alpine` for a small image.
- Installs dependencies via `npm ci`.
- Exposes port `3001`.
- Uses `npm start` as the default command (see `package.json`), which you override to `npm run dev` in development compose.

---

## 3. .dockerignore

The `.dockerignore` file ensures that unnecessary files are not sent to the Docker daemon during builds, keeping images smaller and builds faster:

```gitignore
node_modules
npm-debug.log*
yarn-error.log*
logs
*.log

.git
.gitignore

.env
.env.*

.vscode
.idea

coverage
dist
build
.DS_Store
Thumbs.db
```

> Note: This does **not** affect what gets committed to Git; it only affects the Docker build context.

---

## 4. Environment configuration

### 4.1 Development – `.env.development`

Used by `docker-compose.dev.yml` and the app when developing locally with Neon Local.

```bash
# Server
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug

# Database (Neon Local)
# Default Neon Local credentials: user=neon, password=npg
DATABASE_URL=postgres://neon:npg@neon-local:5432/<database_name>?sslmode=require

# Neon Local -> Neon Cloud
NEON_API_KEY=<your_neon_api_key>
NEON_PROJECT_ID=<your_neon_project_id>
PARENT_BRANCH_ID=<your_parent_branch_id>

# Hint for Neon serverless driver config
USE_NEON_LOCAL=true
NEON_LOCAL_HOST=neon-local
```

Fill in:

- `<database_name>` – database name for the Neon branch created by Neon Local.
- `<your_neon_api_key>` – your Neon API key.
- `<your_neon_project_id>` – the Neon project ID.
- `<your_parent_branch_id>` – the branch ID in Neon from which ephemeral branches should be created.

### 4.2 Production – `.env.production`

Used by `docker-compose.prod.yml` (for local production-like runs). In real production, you typically set these via your hosting platform.

```bash
# Server
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Database (Neon Cloud)
DATABASE_URL=postgres://<user>:<password>@<your-neon-host>.neon.tech/<database_name>?sslmode=require
```

Fill in values from the Neon console.

> **Security note:** `.env` and `.env.*` are listed in `.gitignore`, so they are not committed. In actual production, prefer your platform’s secret manager rather than shipping `.env.production` with real secrets.

---

## 5. Database configuration (`src/config/database.js`)

The app uses the Neon serverless driver and Drizzle. The configuration is already wired up to support both Neon Local (for development) and Neon Cloud (for production):

```js
import 'dotenv/config';

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

if (process.env.USE_NEON_LOCAL === 'true') {
  const host = process.env.NEON_LOCAL_HOST || 'neon-local';

  neonConfig.fetchEndpoint = `http://${host}:5432/sql`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}

const sql = neon(process.env.DATABASE_URL);

const db = drizzle(sql);

export { db, sql };
```

- **Development**: `USE_NEON_LOCAL=true` and `NEON_LOCAL_HOST=neon-local` (from `.env.development`) configure the Neon serverless driver to speak HTTP to Neon Local at `http://neon-local:5432/sql`.
- **Production**: these variables are not set, so the driver uses the standard Neon Cloud endpoint from `DATABASE_URL`.

---

## 6. Local development with Neon Local

### 6.1 Compose file – `docker-compose.dev.yml`

```yaml
version: "3.9"

services:
  neon-local:
    image: neondatabase/neon_local:latest
    container_name: neon-local
    ports:
      - "5432:5432"
    env_file:
      - .env.development
    environment:
      NEON_API_KEY: ${NEON_API_KEY}
      NEON_PROJECT_ID: ${NEON_PROJECT_ID}
      PARENT_BRANCH_ID: ${PARENT_BRANCH_ID}

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: acquisitions-app-dev
    env_file:
      - .env.development
    environment:
      NODE_ENV: development
    depends_on:
      - neon-local
    ports:
      - "3001:3001"
    command: ["npm", "run", "dev"]
```

### 6.2 Behavior

- **Neon Local (`neon-local`)**
  - Runs the `neondatabase/neon_local:latest` proxy.
  - Uses `NEON_API_KEY`, `NEON_PROJECT_ID`, and `PARENT_BRANCH_ID` to create an **ephemeral branch** in Neon when the container starts.
  - Deletes the ephemeral branch when the container stops, keeping your Neon project tidy.
  - Exposes a Postgres endpoint at: `postgres://neon:npg@neon-local:5432/<database_name>?sslmode=require`.

- **App (`app`)**
  - Built from the `Dockerfile`.
  - Uses `.env.development`, so `DATABASE_URL` points to `neon-local`.
  - Runs with `npm run dev` (`node --watch src/index.js`).
  - Exposed on `http://localhost:3001`.

### 6.3 Commands

Start development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Stop and clean up:

```bash
docker compose -f docker-compose.dev.yml down
```

Each `up` gives you a **fresh ephemeral Neon branch**; each `down` deletes it.

### 6.4 Connecting a local DB client

While the dev stack is running, you can connect using any Postgres client with:

- Host: `localhost`
- Port: `5432`
- User: `neon`
- Password: `npg`
- Database: `<database_name>`

This is useful for inspecting or debugging your local dev database.

---

## 7. Production / production-like setup with Neon Cloud

### 7.1 Compose file – `docker-compose.prod.yml`

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: acquisitions-app
    env_file:
      - .env.production
    environment:
      NODE_ENV: production
    ports:
      - "3001:3001"
    restart: unless-stopped
```

### 7.2 Behavior

- Only the **app** container is started.
- The app reads `DATABASE_URL` from the environment (here via `.env.production`).
- `DATABASE_URL` should point to your real Neon Cloud instance, e.g. `postgres://<user>:<password>@<your-neon-host>.neon.tech/<database_name>?sslmode=require`.
- **No Neon Local proxy** is used in this environment.

### 7.3 Commands

Start production-like stack:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Stop it:

```bash
docker compose -f docker-compose.prod.yml down
```

In a real deployment (e.g., Kubernetes, ECS, Fly.io), the same image and environment variables are used; the difference is that secrets (including `DATABASE_URL`) are managed by the hosting platform instead of `.env.production`.

---

## 8. Environment switching summary

- **Development**
  - Compose file: `docker-compose.dev.yml`
  - Env file: `.env.development`
  - DB URL: `postgres://neon:npg@neon-local:5432/<database_name>?sslmode=require`
  - Neon Local creates & destroys **ephemeral branches** on container start/stop.

- **Production**
  - Compose file: `docker-compose.prod.yml`
  - Env file: `.env.production` (or platform-injected env vars)
  - DB URL: `postgres://...@<your-neon-host>.neon.tech/<database_name>?sslmode=require`
  - App connects directly to Neon Cloud; no Neon Local.

With this setup, you can iterate rapidly in development using disposable Neon branches, while production remains clean and secure using your primary Neon Cloud database.
