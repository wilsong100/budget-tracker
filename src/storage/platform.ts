import { looksPrivate } from './health';

export interface StorageProbe {
  /** navigator.storage.persisted(), or null where the browser can't say. */
  persisted: boolean | null;
  privateMode: boolean;
  quota: number | null;
}

/** Asks the browser about storage. Every call is guarded: a probe must never throw. */
export async function probeBrowserStorage(
  nav: Navigator = navigator,
  page: { protocol: string; secure: boolean } = {
    protocol: location.protocol,
    secure: isSecureContext,
  },
): Promise<StorageProbe> {
  const storage = nav.storage as StorageManager | undefined;
  const persisted = storage?.persisted ? await storage.persisted().catch(() => null) : null;
  const quota = storage?.estimate
    ? await storage.estimate().then(
        (e) => e.quota ?? null,
        () => null,
      )
    : null;
  let opfsRejected = false;
  if (storage?.getDirectory) {
    await storage.getDirectory().catch(() => {
      opfsRejected = true;
    });
  }
  const privateMode = looksPrivate({
    expectsServiceWorker: page.secure && page.protocol.startsWith('http'),
    hasServiceWorker: 'serviceWorker' in nav,
    quota,
    opfsRejected,
  });
  return { persisted, privateMode, quota };
}

/**
 * Asks for persistent storage so the browser won't clear the budget under storage pressure.
 * Call on first run and after install. Firefox may show a prompt, so call it after the user
 * has done something, not on page load.
 */
export async function requestPersistentStorage(
  nav: Navigator = navigator,
): Promise<boolean | null> {
  const storage = nav.storage as StorageManager | undefined;
  if (!storage?.persist) return null;
  return storage.persist().catch(() => null);
}
