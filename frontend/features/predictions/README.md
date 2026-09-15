# Predictions feature

Read this if you open `frontend/features/predictions/` and feel lost. It explains what the
feature does, what every file is for, and how the pieces fit together — in plain words.

## What this feature is

The Predictions page answers one business question the sales team cares about:

> **For each customer you already sell to, when will they order again, and should we call or message them?**

It is **not** AI and it is **not** machine learning. It is simple statistics
(for every customer + product pair) over the gaps between that customer's past orders:

- **Average gap** — how many days usually pass between this customer's orders of a product.
- **Variability** — how regular that gap is (regular = predictable = worth acting on).
- **Next predicted date** — last order date + the average gap.
- **Interest score (0–100)** — a single number mixing three things:
  - *Recency (40%)* — how close the expected next order is.
  - *Frequency (30%)* — how often they order (more orders = more business).
  - *Consistency (30%)* — how regular their cadence is.
- **Status** — one of four buckets:
  - `on_track` — ordering on their usual schedule (nothing to do).
  - `due_soon` — likely to reorder within days.
  - `overdue` — past their usual reorder time.
  - `insufficient_data` — not enough history yet to predict.
- **Recommendation** — `call` (overdue + can trust the forecast), `message`
  (overdue but shaky, or due soon), or `wait`.

The math lives **on the backend** (`backend/app/modules/predictions/engine.py`, documented
in detail there). This folder is only the **frontend** that displays it.

## Folder map

```
features/predictions/
├── README.md          ← you are here
├── constants.ts       ← shared labels, colors, and sort order for statuses
├── api.ts             ← TypeScript types + data-fetching hooks (React Query)
└── components/
    ├── PredictionsPage.tsx        ← the whole dashboard (main screen)
    ├── AddOrdersModal.tsx        ← "Add order history" dialog (starts it)
    ├── CsvEntryPanel.tsx        ← the CSV-upload tab inside that dialog
    ├── PredictionSummary.tsx     ← one-line human sentence per row/pair
    ├── CustomerOverview.tsx      ← the Summary tab briefing (hero + KPIs + status + focus)
    ├── ProductOverview.tsx       ← the product Summary tab briefing (owner view)
    ├── CustomerPredictionCard.tsx  ← mobile card for one customer
    ├── ProductPredictionCard.tsx   ← mobile card for one product
    ├── RecommendationAction.tsx  ← Call / Message / Wait button
    ├── InterestBadge.tsx         ← small interest-score badge
    ├── ConfidenceBadge.tsx       ← High/Medium/Low confidence badge
    ├── StatusLegend.tsx          ← legend that explains the 4 statuses
    └── TableFilterBar.tsx        ← search box + status filter + clear button
```

The two **pages** live under `app/(dashboard)/predictions/`:

- `predictions/page.tsx` — thin wrapper that renders `PredictionsPage`.
- `predictions/customers/[id]/page.tsx` — a customer's detail screen (per-product breakdown).
- `predictions/products/[id]/page.tsx` — a product's detail screen (per-customer breakdown, owner view).

## Data & API layer

### `constants.ts`
The 4 statuses are defined once here so every file agrees:

- `STATUS_COLORS` — colour for each status (green / amber / red / grey).
- `STATUS_LABELS` — human label ("On track", "Due soon", "Overdue", "Needs data").
- `STATUS_ORDER` — sort order used in lists (overdue first, then due soon, etc.).
- `STATUS_EXPLAIN` — one-line plain-English explanation shown in the legend.

### `api.ts`
Defines the TypeScript **types** matching the backend response
(`Analysis`, `CustomerPrediction`, `PredictionProduct`, `ProductAggregate`, etc.) and the
**React Query hooks**:

| Hook | What it does |
|---|---|
| `useAnalysis()` | Loads the whole dashboard payload from `GET /predictions/analysis`. |
| `useCustomerPrediction(id)` | Loads one customer's detail page. |
| `useProductPrediction(id)` | Loads one product's detail page (`GET /predictions/products/{id}`). |
| `useAddOrderHistory()` | Saves manually entered order dates (`POST /predictions/history`). |
| `useImportOrderHistory()` | Uploads a CSV of order dates (`POST /predictions/import`). |
| `useClearHistory()` | Deletes all history added through this page (`DELETE /predictions/history`). |
| `useMarkContacted()` | **UI-only stub** — marks a customer "contacted" locally. No backend endpoint yet (see its doc comment). |

