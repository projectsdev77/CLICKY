"use client";

import { useActionState } from "react";
import { addOnboardingStep, saveOnboardingSettings } from "@/app/actions";
import { Button, Field, FormMessage, Input } from "@/components/ui";

const selectClass = "w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

export function OnboardingSettingsForm({
  projectId,
  settings,
  disabled,
}: {
  projectId: string;
  settings: { enabled: boolean; title: string; audienceDays: number };
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(saveOnboardingSettings.bind(null, projectId), null);
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Show the checklist to new users
        </label>
        <Field label="Checklist title">
          <Input name="title" defaultValue={settings.title} maxLength={60} />
        </Field>
        <Field label="Show to users first seen within" hint="Days">
          <Input name="audienceDays" type="number" min={1} max={365} defaultValue={settings.audienceDays} />
        </Field>
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

export function AddStepForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(addOnboardingStep.bind(null, projectId), null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Step">
          <Input name="title" required maxLength={80} placeholder="Export your first report" />
        </Field>
        <Field label="Done when the user">
          <select name="type" className={selectClass} defaultValue="click">
            <option value="page">visits a page</option>
            <option value="click">clicks something</option>
            <option value="event">does something your app tracks</option>
          </select>
        </Field>
        <Field label="Which" hint="A path (/reports, /settings/*), a button label (Export), or an event name.">
          <Input name="value" required maxLength={120} placeholder="Export" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Add step
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
