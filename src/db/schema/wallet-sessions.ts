import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// Tokens are random and only their SHA-256 hashes are stored. Expired challenges
// and sessions are removed when a new challenge is issued.
export const walletSessions = pgTable("qairos_wallet_sessions", {
  sessionHash: text("session_hash").primaryKey(),
  address: text("address").notNull(),
  message: text("message"),
  authenticatedAt: timestamp("authenticated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("qairos_wallet_sessions_expiry_idx").on(table.expiresAt)]);
