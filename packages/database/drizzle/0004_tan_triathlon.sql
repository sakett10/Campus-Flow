CREATE TABLE "concept_skill_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_name" varchar(255) NOT NULL,
	"skill_name" varchar(255) NOT NULL,
	"skill_category" varchar(50) DEFAULT 'concept' NOT NULL,
	"relevance_score" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"provenance" varchar(50) DEFAULT 'canonical_curated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_saved_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"custom_title" varchar(255),
	"custom_company" varchar(255),
	"source_url" text,
	"notes" text,
	"status" varchar(50) DEFAULT 'saved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "industry" varchar(100);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "ingestion_provider" varchar(100) DEFAULT 'official_direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "is_canonical" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD COLUMN "assessment_id" uuid;--> statement-breakpoint
ALTER TABLE "student_saved_opportunities" ADD CONSTRAINT "student_saved_opportunities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_saved_opportunities" ADD CONSTRAINT "student_saved_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concept_skill_mappings_unique_idx" ON "concept_skill_mappings" USING btree ("concept_name","skill_name");--> statement-breakpoint
CREATE INDEX "concept_skill_mappings_concept_idx" ON "concept_skill_mappings" USING btree ("concept_name");--> statement-breakpoint
CREATE INDEX "concept_skill_mappings_skill_idx" ON "concept_skill_mappings" USING btree ("skill_name");--> statement-breakpoint
CREATE INDEX "student_saved_opps_user_id_idx" ON "student_saved_opportunities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_saved_opps_opp_id_idx" ON "student_saved_opportunities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_saved_opps_user_opp_idx" ON "student_saved_opportunities" USING btree ("user_id","opportunity_id");--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD CONSTRAINT "student_skill_evidence_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_canonical_idx" ON "opportunities" USING btree ("is_canonical");--> statement-breakpoint
CREATE INDEX "opportunities_source_url_idx" ON "opportunities" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "student_skill_evidence_assessment_id_idx" ON "student_skill_evidence" USING btree ("assessment_id");