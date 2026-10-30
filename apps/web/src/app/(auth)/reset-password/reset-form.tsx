"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? "That link has expired or was already used." : null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("confirm") ?? "")) return setError("The passwords don't match.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    setPending(false);
    if (error) return setError(error.message ?? "Couldn't reset the password. Try requesting a new link.");
    router.push("/sign-in?reset=1");
  }

  if (!token || error === "That link has expired or was already used.") {
    return (
      <div className="space-y-4 text-sm">
        <h1 className="text-lg font-semibold">Link expired</h1>
        <p className="text-muted">Reset links work once, for one hour.</p>
        <Link href="/forgot-password" className="text-brand-ink">
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <Field label="New password" hint="At least 8 characters.">
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <Field label="Repeat it">
        <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        Save new password
      </Button>
    </form>
  );
}
