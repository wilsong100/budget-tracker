import { useEffect, useState } from 'preact/hooks';
import { SiteBar, Tabs, Toast } from './components';
import { isAdvanced, route } from './router';
import { Bills } from './screens/Bills';
import { Calendar } from './screens/Calendar';
import { Debt } from './screens/Debt';
import { More } from './screens/More';
import { Paydays } from './screens/Paydays';
import { Review } from './screens/Review';
import { Missing } from './screens/Missing';
import { Pots } from './screens/Pots';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Spend } from './screens/Spend';
import { Today } from './screens/Today';
import { Welcome } from './screens/Welcome';
import { budget, phase } from './state';

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
    // Advanced screens stay hidden in simple mode, even when opened by address.
    const r = route.value;
    const shown = isAdvanced(r) && budget.value.prefs.mode !== 'advanced' ? 'today' : r;
    const screens = {
      today: Today,
      spend: Spend,
      bills: Bills,
      pots: Pots,
      settings: Settings,
      more: More,
      calendar: Calendar,
      paydays: Paydays,
      debt: Debt,
      review: Review,
    };
    const Screen = screens[shown];
    screen = <Screen />;
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
