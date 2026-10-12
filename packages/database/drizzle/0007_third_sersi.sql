CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"title" varchar(255) NOT NULL,
	"target_exam_date" timestamp with time zone,
	"available_hours_per_week" numeric(4, 1) DEFAULT '10.0',
	"daily_target_minutes" integer DEFAULT 60,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"scheduled_date" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 45 NOT NULL,
	"session_type" varchar(50) DEFAULT 'study' NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"provider" varchar(100),
	"url" text,
	"type" varchar(50) DEFAULT 'textbook' NOT NULL,
	"verification_status" varchar(50) DEFAULT 'recommended_unverified' NOT NULL,
	"relevance_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD COLUMN "estimated_minutes" integer;--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD COLUMN "learning_objectives" jsonb;--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD COLUMN "prerequisites" jsonb;--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_resources" ADD CONSTRAINT "topic_resources_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_resources" ADD CONSTRAINT "topic_resources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_resources" ADD CONSTRAINT "topic_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_plans_user_id_idx" ON "study_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_plans_course_id_idx" ON "study_plans" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "study_sessions_plan_id_idx" ON "study_sessions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_date_idx" ON "study_sessions" USING btree ("user_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "study_sessions_topic_id_idx" ON "study_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "study_sessions_course_id_idx" ON "study_sessions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "topic_resources_topic_id_idx" ON "topic_resources" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_resources_course_id_idx" ON "topic_resources" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "topic_resources_user_id_idx" ON "topic_resources" USING btree ("user_id");