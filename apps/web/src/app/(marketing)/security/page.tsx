import type { Metadata } from "next";
import { Prose } from "../prose";

export const metadata: Metadata = { title: "Security · Clicky" };

export default function SecurityPage() {
  return (
    <Prose>
      <h1>Security and privacy</h1>
      <p>Clicky lives inside your product, so we&apos;ve designed it to see as little as possible and to never act behind your users&apos; backs.</p>

      <h2>What Clicky sees</h2>
      <ul>
        <li>Only when someone asks a question: a text description of the page they&apos;re on (buttons, fields, headings, visible text).</li>
        <li>Passwords, payment fields, one-time codes and anything you mark private are masked in the browser before anything is sent.</li>
        <li>Emails, phone numbers and card numbers in page text are masked by default.</li>
        <li>No screenshots, no session recordings, no keystroke logging. Voice audio is turned into text and not stored.</li>
      </ul>

      <h2>What Clicky stores</h2>
      <ul>
        <li>Conversation text, the page path it happened on, and the steps Clicky took, so your team can review them.</li>
        <li>Lightweight usage signals (page views, rage clicks, form errors) with page paths and element names, never field values. Can be switched off per project.</li>
      </ul>

      <h2>How Clicky acts</h2>
      <ul>
        <li>In the user&apos;s own browser session, with their own permissions. Clicky never holds credentials for your app.</li>
        <li>Every step is visible, and anything that deletes, pays, sends or can&apos;t be undone needs the user&apos;s OK.</li>
        <li>You can block pages, add confirmation words, or turn actions off entirely.</li>
      </ul>

      <h2>Infrastructure</h2>
      <ul>
        <li>All traffic is encrypted in transit (TLS). Each project key only works on the websites you list.</li>
        <li>Every customer&apos;s data is isolated by project and organization on every request.</li>
        <li>AI responses come from Anthropic&apos;s Claude API; speech from Deepgram and ElevenLabs. They process requests on our behalf.</li>
      </ul>

      <h2>Compliance</h2>
      <p>
        Clicky is not yet SOC 2 certified. We&apos;re building toward it, and a data processing agreement is available on request.
        Report security issues to <a className="text-brand-ink" href="mailto:security@clicky.local">security@clicky.local</a>.
      </p>
    </Prose>
  );
}
