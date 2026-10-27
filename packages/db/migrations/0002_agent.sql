CREATE TABLE "agent_action" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"input" jsonb NOT NULL,
	"needs_confirmation" boolean DEFAULT false NOT NULL,
	"status" text,
	"output" text,
	"page_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"project_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"status" text NOT NULL,
	"input_mode" text DEFAULT 'text' NOT NULL,
	"messages" text NOT NULL,
	"pending_results" text DEFAULT '[]' NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_end_user_id_end_user_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_run_idx" ON "agent_action" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_action_project_created_idx" ON "agent_action" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_conversation_idx" ON "agent_run" USING btree ("conversation_id");