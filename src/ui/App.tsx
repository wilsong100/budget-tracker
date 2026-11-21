import { buildTarget } from '../build-target';

export function App() {
  return (
    <main>
      <h1>Budget planner</h1>
      <p data-testid="build-target">Build: {buildTarget()}</p>
    </main>
  );
}
