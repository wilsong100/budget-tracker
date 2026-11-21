import { useState } from 'preact/hooks';
import { Restore } from '../backup';
import { Band } from '../components';

/**
 * The database is empty but this browser has held a budget (docs/PLAN.md, rule 7). Don't
 * offer setup first: a new budget here would bury the old one's trail.
 */
export function Missing({ onStartAgain }: { onStartAgain: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <main class="no-nav" id="content">
      <Band
        title="Your budget seems to be missing"
        lead="This browser had a budget, but it can’t find it now. Browsers sometimes clear saved data, for example after clearing history or freeing up space."
        focusKey="missing"
      />
      <div class="wrap">
        <section class="panel" aria-labelledby="restore-h">
          <h2 id="restore-h">Restore from a backup</h2>
          <p>
            Choose your budget-backup.json file. It may be in your downloads, in Files on your
            phone, or wherever you shared it.
          </p>
          <Restore />
        </section>
        <section class="panel" aria-labelledby="sync-h">
          <h2 id="sync-h">Reconnect sync</h2>
          <p class="muted">
            Sync through your own Google Drive or Dropbox is coming soon. When it’s on, your budget
            comes back from there.
          </p>
        </section>
        <section class="panel">
          {sure ? (
            <div class="actions">
              <button type="button" class="btn btn-danger btn-small" onClick={onStartAgain}>
                Yes, start a new budget
              </button>
              <button type="button" class="link-btn" onClick={() => setSure(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" class="link-btn" onClick={() => setSure(true)}>
              I don’t have a backup: start a new budget
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
