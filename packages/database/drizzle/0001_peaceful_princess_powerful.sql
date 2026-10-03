CREATE TABLE "job_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(255),
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resources" ALTER COLUMN "processing_status" SET DEFAULT 'created';--> statement-breakpoint
CREATE UNIQUE INDEX "job_outbox_queue_idempotency_idx" ON "job_outbox" USING btree ("queue_name","idempotency_key");--> statement-breakpoint
CREATE INDEX "job_outbox_status_scheduled_idx" ON "job_outbox" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "job_outbox_locked_idx" ON "job_outbox" USING btree ("locked_at","status");