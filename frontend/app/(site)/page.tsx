import Link from 'next/link';
import {
  Package,
  Truck,
  Users,
  Receipt,
  Sparkle,
  ArrowRight,
  Check,
} from '@phosphor-icons/react/dist/ssr';

const OPERATIONAL_FEATURES = [
  {
    icon: Package,
    title: 'Products & inventory',
    desc: 'One catalogue for every SKU, variant, and price — no more spreadsheets that fall out of sync.',
  },
  {
    icon: Receipt,
    title: 'Orders & fulfilment',
    desc: 'From order placed to payment received, tracked in one place your whole team can see.',
  },
  {
    icon: Truck,
    title: 'Delivery tracking',
    desc: 'Know where every delivery is, and get notified the moment one falls behind.',
  },
  {
    icon: Users,
    title: 'Customer records',
    desc: 'Every order, every conversation, every customer — searchable in seconds.',
  },
];

const AI_CAPABILITIES = [
  {
    title: 'Demand forecasting',
    desc: 'Predicts what you\u2019ll sell next month from your own order history — no manual guesswork.',
  },
  {
    title: 'Reorder alerts, in advance',
    desc: 'Flags stock that will run low before it happens, not after a customer is already waiting.',
  },
  {
    title: 'Revenue projection',
    desc: 'Turns this month\u2019s trend into a realistic forecast for the next one, updated daily.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Add your products',
    desc: 'Bring in your catalogue — import a spreadsheet or add items one by one.',
  },
  {
    n: '02',
    title: 'Run your business as usual',
    desc: 'Take orders, manage deliveries, and log customers the way you already do.',
  },
  {
    n: '03',
    title: 'Get ahead of what\u2019s next',
    desc: 'Mero Udhyog turns that activity into forecasts, alerts, and reports automatically.',
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* HERO */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)] sm:text-5xl">
            Run your business on what happens next, not just what already happened.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-[var(--muted)]">
            Mero Udhyog brings your products, orders, deliveries, and customers into one
            workspace — then predicts your demand and revenue before you have to ask.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Start free
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-5 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-1)]"
            >
              Log in
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--muted)]">
            <span>One workspace for the whole team</span>
            <span>Live, not batch-updated</span>
            <span>Built for how Nepali businesses actually sell</span>
          </div>
        </div>

        {/* Live-styled preview panel, not a browser-chrome screenshot */}
        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[28px] bg-accent-100/60" />
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42_/_0.04)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">This month</p>
                <p className="text-xs text-[var(--muted)]">Updated a moment ago</p>
              </div>
              <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
                On track
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[var(--surface-1)] p-3">
                <p className="text-xs text-[var(--muted)]">Revenue</p>
                <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">₹12.4L</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-1)] p-3">
                <p className="text-xs text-[var(--muted)]">Orders</p>
                <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">342</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-accent-300 bg-accent-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-700">
                <Sparkle size={13} weight="fill" />
                Predicted next month
              </div>
              <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">₹14.1L revenue</p>
              <p className="text-xs text-[var(--muted)]">+13.7% based on your last 90 days</p>
            </div>
          </div>
        </div>
      </section>

      {/* OPERATIONAL FEATURES */}
      <section id="features" className="border-t border-[var(--border)] bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              Everything you already do, finally in one place
            </h2>
            <p className="mt-3 text-[var(--muted)]">
              Products, orders, deliveries, and customers — connected, so a change in one
              shows up everywhere else instantly.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OPERATIONAL_FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-[var(--border)] p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <f.icon size={20} weight="bold" />
                </div>
                <h3 className="mt-4 font-medium text-[var(--foreground)]">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI PREDICTIONS — the one bold moment on the page */}
      <section id="ai-predictions" className="bg-brand-700 py-20 text-white">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent-200">
                <Sparkle size={13} weight="fill" />
                AI predictions
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Your data has been telling you what\u2019s coming. Now it says so out loud.
              </h2>
              <p className="mt-4 max-w-md text-white/70">
                Every order and delivery you log trains a forecast built only on your own
                numbers — not industry averages that don\u2019t know your business.
              </p>
              <div className="mt-8 flex flex-col gap-5">
                {AI_CAPABILITIES.map((c) => (
                  <div key={c.title} className="flex gap-3">
                    <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-accent-300" />
                    <div>
                      <p className="font-medium">{c.title}</p>
                      <p className="mt-0.5 text-sm text-white/65">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Forecast visual: actuals as solid, prediction as dashed continuation */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm font-medium text-white/80">Revenue — actual vs. predicted</p>
              <svg viewBox="0 0 400 180" className="mt-4 w-full">
                <line x1="0" y1="150" x2="400" y2="150" stroke="rgba(255,255,255,0.12)" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.12)" />
                <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.12)" />
                <path
                  d="M0 130 L60 118 L120 122 L180 90 L240 75"
                  fill="none"
                  stroke="#ffbf4d"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M240 75 L300 55 L360 35 L400 25"
                  fill="none"
                  stroke="#ffbf4d"
                  strokeWidth="3"
                  strokeDasharray="2 8"
                  strokeLinecap="round"
                />
                <circle cx="240" cy="75" r="4" fill="#ffbf4d" />
                <line x1="240" y1="10" x2="240" y2="170" stroke="rgba(255,255,255,0.2)" strokeDasharray="3 4" />
                <text x="246" y="20" fill="rgba(255,255,255,0.55)" fontSize="11">
                  today
                </text>
              </svg>
              <div className="mt-2 flex items-center gap-4 text-xs text-white/55">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-accent-300" /> Actual
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 border-t-2 border-dashed border-accent-300" /> Predicted
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — a genuine sequence, so numbering earns its place */}
      <section id="how-it-works" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Up and running the same day
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span className="text-sm font-semibold text-accent-600">{step.n}</span>
                <h3 className="mt-2 text-lg font-medium text-[var(--foreground)]">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[var(--border)] py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Bring your business into Mero Udhyog
            </h2>
            <p className="mt-2 text-[var(--muted)]">Free to start. No card required.</p>
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Create your workspace
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}