import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema: './src/db/schema/index.ts', dialect: 'postgresql', out: './migrations',
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}) });
