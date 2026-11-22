import { useState } from 'preact/hooks';
import { formatPence, monthKey, monthReview, type MonthKey } from '../../domain';
import { Band, Empty, MonthNav, MoneyInput, WhatsThis } from '../components';
import { amountFrom, poundsText } from '../forms';
import { toJson, type CategoryData, type Row } from '../model';
import { budget, save, today } from '../state';

/** Month review: planned against actual spending, by category (docs/PLAN.md). */
export function Review() {
  const thisMonth = monthKey(today.value);
  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const { categories, spends } = budget.value;
  const review = monthReview(
    month,
    categories.map(({ id, data }) => ({ id, name: data.name, planned: data.planned })),
    spends.map(({ data }) => data),
  );
  const { totals } = review;

  return (
    <main id="content">
      <Band
        title="Month review"
        focusKey="review"
        lead="What you planned to spend in each category, and what you did."
      />
      <div class="wrap">
        <section class="panel" aria-label={`Spending by category`} data-testid="review">
          <MonthNav month={month} onMonth={setMonth} latest={thisMonth} />
          {review.rows.length === 0 ? (
            <Empty>
              Give a category a monthly plan below, or log some spends, to compare them here.
            </Empty>
          ) : (
            <>
              <ul class="list">
                {review.rows.map((row) => {
                  const share =
                    row.planned === null || row.planned === 0
                      ? null
                      : Math.min(100, Math.floor((row.actual * 100) / row.planned));
                  return (
                    <li key={row.id ?? 'not-sorted'}>
                      <span class="grow">
                        <span class="name">{row.name}</span>
                        <br />
                        <span class="small">
                          {row.planned === null
                            ? `${formatPence(row.actual)} spent · no plan`
                            : `${formatPence(row.actual)} of ${formatPence(row.planned)}`}
                        </span>
                        {share !== null && (
                          <span
                            class={`progress${row.left! < 0 ? ' is-over' : ''}`}
                            role="img"
                            aria-label={`${share}% of the plan spent`}
                            style={{ display: 'block', marginTop: '0.4rem' }}
                          >
                            <i style={{ width: `${share}%` }} />
                          </span>
                        )}
                      </span>
                      {row.left !== null && (
                        <span class={`amount${row.left < 0 ? ' over' : ''}`}>
                          {row.left < 0
                            ? `${formatPence(-row.left)} over`
                            : `${formatPence(row.left)} left`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p class="cover-total">
                <span>
                  {review.count} {review.count === 1 ? 'spend' : 'spends'},{' '}
                  {formatPence(totals.actual)} in all
                </span>
                {totals.planned > 0 && (
                  <strong class={totals.plannedActual > totals.planned ? 'over' : undefined}>
                    {formatPence(totals.plannedActual)} of {formatPence(totals.planned)} planned
                  </strong>
                )}
              </p>
            </>
          )}
        </section>
        <section class="panel" aria-labelledby="plans-h">
          <details>
            <summary id="plans-h">Set monthly plans</summary>
            {categories.length === 0 ? (
              <p class="muted">Add spending categories in Settings first.</p>
            ) : (
              <div class="panel-form">
                {categories.map((c) => (
                  <PlanInput key={c.id} category={c} />
                ))}
              </div>
            )}
          </details>
        </section>
        <WhatsThis>
          <p>
            Spends count in the month they were made. A plan is what you mean to spend in a category
            each month; leave it blank for no plan. Bills aren’t counted here.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}

function PlanInput({ category }: { category: Row<CategoryData> }) {
  const [text, setText] = useState(poundsText(category.data.planned));
  const [error, setError] = useState<string | undefined>();
  const id = `plan-${category.id}`;
  function commit() {
    const planned = text.trim() === '' ? null : amountFrom(text);
    if (planned === null && text.trim() !== '')
      return setError('Enter an amount, for example 300.');
    setError(undefined);
    if (planned === category.data.planned) return;
    void save((s) => s.put('category', toJson({ ...category.data, planned }), category.id));
  }
  return (
    <div class="field">
      <label for={id}>Monthly plan for {category.data.name}</label>
      <MoneyInput
        id={id}
        value={text}
        onValue={setText}
        onChange={commit}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <span class="error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
