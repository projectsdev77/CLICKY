import { useEffect, useState, type ReactNode } from "react";

/**
 * A small fake SaaS app ("Acme Analytics") used to develop and test Clicky.
 * It has the kinds of things Clicky needs to handle: SPA navigation, tables,
 * forms with validation, a destructive action, and a payment form.
 */

type Route = "/" | "/reports" | "/settings" | "/billing";
const NAV: { path: Route; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/reports", label: "Reports" },
  { path: "/settings", label: "Settings" },
  { path: "/billing", label: "Billing" },
];

function useRoute(): [Route, (to: Route) => void] {
  const current = () => (NAV.some((n) => n.path === location.pathname) ? (location.pathname as Route) : "/");
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const onPop = () => setRoute(current());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate = (to: Route) => {
    history.pushState(null, "", to);
    setRoute(to);
  };
  return [route, navigate];
}

export function App() {
  const [route, navigate] = useRoute();
  return (
    <div className="shell">
      <aside>
        <div className="logo">Acme Analytics</div>
        <nav>
          {NAV.map((n) => (
            <a
              key={n.path}
              href={n.path}
              className={route === n.path ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                navigate(n.path);
              }}
            >
              {n.label}
            </a>
          ))}
          <a href="/help/index.html" target="_blank" rel="noreferrer">
            Help center ↗
          </a>
        </nav>
      </aside>
      <main>
        {route === "/" && <Dashboard />}
        {route === "/reports" && <Reports />}
        {route === "/settings" && <Settings />}
        {route === "/billing" && <Billing />}
      </main>
    </div>
  );
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1>{title}</h1>
      {children}
    </>
  );
}

function Dashboard() {
  const stats = [
    ["Visitors", "12,480"],
    ["Signups", "342"],
    ["Conversion", "2.7%"],
    ["MRR", "$18,200"],
  ];
  return (
    <Page title="Dashboard">
      <div className="stats">
        {stats.map(([label, value]) => (
          <div key={label} className="card">
            <div className="muted">{label}</div>
            <div className="big">{value}</div>
          </div>
        ))}
      </div>
      {/* A plain link (full page load), so agent runs that navigate can be tested. */}
      <p>
        <a href="/reports">View all reports</a>
      </p>
    </Page>
  );
}

const REPORTS = [
  { id: 1, name: "Weekly traffic", owner: "Dana", updated: "2026-10-12" },
  { id: 2, name: "Signup funnel", owner: "Sam", updated: "2026-10-10" },
  { id: 3, name: "Churn by plan", owner: "Dana", updated: "2026-09-28" },
];

/** The Clicky script loads async; wait for window.Clicky, then register. */
function useClickyAction(name: string, info: object, handler: (args: Record<string, unknown>) => unknown) {
  useEffect(() => {
    type ClickyApi = { registerAction(n: string, i: object, h: typeof handler): () => void };
    let unregister: (() => void) | undefined;
    const timer = setInterval(() => {
      const clicky = (window as unknown as { Clicky?: ClickyApi }).Clicky;
      if (!clicky) return;
      clearInterval(timer);
      unregister = clicky.registerAction(name, info, handler);
    }, 100);
    return () => {
      clearInterval(timer);
      unregister?.();
    };
    // Registered once per mount; the handler reads state through setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}

function Reports() {
  const [reports, setReports] = useState(REPORTS);
  const [format, setFormat] = useState("csv");
  const [message, setMessage] = useState("");
  // Lets Clicky export directly instead of clicking through the form.
  useClickyAction(
    "exportReports",
    {
      description: "Export every report in the table as a file.",
      parameters: { properties: { format: { type: "string", enum: ["csv", "xlsx", "pdf"] } }, required: ["format"] },
    },
    ({ format: f }) => {
      setFormat(String(f));
      setMessage(`Exported ${REPORTS.length} reports as ${String(f).toUpperCase()} (via app action).`);
      return { exported: REPORTS.length, format: f };
    },
  );
  return (
    <Page title="Reports">
      <div className="toolbar">
        <label>
          Export format{" "}
          <select value={format} onChange={(e) => setFormat(e.target.value)} name="export-format">
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <button onClick={() => setMessage(`Exported ${reports.length} reports as ${format.toUpperCase()}.`)}>
          Export
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.owner}</td>
              <td>{r.updated}</td>
              <td>
                <button className="danger" onClick={() => setReports((all) => all.filter((x) => x.id !== r.id))}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}

function Settings() {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  return (
    <Page title="Settings">
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const tz = String(data.get("timezone"));
          if (!tz) return setError("Choose a timezone.");
          setError("");
          setSaved(true);
          // Tell Clicky (analytics + onboarding checklists).
          (window as unknown as { Clicky?: { track(name: string): void } }).Clicky?.track("settings_saved");
        }}
      >
        <label>
          Display name
          <input name="name" defaultValue="Jordan Lee" />
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue="jordan@acme.test" />
        </label>
        <label>
          Timezone
          <select name="timezone" defaultValue="">
            <option value="">Select…</option>
            <option>America/New_York</option>
            <option>Europe/London</option>
            <option>Africa/Addis_Ababa</option>
          </select>
        </label>
        <label className="row">
          <input type="checkbox" name="digest" defaultChecked /> Send me a weekly email digest
        </label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="notice">Settings saved.</p>}
        <button type="submit">Save changes</button>
      </form>
    </Page>
  );
}

function Billing() {
  const [plan, setPlan] = useState("Starter");
  return (
    <Page title="Billing">
      <div className="card">
        <p>
          Current plan: <strong>{plan}</strong>
        </p>
        <div className="toolbar">
          {["Starter", "Growth", "Scale"].map((p) => (
            <button key={p} disabled={p === plan} onClick={() => setPlan(p)}>
              Switch to {p}
            </button>
          ))}
        </div>
      </div>
      <form className="card form" onSubmit={(e) => e.preventDefault()}>
        <h2>Payment method</h2>
        <label>
          Card number
          <input name="card" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" />
        </label>
        <label>
          Expiry
          <input name="expiry" autoComplete="cc-exp" placeholder="MM/YY" />
        </label>
        <button type="submit">Update card</button>
      </form>
    </Page>
  );
}
