CREATE TABLE "academic_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"origin" varchar(50) DEFAULT 'model' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.800',
	"needs_review" varchar(20) DEFAULT 'no' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"char_count" integer NOT NULL,
	"token_count" integer,
	"extraction_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"chunking_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "extraction_version" varchar(20) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD CONSTRAINT "academic_nodes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_nodes" ADD CONSTRAINT "academic_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_chunks" ADD CONSTRAINT "resource_chunks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_nodes_course_id_idx" ON "academic_nodes" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "academic_nodes_user_id_idx" ON "academic_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "academic_nodes_parent_id_idx" ON "academic_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_chunks_resource_seq_idx" ON "resource_chunks" USING btree ("resource_id","sequence");--> statement-breakpoint
CREATE INDEX "resource_chunks_resource_id_idx" ON "resource_chunks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_chunks_user_id_idx" ON "resource_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resource_chunks_course_id_idx" ON "resource_chunks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "resource_chunks_search_vector_idx" ON "resource_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "resources_user_content_hash_idx" ON "resources" USING btree ("user_id","content_hash");