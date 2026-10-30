"use client";

import { useActionState } from "react";
import { deleteOrganization, leaveOrganization, renameOrganization } from "@/app/actions";
import { Button, Field, FormMessage, Input } from "@/components/ui";

export function RenameOrganizationForm({ name, disabled }: { name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(renameOrganization, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Name">
        <Input name="name" defaultValue={name} required disabled={disabled} className="max-w-xs" />
      </Field>
      <Button type="submit" disabled={pending || disabled}>
        Save
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function LeaveButton() {
  const [state, action, pending] = useActionState(() => leaveOrganization(), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Leave this organization? You'll lose access until someone invites you again.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <Button type="submit" variant="secondary" disabled={pending}>
        Leave organization
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteOrganizationForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(deleteOrganization, null);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">Deletes every project, conversation and setting in this organization. This can&apos;t be undone.</p>
      <Field label={`Type "${name}" to confirm`}>
        <Input name="confirm" required className="max-w-xs" autoComplete="off" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="danger" disabled={pending}>
          Delete organization
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
