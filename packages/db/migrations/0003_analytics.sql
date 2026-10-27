CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"end_user_id" text,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text NOT NULL,
	"element" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "feedback" integer;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "feedback_at" timestamp;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "answered" boolean;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_end_user_id_end_user_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_project_created_idx" ON "event" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "event_project_type_path_idx" ON "event" USING btree ("project_id","type","path");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_project_label_idx" ON "topic" USING btree ("project_id",lower("label"));