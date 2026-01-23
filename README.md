# NYK Cosmetics Business Management Backend

NestJS REST API for NYK Cosmetics Business Management.

## Features
- NestJS (TypeScript) REST API
- Prisma ORM with Neon PostgreSQL (pooled + direct URLs)
- JWT authentication + role-based access (ADMIN, SALESPERSON)
- Global prefix `/_api` (no `/api` routes)
- Swagger docs at `/_api/docs`
- Class-validator DTO validation

## Local Setup
1) Install dependencies:
```bash
pnpm install
```

2) Create `.env` from `.env.example` and configure values:
```bash
cp .env.example .env
```

3) Generate Prisma client:
```bash
pnpm prisma:generate
```

4) Run migrations (local/dev):
```bash
pnpm prisma:migrate
```

5) Seed initial data (admin, salesperson, sample products/customers):
```bash
pnpm prisma:seed
```

6) Start the API:
```bash
pnpm start:dev
```

API runs at `http://localhost:3000/_api`.

## Neon Configuration (MANDATORY)
Use two URLs:
- `DATABASE_URL` = Neon pooled URL (runtime)
  - Must include `sslmode=require` and `pgbouncer=true`
- `DIRECT_URL` = Neon direct URL (migrations)
  - Must include `sslmode=require`

Example:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

## Prisma Migrations & Seed
- Migrate in dev:
```bash
pnpm prisma:migrate
```

- Deploy migrations in production:
```bash
pnpm prisma:deploy
```

- Seed:
```bash
pnpm prisma:seed
```

Seeded credentials (override with env vars `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SALESPERSON_USERNAME`, `SALESPERSON_PASSWORD`):
- Admin: `admin` / `Admin@1234`
- Salesperson: `salesperson` / `Sales@1234`

## Heroku Deployment
1) Create Heroku app:
```bash
heroku create nyk-cosmetics-be
```

2) Set required config vars:
```bash
heroku config:set DATABASE_URL="<neon-pooled-url>"
heroku config:set DIRECT_URL="<neon-direct-url>"
heroku config:set JWT_SECRET="<secret>"
heroku config:set JWT_EXPIRES_IN="1d"
heroku config:set CORS_ORIGIN="https://your-frontend.vercel.app"
```

3) Deploy code:
```bash
git push heroku main
```

4) Run migrations:
```bash
heroku run pnpm prisma:deploy
```

5) (Optional) seed:
```bash
heroku run pnpm prisma:seed
```

Heroku will use the `Procfile`:
```
web: pnpm start:prod
```

## API Notes
- Global prefix: `/_api`
- Swagger docs: `/_api/docs`
- Auth header: `Authorization: Bearer <token>`

## Routes
Auth:
- POST `/_api/auth/login`

Users (ADMIN):
- GET `/_api/users`
- POST `/_api/users`
- PATCH `/_api/users/:id`

Customers:
- GET `/_api/customers`
- POST `/_api/customers`
- PATCH `/_api/customers/:id`
- GET `/_api/customers/:id`

Products & Inventory:
- GET `/_api/products`
- POST `/_api/products`
- PATCH `/_api/products/:id`
- PATCH `/_api/inventory/:productId`

Orders:
- POST `/_api/orders`
- GET `/_api/orders`
- GET `/_api/orders/:id`
- POST `/_api/orders/:id/confirm`
- POST `/_api/orders/:id/cancel`
- POST `/_api/orders/:id/deliver`

Payments:
- POST `/_api/payments`
- GET `/_api/payments`
- POST `/_api/payments/:id/confirm`

Expenses:
- POST `/_api/expenses`
- GET `/_api/expenses`

Employees & Salaries:
- POST `/_api/employees`
- GET `/_api/employees`
- POST `/_api/salaries`
- GET `/_api/salaries`

Ledger:
- GET `/_api/ledger?from=&to=`
- GET `/_api/ledger/daily-summary?date=`

Daily Balance:
- POST `/_api/daily-balance/close?date=`
- GET `/_api/daily-balance?from=&to=`
