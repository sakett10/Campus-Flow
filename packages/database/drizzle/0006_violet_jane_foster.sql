CREATE TABLE "academic_node_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"relevance_summary" text,
	"origin" varchar(50) DEFAULT 'model' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"weight" numeric(5, 2),
	"source" varchar(50) DEFAULT 'user' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_study_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"state" varchar(50) DEFAULT 'not_started' NOT NULL,
	"last_studied_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "total_marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "status" varchar(50) DEFAULT 'upcoming' NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_node_resources" ADD CONSTRAINT "academic_node_resources_node_id_academic_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_node_resources" ADD CONSTRAINT "academic_node_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_node_resources" ADD CONSTRAINT "academic_node_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_node_resources" ADD CONSTRAINT "academic_node_resources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_study_states" ADD CONSTRAINT "topic_study_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_study_states" ADD CONSTRAINT "topic_study_states_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_study_states" ADD CONSTRAINT "topic_study_states_topic_id_academic_nodes_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."academic_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_node_resources_node_id_idx" ON "academic_node_resources" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "academic_node_resources_resource_id_idx" ON "academic_node_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "academic_node_resources_course_id_idx" ON "academic_node_resources" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "academic_node_resources_user_id_idx" ON "academic_node_resources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assessment_topics_assessment_id_idx" ON "assessment_topics" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessment_topics_topic_id_idx" ON "assessment_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "assessment_topics_user_id_idx" ON "assessment_topics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assessment_topics_course_id_idx" ON "assessment_topics" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_topics_unique_idx" ON "assessment_topics" USING btree ("assessment_id","topic_id");--> statement-breakpoint
CREATE INDEX "study_events_user_topic_idx" ON "study_events" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX "study_events_user_course_occurred_idx" ON "study_events" USING btree ("user_id","course_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_study_states_user_topic_idx" ON "topic_study_states" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX "topic_study_states_user_course_idx" ON "topic_study_states" USING btree ("user_id","course_id");