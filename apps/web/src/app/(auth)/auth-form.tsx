"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

/** Only allow same-site relative redirects after sign-in. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AuthForm({ mode, googleEnabled }: { mode: "sign-in" | "sign-up"; googleEnabled: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: String(formData.get("name") ?? ""), email, password })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong.");
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink(form: HTMLFormElement | null) {
    const email = form ? String(new FormData(form).get("email") ?? "") : "";
    if (!email) return setError("Enter your email first.");
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    if (error) return setError(error.message ?? "Could not send the link.");
    setNotice(`We sent a sign-in link to ${email}.`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{mode === "sign-up" ? "Create your account" : "Sign in"}</h1>
      <form action={onSubmit} className="space-y-4">
        {mode === "sign-up" && (
          <Field label="Name">
            <Input name="name" required autoComplete="name" />
          </Field>
        )}
        <Field label="Work email">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-600">{notice}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
        {mode === "sign-in" && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={(e) => sendMagicLink(e.currentTarget.form)}
          >
            Email me a sign-in link
          </Button>
        )}
      </form>
      {googleEnabled && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
        >
          Continue with Google
        </Button>
      )}
      <p className="text-center text-sm text-muted">
        {mode === "sign-up" ? (
          <>
            Already have an account? <Link className="text-brand" href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </>
        ) : (
          <>
            New to Clicky? <Link className="text-brand" href={`/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </>
        )}
      </p>
    </div>
  );
}
