CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"role" varchar(50) DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"term" varchar(50),
	"syllabus_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"date" timestamp with time zone,
	"weightage" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"title" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint,
	"processing_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "courses_user_id_idx" ON "courses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_user_code_term_idx" ON "courses" USING btree ("user_id","code","term");--> statement-breakpoint
CREATE INDEX "assessments_user_id_idx" ON "assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assessments_course_id_idx" ON "assessments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "assessments_user_date_idx" ON "assessments" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "resources_user_id_idx" ON "resources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resources_course_id_idx" ON "resources" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "resources_user_type_idx" ON "resources" USING btree ("user_id","type");