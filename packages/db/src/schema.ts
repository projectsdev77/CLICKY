import { relations, sql } from "drizzle-orm";
import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
