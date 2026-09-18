// db.js — Postgres connection + schema.
//
// Reads DATABASE_URL from the environment. Locally, set it in
// PowerShell before running the server:
//   $env:DATABASE_URL="postgres://user:pass@host:5432/dbname"
// On Render, render.yaml wires this automatically from the
// tejas-db Postgres instance via fromDatabase.

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Set it to your Postgres connection string " +
    "before starting the server (see comment at the top of db.js)."
  );
  process.exit(1);
}

const useSSL = !process.env.DATABASE_URL.includes("localhost");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cash NUMERIC(14,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      balance_after NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS holdings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      qty NUMERIC(14,4) NOT NULL,
      avg_price NUMERIC(14,2) NOT NULL,
      PRIMARY KEY (user_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty NUMERIC(14,4) NOT NULL,
      order_type TEXT NOT NULL,
      limit_price NUMERIC(14,2),
      status TEXT NOT NULL,
      filled_price NUMERIC(14,2),
      placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      filled_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_open_symbol ON orders(symbol) WHERE status = 'OPEN';
  `);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
