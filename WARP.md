# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Tooling and commands

This is a Node.js (ESM) Express API with Drizzle ORM and Neon for PostgreSQL.

### Package scripts

Run with npm (or another compatible package manager) from the repo root:

- `npm run dev` – Start the API with `node --watch src/index.js`.
- `npm run lint` – Lint all JS files with ESLint (see `eslint.config.js`).
- `npm run lint:fix` – Lint and auto-fix issues.
- `npm run format` – Format the codebase with Prettier.
- `npm run format:check` – Check formatting without writing changes.
- `npm run db:generate` – Generate Drizzle migrations from the models in `src/models/*.js` into `drizzle/`.
- `npm run db:migrate` – Apply pending Drizzle migrations using `DATABASE_URL`.
- `npm run db:studio` – Launch Drizzle Studio for inspecting the database schema/data.

There is currently no dedicated test runner or `npm test` script configured. ESLint has a `tests/**/*.js` override ready, so when tests are added, wire them to an explicit script (for example `"test"`) in `package.json`.

### Environment

The API expects at least these environment variables (typically via `.env` and `dotenv`):

- `DATABASE_URL` – Postgres connection string used by Neon + Drizzle (`src/config/database.js`, `drizzle.config.js`).
- `JWT_SECRET` – Secret for signing/verifying JWTs (falls back to a hardcoded dev value in `src/utils/jwt.js`, override in real environments).
- `PORT` – Optional; HTTP port for the Express server (defaults to `5000`).
- `NODE_ENV` – Controls logging behavior and cookie security flags.
- `LOG_LEVEL` – Optional; minimum log level for Winston (default `info`).

## High-level architecture

The codebase follows a classic layered Express architecture with explicit directory separation and import aliases defined in `package.json` (`imports` field).

### Entry points and server lifecycle

- `src/index.js`
  - Loads environment variables via `dotenv/config`.
  - Imports `src/server.js` to start the HTTP server.
- `src/server.js`
  - Imports the Express app from `src/app.js`.
  - Binds `app.listen` on `PORT || 5000` and logs the listening URL.

### Express app setup

Defined in `src/app.js`:

- Creates the `express()` app and wires core middleware:
  - `helmet()` for basic security headers.
  - `cors()` for CORS.
  - `express.json()` and `express.urlencoded()` for body parsing.
  - `cookie-parser` for cookie access.
- HTTP request logging via `morgan('combined')`, with log lines streamed into the shared Winston logger (`#config/logger.js`), so HTTP access logs land in `logs/combined.log`.
- Health and info endpoints:
  - `GET /` – Simple "Hello from Acquisitions!" response and a log line.
  - `GET /health` – JSON status with timestamp and `process.uptime()`.
  - `GET /api` – Basic API liveness message.
- Mounts feature routes:
  - `app.use('/api/auth', authRoutes)` from `#routes/auth.routes.js`.

### Module layout and import aliases

`package.json` defines ESM import aliases using the `imports` map:

- `#config/*` → `./src/config/*` (database, logger, etc.).
- `#controllers/*` → `./src/controllers/*`.
- `#middleware/*` → `./src/middleware/*` (not yet present, but reserved).
- `#models/*` → `./src/models/*`.
- `#routes/*` → `./src/routes/*`.
- `#services/*` → `./src/services/*`.
- `#utils/*` → `./src/utils/*`.
- `#validations/*` → `./src/validations/*`.

Future modules should respect this structure so imports stay consistent and relative paths are avoided.

### Persistence layer and Drizzle ORM

- Database client in `src/config/database.js`:
  - Uses Neon (`@neondatabase/serverless`) to create a `sql` client from `DATABASE_URL`.
  - Wraps it with `drizzle(sql)` to expose a typed `db` instance.
- Schema definition in `src/models/users.model.js` using `drizzle-orm/pg-core`:
  - `users` table with `id`, `name`, `email` (unique), `password`, `role`, and timestamp columns.
