(function () {
    "use strict";

    // ─────────────────────────────────────────────────────────────────────────
    // One-time setup:
    //   1. Create a free project at https://supabase.com
    //   2. Go to Settings → API and copy the Project URL and anon/public key
    //   3. In Authentication → URL Configuration, add this page's URL as a
    //      Redirect URL (e.g. https://john.marsland.org/vidmired/)
    // ─────────────────────────────────────────────────────────────────────────
    var SUPABASE_URL = "https://zmvoukgorfzwwjhaakyr.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_-JF-t4n_LitMZ7pDHpherA_y8zG_klj";

    var LS_KEY = "vidmired_watchlist";
    var _client = null;

    function db() {
        if (!_client) {
            _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return _client;
    }

    function isConfigured() {
        return SUPABASE_URL !== "YOUR_SUPABASE_URL";
    }

    // ── Local storage ──────────────────────────────────────────────────────

    function getLocalIds() {
        try {
            var raw = localStorage.getItem(LS_KEY);
            return raw ? (JSON.parse(raw).ids || []) : [];
        } catch (e) { return []; }
    }

    function setLocalIds(ids) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({ ids: ids }));
        } catch (e) {}
    }

    // ── Session helpers ────────────────────────────────────────────────────

    async function getSession() {
        if (!isConfigured()) return null;
        var { data } = await db().auth.getSession();
        return data.session;
    }

    async function getUser() {
        var s = await getSession();
        return s ? s.user : null;
    }

    // ── Watchlist ──────────────────────────────────────────────────────────

    async function getWatchlist() {
        var user = await getUser();
        if (user) return (user.user_metadata && user.user_metadata.watchlist) || [];
        return getLocalIds();
    }

    async function saveWatchlist(ids) {
        var user = await getUser();
        if (user) {
            await db().auth.updateUser({ data: { watchlist: ids } });
        } else {
            setLocalIds(ids);
        }
    }

    // Merges any locally-saved ids into the account after sign-in/sign-up.
    async function migrateLocalToAccount() {
        var local = getLocalIds();
        if (!local.length) return;
        var user = await getUser();
        if (!user) return;
        var remote = (user.user_metadata && user.user_metadata.watchlist) || [];
        await saveWatchlist(Array.from(new Set(remote.concat(local))));
        setLocalIds([]);
    }

    // ── Auth actions ───────────────────────────────────────────────────────

    async function signUp(email, pw) {
        return db().auth.signUp({ email: email, password: pw });
    }

    async function signIn(email, pw) {
        return db().auth.signInWithPassword({ email: email, password: pw });
    }

    async function signInWithGoogle() {
        return db().auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.href },
        });
    }

    async function signOut() {
        if (isConfigured()) await db().auth.signOut();
    }

    async function sendPasswordReset(email) {
        return db().auth.resetPasswordForEmail(email, {
            redirectTo: window.location.href,
        });
    }

    async function setNewPassword(pw) {
        return db().auth.updateUser({ password: pw });
    }

    function onAuthStateChange(cb) {
        if (!isConfigured()) return;
        db().auth.onAuthStateChange(cb);
    }

    window.VidmiredAuth = {
        isConfigured: isConfigured,
        getUser: getUser,
        getWatchlist: getWatchlist,
        saveWatchlist: saveWatchlist,
        migrateLocalToAccount: migrateLocalToAccount,
        signUp: signUp,
        signIn: signIn,
        signInWithGoogle: signInWithGoogle,
        signOut: signOut,
        sendPasswordReset: sendPasswordReset,
        setNewPassword: setNewPassword,
        onAuthStateChange: onAuthStateChange,
        getLocalIds: getLocalIds,
        setLocalIds: setLocalIds,
    };
})();
