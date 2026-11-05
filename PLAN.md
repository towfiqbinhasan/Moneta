# Moneta — Plan & Data Schema

Moneta is a daily expense and budget tracker. It is local-first, works offline
as a PWA, supports every currency and any language, and can optionally sync
through Supabase.

## 1. Architecture

| Layer        | Choice                                  | Why |
|--------------|-----------------------------------------|-----|
| UI           | React 18 + TypeScript + Vite            | Fast SPA, static deploy |
| Styling      | Tailwind CSS 3 (CSS-variable accent color, `dark` class) | Theme color is user-editable at runtime |
| Storage      | IndexedDB via **Dexie** + `useLiveQuery` | Offline, reactive, large capacity |
| Sync (opt.)  | **Supabase** (email login, one generic `records` table, last-write-wins) | Works only when env keys are set; the app is fully usable without it |
| i18n         | i18next — en, bn, de, nb, hi built in + **user-made languages** stored in DB | Any language can be added or edited in-app, with an RTL flag |
| Charts       | Recharts                                | |
| Money format | Custom formatter: symbol, position, decimals, separators, **western / Indian (lakh-crore) / none** grouping, **digit style** (Latin, Bangla, Arabic-Indic, Devanagari) | |
| Currencies   | All ISO 4217 codes from `Intl.supportedValuesOf('currency')` + `Intl.DisplayNames` | Full world list, no hard-coded table to maintain |
| Rates        | open.er-api.com (free, no key), cached in DB, manual override per currency | Offline fallback = last cached / manual |
| PWA          | vite-plugin-pwa (auto-update SW, offline cache) | |
| Export       | CSV, XLSX (write-excel-file), PDF (print-ready report → "Save as PDF", which supports every script, e.g. Bangla), JSON backup/restore | |

## 2. Folder structure

```
src/
  main.tsx, App.tsx            entry, router, gates (setup wizard, lock screen)
  index.css                    Tailwind + theme variables
  db/
    types.ts                   ← data schema (TypeScript)
    db.ts                      Dexie database + table definitions
    repo.ts                    CRUD helpers (timestamps, tombstones, undo)
    defaults.ts                default categories, presets, countries
    demo.ts                    demo/sample data generator
  lib/
    currency.ts                ISO list, symbols, decimals
    format.ts                  money / number / digit / date formatting
    rates.ts                   fetch + convert exchange rates
    period.ts                  day/week/month/year ranges (month start day, week start)
    stats.ts                   balances, totals, budgets, goals, insights, health score
    recurring.ts               generate due recurring transactions
    export.ts                  CSV / XLSX / PDF / JSON backup
    notify.ts                  daily + bill reminders
    lock.ts                    PIN hash + WebAuthn biometric
    sync.ts                    Supabase sync
    confetti.ts, icons.tsx, utils.ts
  i18n/  index.ts + locales/{en,bn,de,nb,hi}.ts
  hooks/ useSettings.ts, useData.ts, useMoney.ts
  components/                  shared UI (Sheet, Numpad, pickers, ProgressRing, Toast…)
  features/
    setup/  dashboard/  transactions/  accounts/  categories/  budgets/
    goals/  reports/  debts/  split/  bills/  trips/  recurring/  settings/  lock/
supabase/schema.sql            table + row-level security for cloud sync
```

## 3. Data schema

All records have `id: string` (uuid), `createdAt`, `updatedAt` (epoch ms).
Deletions write a **tombstone** so that cloud sync can propagate them.
Amounts are stored in the record's own currency as plain decimal numbers.

| Table | Key fields |
|-------|------------|
| **transactions** | `type: expense\|income\|transfer`, `amount`, `currency`, `accountId`, `toAccountId?`, `toAmount?` (cross-currency transfer), `categoryId?`, `date` (ISO local `yyyy-MM-ddTHH:mm`), `note`, `tags[]`, `receipt?` (compressed data-URL), `tripId?`, `recurringId?` |
| **categories** | `name`, `kind: expense\|income`, `icon`, `color`, `parentId?` (subcategory), `order` |
| **accounts** | `name`, `kind: cash\|bank\|card\|wallet\|other`, `currency`, `openingBalance`, `icon`, `color`, `order`, `archived`, `includeInTotal` |
| **budgets** | `name`, `period: daily\|weekly\|monthly\|yearly`, `amount`, `currency`, `categoryIds[]` (empty = overall), `rollover`, `alertPercent` |
| **goals** | `name`, `target`, `currency`, `deadline?`, `icon`, `color`, `milestones[]` (already celebrated) |
| **goalEntries** | `goalId`, `amount` (+ deposit / − withdraw), `date`, `note` |
| **debts** | `direction: owe\|owed`, `person`, `amount`, `currency`, `dueDate?`, `note`, `payments[]{id,amount,date}`, `remind` |
| **bills** | `name`, `amount`, `currency`, `categoryId`, `accountId`, `dueDate`, `repeat: none\|weekly\|monthly\|yearly`, `remindDaysBefore`, `lastPaid?` |
| **recurring** | template fields + `frequency: daily\|weekly\|monthly\|yearly`, `interval`, `nextDate`, `endDate?`, `active` |
| **templates** | `name` + transaction template fields, `uses` |
| **splits** | `title`, `total`, `currency`, `date`, `participants[]{name, share, paid}` |
| **trips** | `name`, `currency`, `budget`, `startDate`, `endDate`, `active` |
| **rates** | `code` (PK), `perUsd` (from the API), `manualPerBase?` (user override: 1 CODE = x base), `updatedAt` |
| **languages** | `code` (PK), `name`, `dir: ltr\|rtl`, `strings{}` (custom language or overrides of a built-in one) |
| **settings** | singleton `id='app'`: language, country, baseCurrency, number format, digit style, currency format overrides, date format, week start, month start day, theme, accent, dashboard widgets (order + visibility), lock, reminders, active trip, sync state |
| **tombstones** | `key` = `table:id`, `table`, `recordId`, `deletedAt` |

Supabase: one table `records(user_id, tbl, id, data jsonb, updated_at, deleted)`
with RLS `user_id = auth.uid()`. Sync pushes rows changed since the last sync and
pulls newer remote rows. If both sides changed a record, the newer `updatedAt` wins.

## 4. Key behaviours
- **Under-5-second add:** the FAB opens a bottom sheet with the numpad ready. It
  remembers the last account, shows big category tiles, and offers one-tap templates.
  Supports `+ −` arithmetic.
- **Budget colors:** green < alert% (default 80) ≤ yellow < 100% ≤ red.
  Rollover carries unused amounts forward from previous periods.
  The suggestion line reads: "You can spend X/day for the remaining N days".
- **Goals:** progress ring, estimated finish date (from the average saving pace),
  per-day amount needed to hit the deadline, and confetti at 25/50/75/100 %.
- **Health score (0–100):** savings rate 40 + budget adherence 30 + spending
  stability 15 + debt load 15.
- **Trip mode:** while a trip is active, new entries default to the trip currency
  and get the trip tag, and the trip has its own budget.

## 5. Known platform limits (honest notes)
- Browsers cannot schedule notifications when the app is fully closed unless a
  push server is used. Reminders fire while the app or its installed PWA is open
  or in the background, and are always shown as in-app alerts on next open.
- Biometric lock uses WebAuthn's platform authenticator as a local gate. It is
  not encryption of the data at rest.
- Receipt photos are compressed to roughly 1024 px JPEG.
