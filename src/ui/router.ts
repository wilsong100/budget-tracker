import { signal } from '@preact/signals';

// Hash routes, so the same build works under /budget-planner/ and from a file on disk.
export const ROUTES = ['today', 'spend', 'bills', 'pots', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

function read(): Route {
  const name = location.hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'today';
}

export const route = signal<Route>(read());

export function startRouter(): void {
  window.addEventListener('hashchange', () => {
    route.value = read();
    window.scrollTo(0, 0);
  });
}

export function go(to: Route): void {
  if (route.value === to && location.hash === `#/${to}`) return;
  location.hash = `#/${to}`;
}
