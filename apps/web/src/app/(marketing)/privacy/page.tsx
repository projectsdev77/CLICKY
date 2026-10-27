import type { Metadata } from "next";
import { DraftNotice, Prose } from "../prose";

export const metadata: Metadata = { title: "Privacy · Clicky" };

export default function PrivacyPage() {
  return (
    <Prose>
      <h1>Privacy policy</h1>
      <DraftNotice />
      <h2>Who we are</h2>
      <p>Clicky provides an in-app assistant that software companies (&quot;customers&quot;) add to their products.</p>
      <h2>Data we process for customers</h2>
      <p>
        When a customer&apos;s user talks to Clicky, we process the question, a masked description of the page, and the
        assistant&apos;s replies and actions, on the customer&apos;s behalf. Customers control retention and can delete data
        at any time.
      </p>
      <h2>Data about our customers</h2>
      <p>Account details (name, email), billing details (handled by Stripe), and how the dashboard is used.</p>
      <h2>Sub-processors</h2>
      <ul>
        <li>Anthropic (AI responses)</li>
        <li>Deepgram and ElevenLabs (speech)</li>
        <li>Stripe (payments), Resend (email), our hosting and database providers</li>
      </ul>
      <h2>Your rights</h2>
      <p>You can ask us to access, correct, export or delete your data. Contact privacy@clicky.local.</p>
    </Prose>
  );
}
