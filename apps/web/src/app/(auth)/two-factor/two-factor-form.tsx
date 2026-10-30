"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function TwoFactorForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const code = String(formData.get("code") ?? "").replace(/\s/g, "");
    const trustDevice = formData.get("trust") === "on";
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setPending(false);
    if (error) return setError(error.message ?? "That code didn't work.");
    router.push(next);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">Two-step verification</h1>
      <p className="text-sm text-muted">
        {backup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}
      </p>
      <Field label={backup ? "Backup code" : "Code"}>
        <Input name="code" required autoFocus autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trust" /> Trust this device for 30 days
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        Verify
      </Button>
      <button type="button" className="w-full text-center text-sm text-brand-ink" onClick={() => setBackup(!backup)}>
        {backup ? "Use my authenticator app" : "Use a backup code"}
      </button>
    </form>
  );
}
