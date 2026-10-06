CREATE TABLE "model_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"purpose" text NOT NULL,
	"target_population" text NOT NULL,
	"training_data" text NOT NULL,
	"validation_strategy" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"calibration" text NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"known_missing_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"known_bias_risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"appropriate_interpretation" text NOT NULL,
	"inappropriate_interpretation" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_registries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"target" varchar(50) NOT NULL,
	"population" jsonb NOT NULL,
	"dataset_version" varchar(100) NOT NULL,
	"feature_schema_version" varchar(50) NOT NULL,
	"algorithm" varchar(100) NOT NULL,
	"hyperparameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"training_period" jsonb NOT NULL,
	"validation_period" jsonb NOT NULL,
	"test_period" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"calibration_results" jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_status" varchar(50) DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"snapshot_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"company" jsonb NOT NULL,
	"role" jsonb NOT NULL,
	"role_family" jsonb NOT NULL,
	"eligibility_rules" jsonb NOT NULL,
	"required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"program_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_provenance" jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"snapshot_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"education_snapshot" jsonb NOT NULL,
	"graduation_timing" jsonb NOT NULL,
	"academic_evidence_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_evidence_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"project_evidence_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"application_context" jsonb,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_registries" ADD CONSTRAINT "model_registries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_snapshots" ADD CONSTRAINT "opportunity_snapshots_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_snapshots" ADD CONSTRAINT "prediction_snapshots_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_cards_version_idx" ON "model_cards" USING btree ("model_version");--> statement-breakpoint
CREATE UNIQUE INDEX "model_registries_version_idx" ON "model_registries" USING btree ("model_version");--> statement-breakpoint
CREATE INDEX "model_registries_target_idx" ON "model_registries" USING btree ("target");--> statement-breakpoint
CREATE INDEX "model_registries_status_idx" ON "model_registries" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "opportunity_snapshots_opp_id_idx" ON "opportunity_snapshots" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_snapshots_hash_idx" ON "opportunity_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "opportunity_snapshots_timestamp_idx" ON "opportunity_snapshots" USING btree ("snapshot_timestamp");--> statement-breakpoint
CREATE INDEX "prediction_snapshots_user_id_idx" ON "prediction_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prediction_snapshots_opp_id_idx" ON "prediction_snapshots" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "prediction_snapshots_hash_idx" ON "prediction_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "prediction_snapshots_timestamp_idx" ON "prediction_snapshots" USING btree ("snapshot_timestamp");