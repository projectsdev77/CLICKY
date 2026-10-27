CREATE TABLE "onboarding_completion" (
	"project_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"step_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_completion" ADD CONSTRAINT "onboarding_completion_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_completion" ADD CONSTRAINT "onboarding_completion_end_user_id_end_user_id_fk" FOREIGN KEY ("end_user_id") REFERENCES "public"."end_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_completion_unique_idx" ON "onboarding_completion" USING btree ("end_user_id","step_id");--> statement-breakpoint
CREATE INDEX "onboarding_completion_project_idx" ON "onboarding_completion" USING btree ("project_id");