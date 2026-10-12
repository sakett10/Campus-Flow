CREATE TABLE "examination_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"resource_id" uuid,
	"title" varchar(255) NOT NULL,
	"term" varchar(50),
	"exam_type" varchar(50),
	"academic_year" varchar(50),
	"total_marks" numeric(6, 2),
	"duration_minutes" integer,
	"instructions" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "examination_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"question_number" varchar(50) NOT NULL,
	"parent_question_id" uuid,
	"question_text" text NOT NULL,
	"marks" numeric(5, 2),
	"page_number" integer,
	"question_format" varchar(50) DEFAULT 'short_answer' NOT NULL,
	"options" jsonb,
	"compulsory" boolean DEFAULT true NOT NULL,
	"choice_group" varchar(100),
	"candidate_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topic_id" uuid,
	"topic_confidence" numeric(4, 3),
	"difficulty" varchar(50) DEFAULT 'medium' NOT NULL,
	"difficulty_uncertainty" numeric(4, 3) DEFAULT '0.200',
	"cognitive_level" varchar(50),
	"verification_status" varchar(50) DEFAULT 'extracted' NOT NULL,
	"user_notes" text,
	"source_snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"format" varchar(50) DEFAULT 'standard' NOT NULL,
	"blueprint_id" uuid,
	"total_marks" numeric(6, 2) DEFAULT '50.00' NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"difficulty" varchar(50) DEFAULT 'medium' NOT NULL,
	"status" varchar(50) DEFAULT 'ready' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagnostic_feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_type" varchar(100) NOT NULL,
	"task_version" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"estimated_cost_micro_cents" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'success' NOT NULL,
	"content_hash" varchar(64),
	"cached" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "examination_papers" ADD CONSTRAINT "examination_papers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_papers" ADD CONSTRAINT "examination_papers_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_papers" ADD CONSTRAINT "examination_papers_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_paper_id_examination_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."examination_papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_questions" ADD CONSTRAINT "examination_questions_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_assessments" ADD CONSTRAINT "practice_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_assessments" ADD CONSTRAINT "practice_assessments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_assessments" ADD CONSTRAINT "practice_assessments_blueprint_id_examination_papers_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."examination_papers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_assessment_id_practice_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."practice_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_submissions" ADD CONSTRAINT "practice_submissions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "examination_papers_user_id_idx" ON "examination_papers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "examination_papers_course_id_idx" ON "examination_papers" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "examination_papers_user_course_idx" ON "examination_papers" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "examination_questions_paper_id_idx" ON "examination_questions" USING btree ("paper_id");--> statement-breakpoint
CREATE INDEX "examination_questions_user_id_idx" ON "examination_questions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "examination_questions_course_id_idx" ON "examination_questions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "examination_questions_topic_id_idx" ON "examination_questions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "practice_assessments_user_id_idx" ON "practice_assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "practice_assessments_course_id_idx" ON "practice_assessments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "practice_submissions_assessment_id_idx" ON "practice_submissions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "practice_submissions_user_id_idx" ON "practice_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "practice_submissions_course_id_idx" ON "practice_submissions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_user_id_idx" ON "ai_usage_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_records_created_at_idx" ON "ai_usage_records" USING btree ("created_at");
