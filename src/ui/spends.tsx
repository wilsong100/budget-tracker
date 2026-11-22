// Logging a spend in one line ("coffee 3.40") or one tap, with undo.
import { useState } from 'preact/hooks';
import { formatPence, parseQuickSpend, suggestCategory, type Pence } from '../domain';
import { toJson, type Row, type SpendData } from './model';
import { budget, save, stamp, today } from './state';

const QUICK_AMOUNTS: Pence[] = [200, 500, 1000, 2000];

async function logSpend(label: string, amount: Pence): Promise<boolean> {
  const history = budget.value.spends.map((s) => s.data);
  const data: SpendData = {
    label: label || 'Spend',
    amount,
    date: today.value,
    at: stamp(),
    category: suggestCategory(label, history),
  };
  let id = '';
  return save(
    async (s) => {
      id = (await s.put('spend', toJson(data))).id;
    },
    {
      message: `Logged ${data.label}, ${formatPence(amount)}.`,
      undo: async () => {
        await save((s) => s.remove(id), { message: 'Spend removed.' });
      },
    },
  );
}

export async function deleteSpend(row: Row<SpendData>): Promise<void> {
  await save((s) => s.remove(row.id), {
    message: `Removed ${row.data.label}.`,
    undo: async () => {
      await save((s) => s.put('spend', toJson(row.data), row.id));
    },
  });
}

export function SpendLogger({ quick = false }: { quick?: boolean }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    const spend = parseQuickSpend(text);
    if (!spend) {
      setError('Type what it was and how much, like “coffee 3.40”.');
      return;
    }
    setError('');
    if (await logSpend(spend.label, spend.amount)) setText('');
  }

  return (
    <form class="panel" onSubmit={submit} noValidate>
      <label for="quick-spend">Log a spend</label>
      <div class="quick-spend">
        <input
          id="quick-spend"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="coffee 3.40"
          value={text}
          aria-describedby={error ? 'quick-spend-error' : undefined}
          aria-invalid={error ? true : undefined}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit" class="btn btn-secondary">
          Add
        </button>
      </div>
      {error && (
        <p class="error" id="quick-spend-error">
          {error}
        </p>
      )}
      {quick && (
        <div class="quick-amounts" aria-label="Quick amounts" role="group">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              class="btn btn-quiet btn-small"
              aria-label={`Log ${formatPence(amount).replace('.00', '')}`}
              onClick={() => void logSpend('', amount)}
            >
              {formatPence(amount).replace('.00', '')}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
