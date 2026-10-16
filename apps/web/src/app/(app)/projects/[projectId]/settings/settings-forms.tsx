"use client";

import { useActionState } from "react";
import { deleteProject, renameProject, rotateProjectKey } from "@/app/actions";
import { Button, FormMessage, Input } from "@/components/ui";

export function RenameForm({ projectId, name, disabled }: { projectId: string; name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(renameProject.bind(null, projectId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Input name="name" defaultValue={name} required disabled={disabled} className="max-w-xs" />
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
