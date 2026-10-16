import { Suspense } from "react";
import { googleEnabled } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
