CREATE TABLE "qairos_paper_positions" (
	"session_id" text NOT NULL,
	"market_id" integer NOT NULL,
	"yes" double precision DEFAULT 0 NOT NULL,
	"no" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qairos_paper_positions_session_id_market_id_pk" PRIMARY KEY("session_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "qairos_public_commitments" (
	"session_id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"commitment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qairos_wallet_sessions" (
	"session_hash" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"message" text,
	"authenticated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "qairos_wallet_sessions_expiry_idx" ON "qairos_wallet_sessions" USING btree ("expires_at");