import { render } from 'preact';
import { buildTarget } from './build-target';
import { App } from './ui/App';
import { keepLinkedBackupFresh } from './ui/backup';
import { startRouter } from './ui/router';
import { phase, start } from './ui/state';
import './ui/styles.css';

const root = document.getElementById('app');
if (root) {
  document.body.dataset['build'] = buildTarget();
  startRouter();
  render(<App />, root);
  void start().then(() => {
    if (phase.value !== 'unavailable') keepLinkedBackupFresh();
    document.body.dataset['ready'] = 'true';
  });
}
