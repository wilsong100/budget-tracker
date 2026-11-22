import type { ComponentChildren } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef } from 'preact/hooks';
import { formatMonth, shiftMonth, type MonthKey } from '../domain';
import { isAdvanced, route, type Route } from './router';
import { budget, health, toast } from './state';

/** The storage health chip: always on screen (docs/PLAN.md, rule 3). */
export function StatusChip() {
  const h = health.value;
  return (
    <span class={`chip ${h.tone}`} data-testid="storage-chip" role="status">
      {h.message}
    </span>
  );
}

export function SiteBar({ showSettings }: { showSettings: boolean }) {
  return (
    <header class="sitebar">
      <div class="in">
        <span class="brand">
          <span class="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Budget planner
        </span>
        <StatusChip />
        {showSettings && (
          <a
            class="settings-link"
            href="#/settings"
            aria-current={route.value === 'settings' ? 'page' : undefined}
          >
            Settings
          </a>
        )}
      </div>
    </header>
  );
}

const TABS: [Route, string][] = [
  ['today', 'Today'],
  ['spend', 'Spend'],
  ['bills', 'Bills'],
  ['pots', 'Pots'],
];

export function Tabs() {
  const advanced = budget.value.prefs.mode === 'advanced';
  const tabs: [Route, string][] = advanced ? [...TABS, ['more', 'More']] : TABS;
  const here = route.value;
  const current = (id: Route) => id === here || (id === 'more' && advanced && isAdvanced(here));
  return (
    <nav class="tabs" aria-label="Main">
      <ul>
        {tabs.map(([id, name]) => (
          <li key={id}>
            <a href={`#/${id}`} aria-current={current(id) ? 'page' : undefined}>
              {name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The teal title band. Its h1 takes focus when the screen opens, for screen readers. */
export function Band({
  title,
  lead,
  children,
  focusKey,
}: {
  title: ComponentChildren;
  lead?: ComponentChildren;
  children?: ComponentChildren;
  /** Changes when a new screen or step opens, to move focus to the heading. */
  focusKey?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Before paint, not after: a late focus move could land in the middle of the user typing.
  useLayoutEffect(() => {
    if (focusKey === undefined) return;
    // The first screen after loading leaves focus where the browser put it.
    if (firstScreen) firstScreen = false;
    else heading.current?.focus();
  }, [focusKey]);
  return (
    <div class="band">
      <div class="in">
        <h1 tabIndex={-1} ref={heading}>
          {title}
        </h1>
        {lead && <p class="lead">{lead}</p>}
        {children}
      </div>
    </div>
  );
}
let firstScreen = true;

/** A "What's this?" link with a short explanation: hand-holding without pop-up tours. */
export function WhatsThis({ children }: { children: ComponentChildren }) {
  return (
    <details class="whats-this">
      <summary>What’s this?</summary>
      {children}
    </details>
  );
}

export interface FieldControl {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

/** A label, an optional hint and error, and the control, all tied together for screen readers. */
export function Field({
  label,
  hint,
  error,
  id: given,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id?: string;
  children: (control: FieldControl) => ComponentChildren;
}) {
  const auto = useId();
  const id = given ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div class="field">
      <label for={id}>{label}</label>
      {hint && (
        <span class="hint" id={hintId}>
          {hint}
        </span>
      )}
      {children({
        id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error && (
        <span class="error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

/** The props the text inputs take: a Field's control plus a few extras. */
interface InputProps {
  value: string;
  onValue: (value: string) => void;
  id?: string;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: true | undefined;
  inputMode?: 'numeric' | 'decimal' | 'text';
  placeholder?: string;
  /** Called when the user leaves the field after changing it. */
  onChange?: () => void;
}

/** An amount in pounds, typed as text so "1,234.56" and "£5" both work. */
export function MoneyInput({ value, onValue, onChange, ...rest }: InputProps) {
  return (
    <span class="money">
      <input
        {...rest}
        onChange={onChange}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onInput={(e) => onValue(e.currentTarget.value)}
      />
    </span>
  );
}

export function TextInput({ value, onValue, onChange, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      onChange={onChange}
      type="text"
      value={value}
      onInput={(e) => onValue(e.currentTarget.value)}
    />
  );
}

export function Toast() {
  const t = toast.value;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(
      () => {
        if (toast.value === t) toast.value = null;
      },
      t.undo ? 8000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [t]);
  return (
    <div aria-live="polite" role="status">
      {t && (
        <div class={`toast ${t.tone}`}>
          <p>{t.message}</p>
          {t.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = t.undo!;
                toast.value = null;
                void undo();
              }}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            class="close"
            aria-label="Dismiss"
            onClick={() => (toast.value = null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return (
    <p class="empty" data-testid="empty">
      {children}
    </p>
  );
}

/** Previous and next month buttons around the month's name, for Calendar and Month review. */
export function MonthNav({
  month,
  onMonth,
  latest,
}: {
  month: MonthKey;
  onMonth: (month: MonthKey) => void;
  /** No later month than this one, if given. */
  latest?: MonthKey;
}) {
  const next = shiftMonth(month, 1);
  const canGoOn = latest === undefined || next <= latest;
  return (
    <div class="month-nav">
      <button
        type="button"
        class="btn btn-quiet btn-small"
        aria-label="Previous month"
        onClick={() => onMonth(shiftMonth(month, -1))}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h2 aria-live="polite">{formatMonth(month)}</h2>
      <button
        type="button"
        class="btn btn-quiet btn-small"
        aria-label="Next month"
        disabled={!canGoOn}
        onClick={() => onMonth(next)}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
