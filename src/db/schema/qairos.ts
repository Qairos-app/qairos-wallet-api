import { pgTable, text, integer, doublePrecision, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const paperPositions = pgTable("qairos_paper_positions", {
  sessionId: text("session_id").notNull(),
  marketId: integer("market_id").notNull(),
  yes: doublePrecision("yes").notNull().default(0),
  no: doublePrecision("no").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.sessionId, t.marketId] })]);

export const publicCommitments = pgTable("qairos_public_commitments", {
  sessionId: text("session_id").primaryKey(),
  account: text("account").notNull(),
  commitment: text("commitment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPaperPositionSchema = createInsertSchema(paperPositions);
export const insertPublicCommitmentSchema = createInsertSchema(publicCommitments);
export type PaperPosition = typeof paperPositions.$inferSelect;
export type PublicCommitment = typeof publicCommitments.$inferSelect;
