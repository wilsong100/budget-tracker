import { formatPence, formatShortDate, type IsoDate } from '../../domain';
import { Band, Empty, WhatsThis } from '../components';
import { toJson, type Row, type SpendData } from '../model';
import { SpendLogger, deleteSpend } from '../spends';
import { budget, save, today } from '../state';

const RECENT = 60;

export function Spend() {
  const { spends, categories } = budget.value;
  const recent = spends.slice(0, RECENT);
  const days = new Map<IsoDate, Row<SpendData>[]>();
  for (const row of recent) days.set(row.data.date, [...(days.get(row.data.date) ?? []), row]);

  async function setCategory(row: Row<SpendData>, category: string) {
    const data: SpendData = { ...row.data, category: category || null };
    await save((s) => s.put('spend', toJson(data), row.id));
  }

  const dayName = (date: IsoDate) => (date === today.value ? 'Today' : formatShortDate(date));

  return (
    <main id="content">
      <Band title="Spend" focusKey="spend" lead="Everything you’ve logged, newest first." />
      <div class="wrap">
        <SpendLogger quick />
        <section class="panel" aria-labelledby="spends-h">
          <h2 id="spends-h">Recent spends</h2>
          {recent.length === 0 ? (
            <Empty>
              Type what you spent and how much, like “coffee 3.40”, and it appears here.
            </Empty>
          ) : (
            <div data-testid="spend-list">
              {[...days].map(([date, rows]) => (
                <div key={date}>
                  <h3 class="day-head">{dayName(date)}</h3>
                  <ul class="list">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <span class="grow">
                          <span class="name">{row.data.label}</span>
                          <select
                            aria-label={`Category for ${row.data.label}`}
                            class="category"
                            value={row.data.category ?? ''}
                            onChange={(e) => void setCategory(row, e.currentTarget.value)}
                          >
                            <option value="">No category</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.data.name}
                              </option>
                            ))}
                          </select>
                        </span>
                        <span class="amount">{formatPence(row.data.amount)}</span>
                        <button
                          type="button"
                          class="link-btn"
                          aria-label={`Remove ${row.data.label}, ${formatPence(row.data.amount)}`}
                          onClick={() => void deleteSpend(row)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
        <WhatsThis>
          <p>
            Log spends from your current account as you go. Each one comes off today’s number
            straight away. Categories are suggested from what you’ve logged before.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}