All mutations invalidate every predictions query on success, so the dashboard re-fetches.

## The main dashboard — `PredictionsPage.tsx`

This is the big one. It loads `useAnalysis()` and renders:

1. **Header** — title + buttons: *Export CSV*, *Refresh*, *Add order history*.
2. **4 KPI cards** — customers to reorder, next orders in 30 days, average interest, analysed products.
3. **A "still learning" tip** — shown when >50% of customers lack enough history to predict.
4. **Two tabs**: **"By customer"** (first, default) and **"By product"** — the owner-facing view.

For each tab:

- A `StatusLegend` explains the colours.
- A `TableFilterBar` filters by text search + status.
- **On desktop** — a `DataTable` (columns are defined in this file) plus a chart:
  - *Customer tab*: pie chart "Customers by status" on the right of the customer table.
  - *Product tab*: **table on the left (2/3)** with a stacked bar chart
    "Customer re-orders per product" on the right (1/3).
- **On mobile** — instead of a table, cards (`ProductPredictionCard` / `CustomerPredictionCard`).
- **Export CSV** — downloads the currently filtered rows, in the tab you're on.

Data prep inside the component is all `useMemo`:

- `customers` / `products` — sorted by status (overdue first), then interest / customer count.
- `filteredCustomers` / `filteredProducts` — apply search + status filter.
- `customerStatusPie` / `productChartData` — derived chart data.

The `contacted` map is local state: once you mark a customer contacted, their row dims and a
"Contacted <date>" badge replaces the recommendation action. Toggling works both ways.

At the bottom there is a small, subtle **"Clear added history"** button (with a confirm step).

### DataTable columns

- **By customer**: Customer (name + email + sentence), Orders, Products, Last order, Next order,
  Interest, Status, Recommended.
- **By product** (owner view): Product (name + SKU + sentence), Customers, Orders,
  **Restock urgency** (coloured chip: "restock now" when overdue, "in ~Nd" when close,
  "needs data" without a forecast), **Est. value** (`estimated_revenue` from the backend: sum of
  `avg qty × order count × unit price` over priced customers), Demand (interest), **Opportunity**
  (Invest / Hold / Watch by interest threshold), "Customers needing action" badges.

Charts and captions always say what to *do* next — captions come from the status/interest data
(e.g. "X is already overdue — restock now"), never raw numbers alone.

## The recommendation button — `RecommendationAction.tsx`

Turns the `recommendation` string into something actionable:

- `call` → a red **Call** button (`tel:` link) using the customer's phone; grey badge if no phone.
- `message` → a **Message** button (`mailto:` link with a subject like
  "Following up on your <product> order"); grey badge if no email.
- `wait` → a plain grey **Wait** badge.
- `phone`/`email` are passed in by the parent; `productName` personalises the email subject.

## The plain-language summary — `PredictionSummary.tsx`

This is the single source of truth for the **one-line sentence** under each row / at the top of
the detail page. Read the big comment at the top of the file before editing it — the rules for
the wording live there (e.g. "every ~3 weeks", "fairly consistent about it" only for
`confidence: high`, quantity trend only mentioned when it's up/down, recommendations worded as
"worth a call / a message").

Also exports:

- `buildPredictionSentence(input)` — the actual sentence builder.
- `pickTopProduct(customer)` — the customer's most-interesting product (used to personalise
  emails and pick which product's gap to talk about).
- `customerSummaryInput()` / `productSummaryInput()` — adapt the two data shapes into one
  `SummaryInput` used by the builder.
- Default component `<PredictionSummary customer|product size>` — renders the text.

## Small display components

- `StatusBadge` (shared, `@/components/shared`) — coloured status pill.
- `InterestBadge.tsx` — shows the 0–100 score: green ≥70, amber ≥40, grey below.
- `ConfidenceBadge.tsx` — High / Medium / Low with different icons (only shown where the backend
  returns per-pair confidence, e.g. the customer detail page and mobile cards).
