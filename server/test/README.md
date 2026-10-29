# Server tests

Vitest + `app.inject` against a real Postgres and Redis. `sendMail` and WhatsApp sends are mocked
(`test/setup.ts`); captured messages are in `sentMails` / `sentWhatsApps` from `test/helpers.ts`.

## Run

```sh
# Docker Desktop on this machine (the default docker context has no daemon):
systemctl --user start docker-desktop      # or: docker context use desktop-linux
docker compose -f test/docker-compose.yml up -d   # Postgres :55439, Redis :56379 (tmpfs, throwaway)
npm test
docker compose -f test/docker-compose.yml down
```

Each `npm test` drops and recreates the `public` schema from `migrations/*.sql` (`test/globalSetup.ts`;
it refuses URLs without "test" in them). Redis db 15 is flushed at the start of every test file.

Override with `TEST_DATABASE_URL` / `TEST_REDIS_URL` to use another Postgres (e.g. a local
`createdb expense_management_test`) or Redis.

## Route coverage

`routes.coverage.test.ts` collects every registered route (`onRoute`) and fails unless some test file calls
`covers('METHOD /path')` with that exact literal, e.g. `covers('POST /expenses', 'GET /expenses/:id')`.
Paths are Fastify route patterns including prefixes (`/auth/login`).
