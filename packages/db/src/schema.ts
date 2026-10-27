import { relations, sql } from "drizzle-orm";
import { boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema";

export * from "./auth-schema";

/** One Clicky install: an app (or environment) belonging to an organization. */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull().unique(),
    allowedOrigins: text("allowed_origins").array().notNull().default([]),
    /** ProjectSettings from @clicky/shared; always read through parseProjectSettings. */
    settings: jsonb("settings").notNull().default({}),
    /** Last time the SDK successfully initialised from an allowed origin. */
    lastSeenAt: timestamp("last_seen_at"),
    lastSeenUrl: text("last_seen_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_organizationId_idx").on(table.organizationId)],
);

export const projectRelations = relations(project, ({ one }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
}));

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** A person using the customer's app. Identified by the host app (externalId) or an anonymous browser id. */
export const endUser = pgTable(
  "end_user",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** userId passed to Clicky.identify(), if any. */
    externalId: text("external_id"),
    /** Random id the SDK keeps in localStorage. */
    anonymousId: text("anonymous_id").notNull(),
    traits: jsonb("traits").notNull().default({}),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("end_user_project_anonymous_idx").on(table.projectId, table.anonymousId),
    index("end_user_project_external_idx").on(table.projectId, table.externalId),
  ],
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id")
      .notNull()
      .references(() => endUser.id, { onDelete: "cascade" }),
    mode: text("mode").$type<"ask" | "agent">().notNull().default("ask"),
    /** resolved | escalated | abandoned; null while open. Set from feedback/analytics later. */
    outcome: text("outcome"),
    /** The user's rating of the conversation: 1 (helpful) or -1 (not helpful). */
    feedback: integer("feedback"),
    feedbackAt: timestamp("feedback_at"),
    entryUrl: text("entry_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("conversation_project_created_idx").on(table.projectId, table.createdAt)],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    /** "voice" or "text": how the user asked. */
    inputMode: text("input_mode"),
    /** For user messages: the topic the question was grouped under (set in the background). */
    topicId: text("topic_id"),
    /** For user messages: whether Clicky could answer it (false = knowledge gap). */
    answered: boolean("answered"),
    pageUrl: text("page_url"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("message_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const knowledgeSource = pgTable(
  "knowledge_source",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    type: text("type").$type<"url" | "text">().notNull(),
    title: text("title").notNull(),
    /** Start URL for "url" sources. */
    url: text("url"),
    status: text("status").$type<"pending" | "syncing" | "ready" | "error">().notNull().default("pending"),
    error: text("error"),
    pageCount: integer("page_count").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("knowledge_source_project_idx").on(table.projectId)],
);

export const knowledgeChunk = pgTable(
  "knowledge_chunk",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => knowledgeSource.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** Page the chunk came from (for citations). */
    url: text("url"),
    title: text("title"),
    content: text("content").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || content)`,
    ),
  },
  (table) => [
    index("knowledge_chunk_project_idx").on(table.projectId),
    index("knowledge_chunk_search_idx").using("gin", table.searchVector),
  ],
);

/**
 * One assistant turn that may span several model calls (agent mode: act, observe, act again).
 * `messages` is the exact Anthropic request history for the run, stored as the raw JSON
 * string and only ever appended to, so thinking blocks replay unchanged.
 */
export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id")
      .notNull()
      .references(() => endUser.id, { onDelete: "cascade" }),
    status: text("status").$type<"running" | "waiting" | "completed" | "cancelled" | "failed">().notNull(),
    /** Mode (and so tool set) for the whole run, fixed at the start: plan limits can turn actions off. */
    mode: text("mode").$type<"agent" | "guide">().notNull().default("agent"),
    inputMode: text("input_mode").$type<"voice" | "text">().notNull().default("text"),
    messages: text("messages").notNull(),
    /** Tool results decided on the server (e.g. invalid input) to merge with the browser's results. */
    pendingResults: text("pending_results").notNull().default("[]"),
    steps: integer("steps").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("agent_run_conversation_idx").on(table.conversationId)],
);

/** Audit log of every action the assistant asked the browser to take, and what happened. */
export const agentAction = pgTable(
  "agent_action",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    input: jsonb("input").notNull(),
    needsConfirmation: boolean("needs_confirmation").notNull().default(false),
    status: text("status"),
    output: text("output"),
    pageUrl: text("page_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("agent_action_run_idx").on(table.runId),
    index("agent_action_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

/** A group of similar questions ("Exporting reports"), maintained automatically per project. */
export const topic = pgTable(
  "topic",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("topic_project_label_idx").on(table.projectId, sql`lower(${table.label})`)],
);

/**
 * Lightweight behaviour signals from the SDK: page views and signs of struggle
 * (rage clicks, dead clicks, form errors, stuck on a form). Not a full product
 * analytics stream; see docs/SPEC.md.
 */
export const event = pgTable(
  "event",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id").references(() => endUser.id, { onDelete: "cascade" }),
    /** Per-tab session id from the SDK. */
    sessionId: text("session_id").notNull(),
    type: text("type").notNull(),
    path: text("path").notNull(),
    /** Redacted description of the element involved, e.g. `button "Save changes"`. */
    element: text("element"),
    props: jsonb("props").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("event_project_created_idx").on(table.projectId, table.createdAt),
    index("event_project_type_path_idx").on(table.projectId, table.type, table.path),
  ],
);

/** An organization's plan. Created with a trial when the organization is; kept in sync by Stripe webhooks. */
export const subscription = pgTable("subscription", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: text("plan").$type<"free" | "growth" | "scale" | "enterprise">().notNull(),
  status: text("status").$type<"trialing" | "active" | "past_due" | "canceled">().notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  /** Start of the current billing month (usage resets here). */
  periodStart: timestamp("period_start").defaultNow().notNull(),
  periodEnd: timestamp("period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Which onboarding checklist steps each end user has completed (for the widget and the funnel). */
export const onboardingCompletion = pgTable(
  "onboarding_completion",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    endUserId: text("end_user_id")
      .notNull()
      .references(() => endUser.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("onboarding_completion_unique_idx").on(table.endUserId, table.stepId), index("onboarding_completion_project_idx").on(table.projectId)],
);