- `StatusLegend.tsx` — the 4 coloured dots + one-line meanings at the top of each tab.
- `TableFilterBar.tsx` — search input (debounced 300 ms) + status `SegmentedControl` +
  "Clear filters" link + "Showing X of Y" count.

## Mobile cards

Used on small screens instead of wide tables:

- `CustomerPredictionCard.tsx` — tappable card (opens the detail page): name, status pill,
  summary sentence, interest + confidence badges, recommendation button, "Mark as contacted"
  toggle. Left edge is coloured by status.
- `ProductPredictionCard.tsx` — same idea for a product: name, SKU, summary, per-status customer
  count badges, interest + customer count, recommendation badge.

## Adding order history

Opened by the *Add order history* button; it's a modal with two tabs:

### `AddOrdersModal.tsx` — Manual entry tab
1. Pick a **product** (and a **variant** if the product has more than one).
2. Pick a **customer**.
3. Add one or more **(date, quantity)** rows.
4. Save → `useAddOrderHistory()`.

These dates are merged with the tenant's real orders, then predictions/recommendations update.

### `CsvEntryPanel.tsx` — Bulk CSV tab
Same product/customer pickers, then choose a CSV. The CSV needs **only** `order_date` and
`quantity` columns (the product/customer are chosen in the UI, not in the file). It offers a
*Download sample file* button and shows per-row errors without blocking good rows.

## Customer detail page — `app/(dashboard)/predictions/customers/[id]/page.tsx`

Opened from the dashboard by clicking a customer. Shows:

- Back link, customer name + status, and the Call/Message button + "Mark as contacted".
- **Summary tab** — a single briefing built by `CustomerOverview.tsx`:
  - A **status-coded hero** (accent bar + icon + headline + plain-English takeaway).
  - 4 KPI tiles: Orders on file, Products tracked, Avg reorder gap, Next order expected.
  - **Where things stand** — a stacked distribution bar + legend of prediction status.
  - **Focus first** — the most urgent products, each tappable to open it in the Products tab.
- **Products tab** — a per-product table: product, orders, avg gap, avg qty, next order,
  interest, confidence, status, recommendation.
- **Trends tab** — only 2 charts:
  - **Reorder urgency** — predicted days until next order per product (coloured by status).
  - **Interest by product** — 0–100 interest bars.

Mouse behaviour: clicking a row in the customer table treats **just that cell** as a
different thing — read carefully. (No, everything else is normal.)

## Product detail page — `app/(dashboard)/predictions/products/[id]/page.tsx`

The **owner-facing** counterpart to the customer detail page (opened from the dashboard's
"By product" tab row action). Answers "is this product making money, and is it at risk?"

- Back link, product name + SKU + status, header shows **Est. value** (lifetime revenue estimate),
  plus an "Open in Products" shortcut and *Add order history* (product pre-scoped).
