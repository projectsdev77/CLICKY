"use client";

import { useActionState } from "react";
import type { Workflow } from "@clicky/shared";
import { saveWorkflow } from "@/app/actions";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";

export function WorkflowForm({ projectId, workflow }: { projectId: string; workflow?: Workflow }) {
  const [state, action, pending] = useActionState(saveWorkflow.bind(null, projectId), null);
  return (
    <form action={action} className="space-y-3">
      {workflow && <input type="hidden" name="id" value={workflow.id} />}
      <Field label="Task" hint="What the user is trying to do.">
        <Input name="name" required maxLength={80} defaultValue={workflow?.name} placeholder="Invite a teammate" />
      </Field>
      <Field label="Steps">
        <Textarea
          name="instructions"
          required
          rows={5}
          maxLength={3000}
          defaultValue={workflow?.instructions}
          className="font-sans"
          placeholder={"1. Open Settings → Team.\n2. Click Invite and enter their email.\n3. Pick a role: Viewer unless they need to edit.\n4. Remind them to check their spam folder."}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {workflow ? "Save changes" : "Add workflow"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
