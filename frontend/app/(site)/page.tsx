import Link from "next/link";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1"
).replace(/\/api\/v1$/, "");

async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false, body: `HTTP ${res.status}` };
    const body = (await res.json()) as { status?: string; service?: string };
    return { ok: true, body: `${body.service} · ${body.status}` };
  } catch {
    return { ok: false, body: "unreachable" };
  }
}

export default async function Home() {
  const health = await checkBackend();

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Factory OS
        </h1>
        <p className="text-lg leading-8 text-zinc-600">
          Audit assistance and financial intelligence for small and medium
          factories. Turn raw sales, purchase and expense data into reliable,
          explainable reports — not a replacement for a licensed auditor.
        </p>
        <p className="text-sm text-zinc-500">
          Phase 1 foundation: FastAPI backend + multi-tenant PostgreSQL is live.
          This frontend scaffold connects to it over cookie-based auth.
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Backend status
        </h2>
        <p className="mt-2 text-base text-zinc-700">
          <span
            className={
              health.ok
                ? "inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 align-middle"
                : "inline-block h-2.5 w-2.5 rounded-full bg-rose-500 align-middle"
            }
          />
          <span className="ml-2 align-middle">
            {health.ok ? `Online — ${health.body}` : `Offline — ${health.body}`}
          </span>
        </p>
        <a
          href={`${API_BASE}/docs`}
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Open API docs →
        </a>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/register"
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h3 className="font-semibold">Create a tenant</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Sign up a new organisation to start managing your product catalogue.
          </p>
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h3 className="font-semibold">Log in</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Access your existing workspace using your account.
          </p>
        </Link>
        <Link
          href="/products"
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h3 className="font-semibold">Browse products</h3>
          <p className="mt-1 text-sm text-zinc-600">
            View (and, with the right role, manage) product variants and prices.
          </p>
        </Link>
      </section>
    </div>
  );
}