- **Summary tab** — an owner briefing built by `ProductOverview.tsx`:
  - A **status-coded hero** with a plain-English headline ("2 of 5 customers are overdue on this
    product — restock now") and the revenue takeaway.
  - 4 KPI tiles: Customers buying, Orders on file, **Est. value**, Next order expected.
  - **Where things stand** — how buyers split across prediction status (same stacked bar + legend
    as the customer page, driven by `overdue_count` / `due_soon_count` / `on_track_count` / `insufficient_count`).
  - **Focus first** — the most urgent buyers, each tappable (opens their customer page).
- **Customers tab** — per-customer table: customer, orders, avg gap, avg qty, next order,
  demand, confidence, status, recommendation. Row actions: *Add order history* (that customer +
  this product) and *View customer* (their detail page).
- **Trends tab** — 2 charts: reorder urgency by customer (coloured by status) and demand by customer.

All product-level numbers are the **same prediction model**, just bucketed per product:
next order = soonest across customers, interest = quantity-weighted average, status = the worst
of the customer pairs, recommendation = the strongest action. Saving order history here
re-fetches the whole dashboard (`invalidateQueries` on every predictions key).

## UI & design language (what we did visually)

The screens are styled with **Mantine** components + **Tailwind** classes, and a shared
theme (`frontend/lib/theme/theme.ts`). The predictions UI follows that design system and adds
a couple of domain-specific rules of its own.

### Colour system
- **Theme tokens**: `brand` (green), `accent` (amber/gold), `success`, `danger`, `warning`.
  Stat tiles and icon chips on the detail page use `bg-brand-50` / `bg-accent-50` /
  `bg-success-50` tokens instead of ad-hoc Tailwind tints (originally blue/violet/amber/emerald —
  unified so the whole app uses one palette).
- **Status colours** are semantic and defined **once** in `constants.ts`
  (green = on track, amber = due soon, red = overdue, grey = needs data). The *same* colour is
  reused everywhere so it always means the same thing:
  - legend dots (`StatusLegend`),
  - status pills (`StatusBadge`),
  - the 4px left-edge bar on mobile cards,
  - the coloured left accent column on table rows (`rowAccent`),
  - bar-chart bars and pie slices.
- **Fallback colour fix**: every place that fell back to `#6f4bff` (a stray purple) for an
  unknown status now falls back to `#f59e0b` (the amber accent) — so a state we don't recognise
  renders amber consistently everywhere instead of randomly purple.

### Cards, layout & responsiveness
- Data panels are white cards: `rounded-2xl border border-zinc-100 bg-white shadow-sm`.
- **Desktop** = wide tables + a chart sitting beside them (grid `xl:grid-cols-3`,
  table takes 2/3, chart takes 1/3).
- **Mobile** (<768px, checked via `useMediaQuery`) = tables disappear and are replaced by
  stacked tappable cards so nothing requires horizontal scrolling.
- Mobile cards are tappable (`cursor-pointer`, hover shadow, coloured left border); buttons
  inside them stop event propagation so clicking "Call"/"Message" doesn't navigate.

### Making the data readable at a glance
- **Human sentences, not raw numbers** — `PredictionSummary` turns the stats into one line of
  English ("orders every ~3 weeks and is fairly consistent about it"). Raw scores are never
  shown as bare numbers in the narrative.
- **Badges encode meaning** with both colour and icon:
  - `InterestBadge`: green ≥70, amber ≥40, grey below.
  - `ConfidenceBadge`: High = filled check circle, Medium = half circle, Low = empty circle.
  - Status pills: coloured by `STATUS_LABELS`.
- **Tooltips on dead-ends** — a "Call"/"Message" badge with a tooltip ("No phone number on
  file") when the action can't be taken, instead of a broken-looking button.
- Long names are `truncate`d; summary sentences in dense tables use `line-clamp-2`.

### Interaction patterns
- **Contacted workflow**: marking a customer contacted dims the row (`opacity-60`), replaces the
  recommendation with a "Contacted <date>" badge, and is toggleable from both the table's
  row-action menu and the mobile card (currently local-only, see `api.ts`).
- **Empty states are contextual**: with filters active → "No matches / Try a different search";
  with no filters → "No product predictions yet / Add order history or create confirmed orders".
- **Alerts** guide the user: a dismissible blue tip when >50% of customers still need data, a red
  error alert with a Retry button, and a confirm step before "Clear added history".
- **Charts** follow one style: rounded bars (`radius={[0,6,6,0]}`), right-aligned `3d`/`50`
  value labels, soft tooltips (`border-radius:12px`, light border + shadow), and bars/pies
  coloured by status.

## Common "I can't tell where this comes from" answers

- **"Why is everything 'Needs data'?"** — the pair has fewer than 2 orders, so there's no rhythm
  to measure. Add order history or log confirmed orders, then Refresh.
- **"Why did this customer's recommendation change?"** — it's recalculated every time you
  Refresh (`analysis.refetch()`), from order history in the DB.
- **"Where is the AI?"** — there isn't any. It's gap statistics.
- **"Why is 'Mark as contacted' lost after refresh?"** — the endpoint isn't implemented yet, so
  the flag only lives in the current page's local state (deliberate; see `api.ts` note).
- **"Why so many components?"** — every piece is small and single-purpose so it can be reused on
  both the dashboard and the detail page.