import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    // Prefer DIRECT_URL for Prisma CLI commands, fallback to DATABASE_URL.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
