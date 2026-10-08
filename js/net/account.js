/* Your account: log in / sign up, and your student saved on the school server (cloud save) so you can carry on from
   any phone or laptop. Online play needs an account; offline (no server) the local save slots still work.
   The token lives in localStorage; the password never does. */
(function (BH) {
  const KEY = 'bh_token';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  const Account = {
    token: get(KEY), user: null, cloud: null, checked: false, pushTimer: null, lastPush: 0,

    api(path, opts = {}) {
      const base = BH.Server.base();
      if (!base) return Promise.reject(new Error('no server'));
      const headers = Object.assign({ 'content-type': 'application/json' }, Account.token ? { authorization: `Bearer ${Account.token}` } : {});
      return fetch(base + path, Object.assign({ headers, cache: 'no-store' }, opts)).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status }); return j; });
    },
    /* on start: is the saved token still good? fetch the cloud save */
    async check() {
      Account.checked = false;
      if (Account.token) {
        try { const me = await Account.api('/api/auth/me'); Account.user = me.user; await Account.fetchSave(); }
        catch (e) { if (e.status === 401) Account.forget(); }
      }
      Account.checked = true;
      BH.UI && BH.UI.screen === 'title' && BH.UI.render();
    },
    async fetchSave() { const r = await Account.api('/api/save'); Account.cloud = r.save || null; return Account.cloud; },
    async login(username, password, signup) {
      const r = await Account.api(signup ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      Account.token = r.token; Account.user = r.user; set(KEY, r.token);
      await Account.fetchSave().catch(() => null);
      return r.user;
    },
    async logout() {
      try { await Account.api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* offline */ }
      if (BH.Net) BH.Net.disconnect();
      Account.forget();
    },
    forget() { Account.token = null; Account.user = null; Account.cloud = null; set(KEY, null); },

    /* this game belongs to the logged-in account */
    owns(s) { return !!(s && Account.user && s.account === Account.user.id); },
    /* save to the server (debounced; immediately when leaving the page) */
    push(s, now) {
      if (!Account.owns(s)) return;
      clearTimeout(Account.pushTimer);
      const go = () => {
        Account.lastPush = Date.now();
        const body = JSON.stringify({ save: s });
        Account.api('/api/save', { method: 'PUT', body, keepalive: body.length < 60000 }).catch((e) => console.warn('cloud save failed', e.message));
      };
      if (now) go(); else Account.pushTimer = setTimeout(go, Date.now() - Account.lastPush > 30000 ? 500 : 8000);
    },
    /* continue the cloud student */
    play() {
      const s = BH.Save.migrate(JSON.parse(JSON.stringify(Account.cloud)));
      s.slot = 0; s.account = Account.user.id;
      BH.Game.start(s);
    },
  };

  BH.Account = Account;
  if (BH.Server.base()) Account.check();
})(window.BH);
