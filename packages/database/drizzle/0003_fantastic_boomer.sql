CREATE TABLE "application_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'applied' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_at" timestamp with time zone,
	"interview_at" timestamp with time zone,
	"final_interview_at" timestamp with time zone,
	"outcome_at" timestamp with time zone,
	"outcome_notes" text,
	"state_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"website_url" varchar(512),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_family_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"opportunity_type" varchar(50) DEFAULT 'internship' NOT NULL,
	"target_graduation_years" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"degree_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_majors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"season" varchar(100),
	"employment_type" varchar(50) DEFAULT 'internship' NOT NULL,
	"workplace_type" varchar(50) DEFAULT 'hybrid' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"min_gpa" numeric(3, 2),
	"min_experience_months" integer DEFAULT 0 NOT NULL,
	"requires_work_auth" varchar(50) DEFAULT 'any' NOT NULL,
	"source_url" text NOT NULL,
	"source_organization" varchar(255) NOT NULL,
	"retrieval_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"publication_date" timestamp with time zone,
	"expiration_date" timestamp with time zone,
	"last_valid_timestamp" timestamp with time zone,
	"extraction_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"city" varchar(100),
	"state_province" varchar(100),
	"country" varchar(100) DEFAULT 'US' NOT NULL,
	"is_remote" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_program_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"rule_type" varchar(100) NOT NULL,
	"rule_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"parsed_rule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_skill_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"requirement_type" varchar(50) DEFAULT 'required' NOT NULL,
	"min_proficiency" varchar(50) DEFAULT 'proficient' NOT NULL,
	"importance_weight" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"source_type" varchar(50) DEFAULT 'official_ats' NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(50) DEFAULT 'concept' NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_career_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_career_path" varchar(255),
	"target_geography" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_recruiting_period" varchar(100),
	"degree_level" varchar(50),
	"major" varchar(255),
	"university" varchar(255),
	"graduation_year" integer,
	"graduation_month" integer,
	"current_year_of_study" integer,
	"is_enrolled" boolean DEFAULT true NOT NULL,
	"work_authorization" varchar(100),
	"gpa" numeric(3, 2),
	"years_experience" numeric(3, 1) DEFAULT '0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_skill_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"evidence_level" varchar(50) DEFAULT 'claimed' NOT NULL,
	"evidence_source" varchar(50) DEFAULT 'self_reported' NOT NULL,
	"academic_node_id" uuid,
	"course_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"artifact_url" text,
	"verified_at" timestamp with time zone,
	"confidence_score" numeric(4, 3) DEFAULT '0.400' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_target_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_target_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_family_id" uuid NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_role_family_id_role_families_id_fk" FOREIGN KEY ("role_family_id") REFERENCES "public"."role_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_locations" ADD CONSTRAINT "opportunity_locations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_program_rules" ADD CONSTRAINT "opportunity_program_rules_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_skill_requirements" ADD CONSTRAINT "opportunity_skill_requirements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_skill_requirements" ADD CONSTRAINT "opportunity_skill_requirements_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_career_profiles" ADD CONSTRAINT "student_career_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD CONSTRAINT "student_skill_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD CONSTRAINT "student_skill_evidence_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD CONSTRAINT "student_skill_evidence_academic_node_id_academic_nodes_id_fk" FOREIGN KEY ("academic_node_id") REFERENCES "public"."academic_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skill_evidence" ADD CONSTRAINT "student_skill_evidence_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_target_roles" ADD CONSTRAINT "student_target_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_target_roles" ADD CONSTRAINT "student_target_roles_role_family_id_role_families_id_fk" FOREIGN KEY ("role_family_id") REFERENCES "public"."role_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_records_user_id_idx" ON "application_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "application_records_opportunity_id_idx" ON "application_records" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "application_records_user_status_idx" ON "application_records" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "application_records_user_opp_idx" ON "application_records" USING btree ("user_id","opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "opportunities_company_id_idx" ON "opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "opportunities_role_family_id_idx" ON "opportunities" USING btree ("role_family_id");--> statement-breakpoint
CREATE INDEX "opportunities_status_idx" ON "opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opportunities_type_idx" ON "opportunities" USING btree ("opportunity_type");--> statement-breakpoint
CREATE INDEX "opp_locations_opp_id_idx" ON "opportunity_locations" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opp_program_rules_opp_id_idx" ON "opportunity_program_rules" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_requirements_opportunity_id_idx" ON "opportunity_requirements" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunity_requirements_category_idx" ON "opportunity_requirements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "opp_skill_reqs_opp_id_idx" ON "opportunity_skill_requirements" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opp_skill_reqs_skill_id_idx" ON "opportunity_skill_requirements" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_skill_reqs_unique_idx" ON "opportunity_skill_requirements" USING btree ("opportunity_id","skill_id");--> statement-breakpoint
CREATE INDEX "opp_sources_opp_id_idx" ON "opportunity_sources" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_families_name_idx" ON "role_families" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_name_idx" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "student_career_profiles_user_id_idx" ON "student_career_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_skill_evidence_user_id_idx" ON "student_skill_evidence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "student_skill_evidence_skill_id_idx" ON "student_skill_evidence" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "student_skill_evidence_level_idx" ON "student_skill_evidence" USING btree ("user_id","evidence_level");--> statement-breakpoint
CREATE INDEX "student_target_companies_user_id_idx" ON "student_target_companies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_target_companies_unique_idx" ON "student_target_companies" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "student_target_roles_user_id_idx" ON "student_target_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_target_roles_unique_idx" ON "student_target_roles" USING btree ("user_id","role_family_id");