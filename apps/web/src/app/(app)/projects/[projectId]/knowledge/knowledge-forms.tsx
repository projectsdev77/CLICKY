"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addTextSource, addUrlSource } from "@/app/actions";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";

export function AddUrlForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(addUrlSource.bind(null, projectId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Input name="url" type="url" required placeholder="https://help.acme.com/" className="max-w-md" />
      <Button type="submit" disabled={pending}>
        Add
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function AddTextForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(addTextSource.bind(null, projectId), null);
  return (
    <form action={action} className="space-y-3">
      <Field label="Title">
        <Input name="title" required placeholder="How refunds work" />
      </Field>
      <Field label="Article">
        <Textarea name="body" required rows={6} className="font-sans" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Add article
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Re-renders the page every few seconds while a source is still being read. */
export function RefreshWhileSyncing({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
