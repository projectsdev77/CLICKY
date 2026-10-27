import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Prose } from "../prose";

export const metadata: Metadata = { title: "Docs · Clicky" };

export default function DocsPage() {
  const app = env.APP_URL;
  return (
    <Prose>
      <h1>Install Clicky</h1>
      <p>Clicky runs in your users&apos; browsers. You add it once; everything else is set in the dashboard.</p>

      <h2>1. Add your website</h2>
      <p>
        In the dashboard, open your project&apos;s <strong>Install</strong> page and list the websites your app runs on
        (for example <code>https://app.acme.com</code>, or <code>*.acme.com</code> for every subdomain). Clicky refuses to
        load anywhere else, so your project key is safe to put in your HTML.
      </p>

      <h2>2. Add the script</h2>
      <p>Paste this before the closing <code>&lt;/body&gt;</code> tag on every page:</p>
      <pre>
        <code>{`<script src="${app}/sdk/v1/clicky.js" data-key="pk_your_project_key" async></script>`}</code>
      </pre>
      <p>Or, in a bundled app:</p>
      <pre>
        <code>{`npm install @clicky/sdk

import { Clicky } from "@clicky/sdk";

Clicky.init({ projectKey: "pk_your_project_key", apiUrl: "${app}" });`}</code>
      </pre>
      <p>The Install page shows a green check as soon as Clicky loads on one of your websites.</p>

      <h2>3. Teach it your product</h2>
      <p>
        On the <strong>Knowledge</strong> page, add your help center&apos;s address (Clicky reads up to 30 pages under it) or
        paste articles. Clicky also reads the page your user is on every time they ask.
      </p>

      <h2>JavaScript API</h2>
      <table>
        <thead>
          <tr>
            <th>Call</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>Clicky.identify(&#123; userId, traits &#125;)</code>
            </td>
            <td>Tells Clicky who the user is, so their conversations show under their id. Traits are optional key/values (plan, role).</td>
          </tr>
          <tr>
            <td>
              <code>Clicky.track(name, props)</code>
            </td>
            <td>Records a custom event for your analytics.</td>
          </tr>
          <tr>
            <td>
              <code>Clicky.open()</code>
            </td>
            <td>Opens the Clicky panel, e.g. from your own &quot;Help&quot; button.</td>
          </tr>
          <tr>
            <td>
              <code>Clicky.ask(question)</code>
            </td>
            <td>Asks a question as if the user typed it.</td>
          </tr>
          <tr>
            <td>
              <code>Clicky.destroy()</code>
            </td>
            <td>Removes Clicky from the page (e.g. on sign-out).</td>
          </tr>
        </tbody>
      </table>
      <p>
        With the script tag, the same API is on <code>window.Clicky</code>.
      </p>

      <h2>Privacy controls in your HTML</h2>
      <table>
        <tbody>
          <tr>
            <td>
              <code>data-clicky-mask</code>
            </td>
            <td>Clicky sees the element exists but never its contents (shows <code>[masked]</code>).</td>
          </tr>
          <tr>
            <td>
              <code>data-clicky-ignore</code>
            </td>
            <td>Clicky doesn&apos;t see the element or anything inside it, and can&apos;t act on it.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Passwords, payment-card fields and one-time codes are always masked, and Clicky never types into them. Emails, phone
        numbers and card numbers in page text are masked by default. You can add CSS selectors to mask in Settings.
      </p>

      <h2>Controlling what Clicky does</h2>
      <ul>
        <li>
          <strong>Guide only</strong>: Clicky explains and points but never clicks or types.
        </li>
        <li>
          <strong>Pages where Clicky must not act</strong>: paths like <code>/billing</code> or <code>/admin/**</code>.
        </li>
        <li>
          <strong>Always ask before</strong>: words that make Clicky ask the user first (it already asks before deleting,
          paying, sending and similar).
        </li>
      </ul>

      <h2>Content Security Policy</h2>
      <p>If your app sends a CSP header, allow:</p>
      <pre>
        <code>{`script-src ${app};
connect-src ${app} wss://api.deepgram.com;
media-src blob:;`}</code>
      </pre>

      <h2>Browser support</h2>
      <p>
        The last two versions of Chrome, Edge, Safari and Firefox. Voice input uses streaming speech recognition, or the
        browser&apos;s own where available.
      </p>
    </Prose>
  );
}
