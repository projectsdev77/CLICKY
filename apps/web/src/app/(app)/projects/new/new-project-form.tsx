"use client";

import { useActionState } from "react";
import { createProject } from "@/app/actions";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProject, null);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <Field label="App name">
          <Input name="name" required placeholder="Acme Dashboard (staging)" />
        </Field>
        <Field label="Website" hint="Where this app runs. You can add more later.">
          <Input name="origin" placeholder="https://staging.acme.com" />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending}>
          Create project
        </Button>
      </form>
    </Card>
  );
}
