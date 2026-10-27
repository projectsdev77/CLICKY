"use client";

import { useActionState } from "react";
import type { ProjectSettings } from "@clicky/shared";
import { deleteProject, deleteUserData, renameProject, rotateProjectKey, updateAssistantSettings } from "@/app/actions";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";

export function RenameForm({ projectId, name, disabled }: { projectId: string; name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(renameProject.bind(null, projectId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Input name="name" aria-label="Project name" defaultValue={name} required disabled={disabled} className="max-w-xs" />
      <Button type="submit" disabled={pending || disabled}>
        Save
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function DangerZone({ projectId }: { projectId: string }) {
  const [rotateState, rotate, rotating] = useActionState(() => rotateProjectKey(projectId), null);
  return (
    <div className="space-y-4">
      <form
        action={rotate}
        onSubmit={(e) => {
          if (!confirm("Generate a new key? Clicky stops working until you update the snippet in your app.")) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <Button type="submit" variant="secondary" disabled={rotating}>
          Generate new key
        </Button>
        <FormMessage state={rotateState} />
      </form>
      <form
        action={deleteProject.bind(null, projectId)}
        onSubmit={(e) => {
          if (!confirm("Delete this project and all of its data? This can't be undone.")) e.preventDefault();
        }}
      >
        <Button type="submit" variant="danger">
          Delete project
        </Button>
      </form>
    </div>
  );
}

const selectClass = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

export function AssistantForm({
  projectId,
  settings,
  disabled,
}: {
  projectId: string;
  settings: ProjectSettings;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateAssistantSettings.bind(null, projectId), null);
  const { appearance, behavior } = settings;
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="assistantName" defaultValue={appearance.assistantName} required maxLength={40} />
        </Field>
        <Field label="Brand color">
          <Input name="brandColor" type="color" defaultValue={appearance.brandColor} className="h-10 p-1" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Greeting">
            <Input name="greeting" defaultValue={appearance.greeting} maxLength={200} />
          </Field>
        </div>
        <Field label="Position">
          <select name="position" defaultValue={appearance.position} className={selectClass}>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </Field>
        <Field label="Theme">
          <select name="theme" defaultValue={appearance.theme} className={selectClass}>
            <option value="auto">Match the user&apos;s system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
        <Field label="Mode" hint="Guide only: Clicky explains and points, but never clicks or types.">
          <select name="mode" defaultValue={behavior.mode} className={selectClass}>
            <option value="agent">Guide and do tasks</option>
            <option value="guide">Guide only</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="voiceEnabled" defaultChecked={behavior.voiceEnabled} /> Voice (talk and listen)
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="proactiveEnabled" defaultChecked={settings.proactive.enabled} /> Offer help when
          someone seems stuck
        </label>
        <Field label="Offer help after this long on a form" hint="Seconds without submitting.">
          <Input name="stuckSeconds" type="number" min={15} max={600} defaultValue={settings.proactive.stuckSeconds} />
        </Field>
        <Field label="“Talk to a person” goes to" hint="A support page (https://…) or an email address. Leave empty to hide the button.">
          <Input name="handoffUrl" defaultValue={settings.handoff.url.replace(/^mailto:/, "")} placeholder="support@acme.com" />
        </Field>
        <Field label="Button label">
          <Input name="handoffLabel" defaultValue={settings.handoff.label} maxLength={40} />
        </Field>
        <Field label="Keep conversations and signals for">
          <select name="retentionDays" defaultValue={String(settings.data.retentionDays)} className={selectClass}>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="trackSignals" defaultChecked={behavior.trackSignals} /> Collect page views and
          struggle signals for the Friction page (never field values)
        </label>
        <Field label="Pages where Clicky must not act" hint="One path per line. * matches one segment, ** any depth, e.g. /admin/**">
          <Textarea name="blockedPaths" defaultValue={behavior.blockedPaths.join("\n")} rows={3} placeholder="/billing&#10;/admin/**" />
        </Field>
        <Field label="Always ask before" hint="Words that make Clicky ask first when they appear on the button, e.g. archive, invite.">
          <Textarea name="confirmKeywords" defaultValue={behavior.confirmKeywords.join("\n")} rows={3} placeholder="archive&#10;invite" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Extra instructions" hint="Tone, product names, things Clicky should never do. Up to 4,000 characters.">
            <Textarea name="customInstructions" defaultValue={behavior.customInstructions} rows={4} maxLength={4000} className="font-sans" />
          </Field>
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          Save
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteUserForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(deleteUserData.bind(null, projectId), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete all of this user's conversations and signals? This can't be undone.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <Input name="userId" aria-label="User id" placeholder="user_1234" className="max-w-xs" required />
      <Button type="submit" variant="secondary" disabled={pending}>
        Delete user data
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
