import { Band } from '../components';
import { exampleHousehold } from '../example';
import { save, stamp, today } from '../state';

export function Welcome({ onStart }: { onStart: () => void }) {
  async function tryExample() {
    await save((s) => s.putMany(exampleHousehold(today.value, stamp())));
  }
  return (
    <main class="no-nav" id="content">
      <Band
        title="Know what you can spend, every day"
        lead="Tell us when you’re paid, what’s in your account and what comes out. You’ll get one number: what’s safe to spend today. It takes about 3 minutes."
        focusKey="welcome"
      >
        <div class="actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" class="btn btn-primary" onClick={onStart}>
            Set up my budget
          </button>
          <button type="button" class="btn btn-quiet" onClick={() => void tryExample()}>
            Try with example numbers
          </button>
        </div>
      </Band>
      <div class="wrap">
        <div class="panel">
          <h2>Your budget stays on this device</h2>
          <p>
            Everything is saved here as you go, with no account and no bank login. Nothing is sent
            to our server. You can make a backup file at any time from Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
