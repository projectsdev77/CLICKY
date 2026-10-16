"use client";

import { useActionState } from "react";
import { createWorkspace } from "@/app/actions";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";

export function WorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, null);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <Field label="Company name">
          <Input name="organization" required placeholder="Acme Inc." />
        </Field>
        <Field label="App name" hint="One Clicky project per app or environment.">
          <Input name="project" required placeholder="Acme Dashboard" />
        </Field>
        <Field label="Where does your app run?" hint="Clicky only loads on these websites. You can add more later.">
          <Input name="origin" placeholder="https://app.acme.com" />
        </Field>
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          Continue
        </Button>
      </form>
    </Card>
  );
}
