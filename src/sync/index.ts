// Entry point for premium.js, the sync module. It is built separately and served by the
// decision-tools Worker only to licence holders, so it must never be bundled into the web app.
// The SyncProvider interface and the Drive and Dropbox providers arrive in Phase 6.
export const PREMIUM_MODULE_VERSION = 0;
