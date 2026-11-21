# Budget planner (All the Boring Stuff)

Local-first, UK-first "safe to spend" budget app. Full plan: docs/PLAN.md. Market research: docs/research.md.
The app ships to alltheboringstuff.co.uk/budget-planner/ through a pull request on the decision-tools repo.
Read decision-tools' CLAUDE.md and DESIGN.md before touching UI or anything that lands in that repo.

## Non-negotiables
- Never lose user data. Every change is written to IndexedDB in one transaction, together with its outbox entry, before the UI updates.
- Budget data never goes to our server. Sync goes only to the customer's own Google Drive or Dropbox. The only server call is the licence check.
- Premium code (the sync module, premium.js) is served by the decision-tools Worker after a licence check. It lands under worker/, never site/.
- Money is integer pence (type Pence = number). Never use floats for money.
- Dates are ISO 'YYYY-MM-DD' strings in Europe/London. Never use Date getters for calendar days.
- src/domain is pure: no DOM, no storage, no network. It is fully unit-tested.
- en-GB everywhere: £, dd/mm/yyyy, UK spelling.
- Simple mode stays simple: new screens go behind the advanced toggle unless docs/PLAN.md says otherwise.

## Layout
- src/domain     pure logic (recurrence, paydays, bank holidays, safe to spend, debt)
- src/storage    Dexie schema, repository, snapshots, backup, migrations
- src/sync       SyncProvider interface, Google Drive and Dropbox providers, merge, manifest (built into premium.js)
- src/licence    token storage and offline signature check
- src/ui         Preact screens and components
- e2e/           Playwright tests (chromium, webkit, firefox, mobile viewports)
- .github/workflows/publish.yml   opens the pull request on decision-tools

## Commands
- npm run dev | build | build:web | build:offline
- npm test (vitest) | npm run e2e (playwright) | npm run lint | npm run typecheck

## Workflow
- Work one phase at a time from docs/PLAN.md; open one PR per phase.
- Write the tests in the phase's acceptance criteria first, then make them pass.
- Don't mark a phase done until CI is green on all three browser engines.
- Secrets (Lemon Squeezy key, token signing key) live only in the decision-tools Worker's Cloudflare secrets. OAuth client IDs for Google and Dropbox are public, but never commit client secrets.
- Later option: Supabase sync behind the same SyncProvider interface. Don't add it unless docs/PLAN.md says so.
