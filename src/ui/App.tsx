import { useEffect, useState } from 'preact/hooks';
import { SiteBar, Tabs, Toast } from './components';
import { route } from './router';
import { Bills } from './screens/Bills';
import { Missing } from './screens/Missing';
import { Pots } from './screens/Pots';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Spend } from './screens/Spend';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';
import { phase } from './state';

export function App() {
  const [settingUp, setSettingUp] = useState(false);
  const p = phase.value;
  const ready = p === 'ready';
  useEffect(() => {
    if (ready) setSettingUp(false);
  }, [ready]);

  let screen;
  if (p === 'loading') {
    screen = <main id="content" class="no-nav" aria-busy="true" />;
  } else if (p === 'unavailable') {
    screen = (
      <main id="content" class="no-nav">
        <div class="wrap">
          <div class="panel">
            <h1 tabIndex={-1}>This browser can’t save your budget</h1>
            <p>
              It may be set to block site data, or this may be a private window. Try a normal
              window, or allow this site to store data in your browser’s settings.
            </p>
          </div>
        </div>
      </main>
    );
  } else if (!ready && settingUp) {
    screen = <Setup onCancel={() => setSettingUp(false)} />;
  } else if (p === 'missing') {
    screen = <Missing onStartAgain={() => setSettingUp(true)} />;
  } else if (p === 'fresh') {
    screen = <Welcome onStart={() => setSettingUp(true)} />;
  } else {
    const r = route.value;
    screen =
      r === 'spend' ? (
        <Spend />
      ) : r === 'bills' ? (
        <Bills />
      ) : r === 'pots' ? (
        <Pots />
      ) : r === 'settings' ? (
        <Settings />
      ) : (
        <Today />
      );
  }

  return (
    <>
      <a class="skip" href="#content">
        Skip to content
      </a>
      <SiteBar showSettings={ready} />
      {screen}
      {ready && <Tabs />}
      <Toast />
    </>
  );
}
