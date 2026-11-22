import { Band } from '../components';

const PAGES: [href: string, name: string, about: string][] = [
  ['#/calendar', 'Calendar', 'Your bills on a month grid. Tap a day to add one.'],
  ['#/paydays', 'Payday view', 'Which bills each payday has to cover.'],
  ['#/debt', 'Debt', 'When your cards and loans are paid off, and what overpaying saves.'],
  ['#/review', 'Month review', 'What you planned to spend in each category, and what you did.'],
];

/** The advanced screens, on one page so the tab bar stays at five. */
export function More() {
  return (
    <main id="content">
      <Band
        title="More"
        focusKey="more"
        lead="The advanced options. Turning them off in Settings hides them and deletes nothing."
      />
      <div class="wrap">
        <nav class="panel" aria-label="Advanced">
          <ul class="list more-list">
            {PAGES.map(([href, name, about]) => (
              <li key={href}>
                <a href={href}>
                  <span class="name">{name}</span>
                  <span class="muted small">{about}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