- `drizzle.config.js` ties Drizzle CLI to this schema:
  - `schema: './src/models/*.js'`, `out: './drizzle'`, `dialect: 'postgresql'`, and `dbCredentials.url` from `DATABASE_URL`.
- Generated SQL migrations and metadata live under `drizzle/` and are ignored by ESLint.

All service-level database access should go through the exported `db` instance and schema objects from `src/models`.

### Logging

Central logging is configured in `src/config/logger.js` using Winston:

- Default meta: `{ service: 'acquisitions-api' }`.
- File transports:
  - `logs/error.log` for `error` level.
  - `logs/combined.log` for all logs.
- In non-production environments (`NODE_ENV !== 'production'`), adds a colorized console transport for easier local debugging.

`morgan` in `app.js` routes HTTP access logs into this logger, and other modules (controllers, services, utils) import `logger` from `#config/logger.js` for structured logging.

### Auth flow (request path through the layers)

Current implemented feature: user signup.

1. **Route layer** – `src/routes/auth.routes.js`
   - Defines `POST /api/auth/sign-up` → `signup` controller.
   - Placeholder handlers exist for `POST /sign-in` and `POST /sign-out` (simple string responses for now).

2. **Controller layer** – `src/controllers/auth.controller.js`
   - `signup(req, res, next)`:
     - Validates `req.body` with `signupSchema` from `#validations/auth.validation.js` (Zod).
     - On validation failure, responds with `400` and a formatted error message via `formatValidationError` from `#utils/format.js`.
     - On success, destructures `name`, `email`, `password`, `role` and calls `createUser` from `#services/auth.service.js`.
     - Generates a JWT with `jwttoken.sign(...)` from `#utils/jwt.js` (payload includes `id`, `email`, `role`).
     - Sets a `token` cookie on the response via the `cookies` helper from `#utils/cookies.js`.
     - Logs a success message and returns a `201` response with a pared-down `user` representation.
     - Catches errors, logging them and mapping known conditions (e.g., duplicate email) to appropriate HTTP status codes before delegating to `next(e)`.

3. **Service layer** – `src/services/auth.service.js`
   - `hashPassword(password)` wraps `bcrypt.hash` with a cost factor of `10` and logs on failure.
   - `createUser({ name, email, password, role })`:
     - Queries the `users` table for an existing record by email (via `db.select().from(users).where(eq(users.email, email)).limit(1)`).
     - If a user exists, throws an error to signal duplication.
     - Hashes the provided password.
     - Inserts a new row into `users` with the hashed password and role (default `user`).
     - Uses `.returning(...)` to get a shaped user object (id, name, email, role, created_at).
     - Logs success and returns the new user object.

4. **Validation layer** – `src/validations/auth.validation.js`
   - `signupSchema` enforces constraints on `name`, `email`, `password`, and `role` (`'user' | 'admin'`).
   - `signInSchema` exists for future sign-in implementation (email + password).

5. **Utility layer**
   - `src/utils/jwt.js`:
     - Encapsulates JWT `sign` and `verify` with centralized error logging and a default expiry of `1d`.
   - `src/utils/cookies.js`:
     - Provides helpers to `set`, `clear`, and `get` cookies.
     - Cookie options are security-aware: `sameSite: 'strict'`, `httpOnly: true`, `secure` in production, and a default `maxAge` of 15 minutes.
   - `src/utils/format.js`:
     - `formatValidationError` converts Zod error objects into a simple comma-separated string of messages.

Extending auth (e.g., implementing real sign-in/sign-out, refresh tokens, role-based access) should follow this same route → controller → service → db + utils pattern.

## Notes for future agents

- Prefer using the existing alias-based module layout instead of deep relative imports.
- When adding new domains (e.g., acquisitions data, organizations), mirror the existing structure: `routes` → `controllers` → `services` → `models` → `validations` → `utils` as needed.
- Keep Drizzle models in `src/models` so CLI commands continue to work without reconfiguration.
- Reuse the central `logger` for structured logging rather than `console.log`, especially in controllers and services.
