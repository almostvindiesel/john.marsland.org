(function () {
    "use strict";

    var GENRE_LABELS = {
        action_adventure: "Action & Adventure",
        animated_adult: "Adult Animation",
        anime: "Anime",
        comedy: "Comedy",
        documentary: "Documentary",
        drama: "Drama",
        food_lifestyle: "Food & Lifestyle",
        horror: "Horror",
        kids_family: "Kids & Family",
        news: "News",
        reality_competition: "Reality & Competition",
        romance: "Romance",
        scifi_fantasy: "Sci-Fi & Fantasy",
        sports: "Sports",
        talk_variety: "Talk & Variety",
    };

    var PERIOD_ORDER = ["this_week", "last_week", "last_month", "last_3_months"];

    var state = {
        payload: null,
        type: "series",
        period: "this_week",
        topN: 25,
        selectedGenres: new Set(),
        selectedServices: new Set(),
        showMyList: false,
        watchlistIds: new Set(),
    };

    // Populated by setupFilter, keyed by filter name ("genre" / "service"),
    // so table-cell clicks and the "Clear all filters" button can drive the
    // same checkbox panels the dropdowns use.
    var filterRegistry = {};

    function genreLabel(genre) {
        if (!genre) return null;
        return GENRE_LABELS[genre] || genre;
    }

    function formatRuntime(mins) {
        if (!mins) return null;
        if (mins < 60) return mins + "m";
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        return m > 0 ? h + "h " + m + "m" : h + "h";
    }

    function wikipediaUrl(wikiPage) {
        return "https://en.wikipedia.org/wiki/" + encodeURIComponent(wikiPage);
    }

    function personWikipediaUrl(name) {
        return wikipediaUrl(name.trim().replace(/\s+/g, "_"));
    }

    function googleSearchUrl(title) {
        return "https://www.google.com/search?q=" + encodeURIComponent(title);
    }

    // Truncate to ~maxLen chars on a word boundary (never mid-word) and
    // append an ellipsis, rather than a raw character slice.
    function truncateSummary(text, maxLen) {
        if (!text) return "";
        if (text.length <= maxLen) return text;
        var cut = text.slice(0, maxLen);
        var lastSpace = cut.lastIndexOf(" ");
        if (lastSpace > 0) cut = cut.slice(0, lastSpace);
        return cut.replace(/[.,;:\s]+$/, "") + "…";
    }

    var BUBBLE_BG_COUNT = 8;

    function bubbleBgClass(title) {
        var hash = 0;
        for (var i = 0; i < title.length; i++) {
            hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
        }
        return "bubble-bg-" + (hash % BUBBLE_BG_COUNT);
    }

    function formatDate(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr + "T00:00:00");
        if (isNaN(d)) return null;
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function formatMonthDay(dateStr) {
        if (!dateStr) return null;
        var d = new Date(dateStr + "T00:00:00");
        if (isNaN(d)) return null;
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    function makeBubblePlaceholder(title) {
        var placeholder = document.createElement("div");
        placeholder.className = "boxart-placeholder " + bubbleBgClass(title || "");
        var span = document.createElement("span");
        span.className = "bubble-title";
        span.textContent = title || "?";
        placeholder.appendChild(span);
        return placeholder;
    }

    // Box art and title both used to be plain links out to Wikipedia; now
    // they're the two triggers that expand/collapse the card's detail row
    // (real <button>s, not <a href="#">, so no synthetic keyboard handling
    // is needed) -- Wikipedia access moves to the dedicated icon in the
    // expanded detail row instead.
    function makeBoxArtLink(row) {
        var link = document.createElement("button");
        link.type = "button";
        link.className = "boxart-link";

        if (row.image_direct_url) {
            var img = document.createElement("img");
            img.className = "boxart";
            img.src = row.image_direct_url;
            img.alt = row.title;
            img.loading = "lazy";
            img.onerror = function () {
                img.replaceWith(makeBubblePlaceholder(row.title));
            };
            link.appendChild(img);
        } else {
            link.appendChild(makeBubblePlaceholder(row.title));
        }

        return link;
    }

    function makeTitleCell(row, year) {
        var td = document.createElement("td");
        td.className = "title-cell";

        var inner = document.createElement("div");
        inner.className = "title-cell-inner";
        var boxartBtn = makeBoxArtLink(row);
        inner.appendChild(boxartBtn);

        var titleBtn = document.createElement("button");
        titleBtn.type = "button";
        titleBtn.className = "title-name";
        // Text lives in an inner span, not directly on the button: on
        // mobile the button is promoted to a direct CSS Grid item
        // (title-cell and title-cell-inner are display: contents), and
        // Chrome silently breaks -webkit-line-clamp on an element that is
        // itself a grid item (the clamp's height math still applies, but
        // it stops actually truncating the text at N lines). Clamping the
        // nested, non-grid-item span instead sidesteps that.
        var titleText = document.createElement("span");
        titleText.className = "title-name-text";
        titleText.textContent = year ? row.title + " (" + year + ")" : row.title;
        titleBtn.appendChild(titleText);

        // The chevron is a sibling of the clamped span, not nested inside
        // it -- putting it inside title-name-text would let a long 2-line
        // title's line-clamp cut the chevron off along with the overflow.
        var chevron = document.createElement("span");
        chevron.className = "expand-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
        titleBtn.appendChild(chevron);

        inner.appendChild(titleBtn);
        td.appendChild(inner);

        return { td: td, boxartBtn: boxartBtn, titleBtn: titleBtn };
    }

    function makeWhereToWatchCell(list) {
        var td = document.createElement("td");
        td.className = "stream-cell";
        if (!list || list.length === 0) {
            return td;
        }

        var wrap = document.createElement("div");
        wrap.className = "watch-logos";
        list.forEach(function (entry) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cell-filter-btn watch-logo-btn";
            btn.title = "Filter to " + entry.name;
            btn.addEventListener("click", function () {
                applyExclusiveFilter("service", entry.name);
            });

            if (entry.logo_url) {
                var img = document.createElement("img");
                img.className = "watch-logo";
                img.src = entry.logo_url;
                img.alt = entry.name;
                img.loading = "lazy";
                img.onerror = function () {
                    btn.textContent = entry.name;
                };
                btn.appendChild(img);
            } else {
                btn.textContent = entry.name;
            }
            wrap.appendChild(btn);
        });
        td.appendChild(wrap);
        return td;
    }

    var SUMMARY_MAX_CHARS = 400;

    // Full-color brand icons (not currentColor glyphs) -- img/google-icon.png
    // (Google's "G" mark, background removed), img/wiki-icon.svg (Wikipedia's
    // official globe logo), img/rt-icon.svg (Rotten Tomatoes' tomato mark).
    var DETAIL_ICON_SRC = {
        google: "img/google-icon.png",
        wikipedia: "img/wiki-icon.svg",
        rt: "img/rt-icon.svg",
        imdb: "img/imdb-icon.webp",
    };

    function makeDetailIcon(kind, href, label) {
        var a = document.createElement("a");
        a.className = "detail-link detail-link-" + kind;
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
        a.title = label;
        a.setAttribute("aria-label", label);

        var img = document.createElement("img");
        img.className = "detail-link-icon";
        img.src = DETAIL_ICON_SRC[kind];
        img.alt = "";
        img.loading = "lazy";
        a.appendChild(img);

        return a;
    }

    function makeDetailRow(row, panelId) {
        var tr = document.createElement("tr");
        tr.className = "detail-row";

        var td = document.createElement("td");
        td.colSpan = 8;

        var panel = document.createElement("div");
        panel.className = "detail-panel";
        panel.id = panelId;

        var inner = document.createElement("div");
        inner.className = "detail-panel-inner";

        if (row.keywords && row.keywords.length) {
            var kw = document.createElement("p");
            kw.className = "detail-keywords";
            kw.textContent = row.keywords.join(" • ");
            inner.appendChild(kw);
        }

        var summary = document.createElement("p");
        summary.className = "detail-summary";
        summary.textContent = truncateSummary(row.summary, SUMMARY_MAX_CHARS);
        inner.appendChild(summary);

        var links = document.createElement("div");
        links.className = "detail-links";
        if (row.imdb_id) {
            links.appendChild(makeDetailIcon("imdb", "https://www.imdb.com/title/" + row.imdb_id + "/", row.title + " on IMDb"));
        }
        if (row.rt_url) {
            links.appendChild(makeDetailIcon("rt", row.rt_url, row.title + " on Rotten Tomatoes"));
        }
        links.appendChild(makeDetailIcon("wikipedia", wikipediaUrl(row.wiki_page), row.title + " on Wikipedia"));
        links.appendChild(makeDetailIcon("google", googleSearchUrl(row.title), "Search " + row.title + " on Google"));
        inner.appendChild(links);

        panel.appendChild(inner);
        td.appendChild(panel);
        tr.appendChild(td);

        return { tr: tr, panel: panel };
    }

    // Expands/collapses a card's detail row. Height is transitioned from a
    // measured scrollHeight (not a guessed constant) so it works for any
    // summary length, matching how the site's other reveal (the genre/
    // service filter panels) behaves.
    function toggleExpand(cardTr, detail, toggleButtons) {
        var expanding = !cardTr.classList.contains("row-expanded");

        cardTr.classList.toggle("row-expanded", expanding);
        toggleButtons.forEach(function (btn) {
            btn.setAttribute("aria-expanded", String(expanding));
        });

        if (expanding) {
            detail.tr.classList.add("open");
            detail.panel.style.maxHeight = detail.panel.scrollHeight + "px";
        } else {
            // Freeze the current height first so the collapse has a fixed
            // starting point to transition *from* (it was "auto" via a
            // stale scrollHeight px value, which still transitions fine
            // down to 0).
            detail.panel.style.maxHeight = detail.panel.scrollHeight + "px";
            // Force layout so the browser registers the frozen height
            // above before we change it, or the transition won't run.
            void detail.panel.offsetHeight;
            detail.panel.style.maxHeight = "0px";
            detail.tr.classList.remove("open");
        }
    }

    var SCORE_BAR_MAX = 10;

    var scoreTooltip = (function () {
        var el = document.createElement("div");
        el.className = "score-tooltip";
        el.textContent = "Vidmired Score: Measure of title popularity adjusted for quality";
        el.hidden = true;
        document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(el); });
        return el;
    })();

    function makeScoreCell(score, maxScore) {
        var td = document.createElement("td");
        td.className = "score-cell";
        var wrap = document.createElement("div");
        wrap.className = "score-bars";
        wrap.setAttribute("aria-label", "Vidmired score, relative to this week's ranking");

        wrap.addEventListener("mouseenter", function (e) {
            scoreTooltip.hidden = false;
            positionScoreTooltip(e);
        });
        wrap.addEventListener("mousemove", positionScoreTooltip);
        wrap.addEventListener("mouseleave", function () {
            scoreTooltip.hidden = true;
        });

        var count = maxScore > 0
            ? Math.max(1, Math.round((score / maxScore) * SCORE_BAR_MAX))
            : 1;
        for (var i = 0; i < SCORE_BAR_MAX; i++) {
            var bar = document.createElement("div");
            bar.className = i < count ? "score-bar" : "score-bar score-bar-empty";
            wrap.appendChild(bar);
        }

        td.appendChild(wrap);
        return td;
    }

    function positionScoreTooltip(e) {
        var margin = 12;
        var tw = scoreTooltip.offsetWidth;
        var th = scoreTooltip.offsetHeight;
        var vw = window.innerWidth;
        var x = e.clientX + margin;
        var y = e.clientY - th - margin;
        if (x + tw > vw - margin) x = e.clientX - tw - margin;
        if (y < margin) y = e.clientY + margin;
        scoreTooltip.style.left = x + "px";
        scoreTooltip.style.top  = y + "px";
    }

    // ── Watchlist helpers ──────────────────────────────────────────────────

    var _BOOKMARK_OUTLINE = '<svg viewBox="0 0 16 20" width="12" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 1h12v17l-6-3-6 3V1z"/></svg>';
    var _BOOKMARK_FILL    = '<svg viewBox="0 0 16 20" width="12" height="14" fill="currentColor" aria-hidden="true"><path d="M2 1h12v17l-6-3-6 3V1z"/></svg>';

    function loadWatchlist() {
        var auth = window.VidmiredAuth;
        if (!auth) return Promise.resolve();
        return auth.getWatchlist().then(function (ids) {
            state.watchlistIds = new Set(ids);
        }).catch(function () {
            state.watchlistIds = new Set((auth.getLocalIds ? auth.getLocalIds() : []));
        });
    }

    var _nudgeShown = false;

    function maybeShowNudge() {
        var auth = window.VidmiredAuth;
        if (_nudgeShown) return;
        if (auth && auth.isConfigured && !auth.isConfigured()) return; // not set up, skip
        // Don't show if already signed in (getUser is async so we skip the check here;
        // the nudge dismisses itself when the auth state changes to SIGNED_IN)
        _nudgeShown = true;
        var nudge = document.getElementById("sync-nudge");
        if (nudge) nudge.hidden = false;
    }

    function updateBookmarkButtons() {
        var tbody = document.getElementById("top10-body");
        if (!tbody) return;
        tbody.querySelectorAll(".bookmark-btn").forEach(function (btn) {
            var wp = btn.getAttribute("data-wp");
            var saved = state.watchlistIds.has(wp);
            btn.className = "bookmark-btn" + (saved ? " saved" : "");
            btn.title = saved ? "Remove from My List" : "Add to My List";
            btn.setAttribute("aria-label", btn.title);
            btn.innerHTML = saved ? _BOOKMARK_FILL : _BOOKMARK_OUTLINE;
        });
        updateMyListBtn();
    }

    function updateMyListBtn() {
        var btn = document.getElementById("my-list-btn");
        var countEl = document.getElementById("my-list-count");
        if (!btn) return;
        var count = state.watchlistIds.size;
        btn.classList.toggle("active", state.showMyList);
        btn.setAttribute("aria-pressed", String(state.showMyList));
        if (countEl) {
            countEl.textContent = count > 0 ? count : "";
            countEl.hidden = count === 0;
        }
    }

    function toggleWatchlistItem(wikiPage) {
        var ids = Array.from(state.watchlistIds);
        var idx = ids.indexOf(wikiPage);
        if (idx >= 0) {
            ids.splice(idx, 1);
        } else {
            ids.push(wikiPage);
            maybeShowNudge();
        }
        state.watchlistIds = new Set(ids);
        if (window.VidmiredAuth) window.VidmiredAuth.saveWatchlist(ids);
        updateBookmarkButtons();
        if (state.showMyList) render();
    }

    function makeBookmarkBtn(wikiPage) {
        var saved = state.watchlistIds.has(wikiPage);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bookmark-btn" + (saved ? " saved" : "");
        btn.title = saved ? "Remove from My List" : "Add to My List";
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("data-wp", wikiPage);
        btn.innerHTML = saved ? _BOOKMARK_FILL : _BOOKMARK_OUTLINE;
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleWatchlistItem(wikiPage);
        });
        return btn;
    }

    // ── Auth modal ─────────────────────────────────────────────────────────

    function showAuthView(id) {
        ["auth-view-user", "auth-view-main", "auth-view-forgot", "auth-view-newpw", "auth-view-setup"].forEach(function (v) {
            var el = document.getElementById(v);
            if (el) el.hidden = v !== id;
        });
    }

    function openAuthModal(tab) {
        var overlay = document.getElementById("auth-overlay");
        if (!overlay) return;
        var auth = window.VidmiredAuth;
        if (!auth || !auth.isConfigured()) {
            showAuthView("auth-view-setup");
        } else {
            showAuthView("auth-view-main");
            if (tab === "signup") switchAuthTab("signup");
            else switchAuthTab("signin");
        }
        overlay.hidden = false;
        document.body.style.overflow = "hidden";
    }

    function closeAuthModal() {
        var overlay = document.getElementById("auth-overlay");
        if (overlay) overlay.hidden = true;
        document.body.style.overflow = "";
    }

    function switchAuthTab(name) {
        var tabSignin = document.getElementById("tab-signin");
        var tabSignup = document.getElementById("tab-signup");
        var panelSignin = document.getElementById("auth-panel-signin");
        var panelSignup = document.getElementById("auth-panel-signup");
        if (!tabSignin) return;
        var isSignin = name !== "signup";
        tabSignin.classList.toggle("active", isSignin);
        tabSignup.classList.toggle("active", !isSignin);
        if (panelSignin) panelSignin.hidden = !isSignin;
        if (panelSignup) panelSignup.hidden = isSignin;
    }

    function setAuthErr(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || "";
        el.hidden = !msg;
    }

    function setAuthOk(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || "";
        el.hidden = !msg;
    }

    function updateAuthHeader(user) {
        var btn = document.getElementById("account-btn");
        if (!btn) return;
        btn.classList.toggle("signed-in", !!user);
        btn.title = user ? (user.email || "Account") : "Sign in";
        if (user) {
            var emailEl = document.getElementById("auth-user-email");
            if (emailEl) emailEl.textContent = user.email || "";
        }
    }

    function setupAuthUI() {
        var auth = window.VidmiredAuth;
        if (!auth) return;

        // Close on overlay click or Escape
        var overlay = document.getElementById("auth-overlay");
        if (overlay) {
            overlay.addEventListener("click", function (e) {
                if (e.target === overlay) closeAuthModal();
            });
        }
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeAuthModal();
        });
        var closeBtn = document.getElementById("auth-close");
        if (closeBtn) closeBtn.addEventListener("click", closeAuthModal);

        // Tabs
        var tabSignin = document.getElementById("tab-signin");
        var tabSignup = document.getElementById("tab-signup");
        if (tabSignin) tabSignin.addEventListener("click", function () { switchAuthTab("signin"); });
        if (tabSignup) tabSignup.addEventListener("click", function () { switchAuthTab("signup"); });

        // Sign in
        var btnSignin = document.getElementById("btn-signin");
        if (btnSignin) {
            btnSignin.addEventListener("click", function () {
                var email = (document.getElementById("signin-email") || {}).value || "";
                var pw = (document.getElementById("signin-password") || {}).value || "";
                setAuthErr("signin-err", "");
                btnSignin.disabled = true;
                auth.signIn(email, pw).then(function (res) {
                    if (res.error) setAuthErr("signin-err", res.error.message);
                    // success handled by onAuthStateChange
                }).catch(function (e) {
                    setAuthErr("signin-err", e.message);
                }).finally(function () { btnSignin.disabled = false; });
            });
        }

        // Google sign in (both buttons share the same handler)
        ["btn-google-signin", "btn-google-signup"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", function () { auth.signInWithGoogle(); });
        });

        // Sign up
        var btnSignup = document.getElementById("btn-signup");
        if (btnSignup) {
            btnSignup.addEventListener("click", function () {
                var email = (document.getElementById("signup-email") || {}).value || "";
                var pw = (document.getElementById("signup-password") || {}).value || "";
                setAuthErr("signup-err", "");
                setAuthOk("signup-ok", "");
                btnSignup.disabled = true;
                auth.signUp(email, pw).then(function (res) {
                    if (res.error) {
                        setAuthErr("signup-err", res.error.message);
                    } else {
                        setAuthOk("signup-ok", "Check your email to verify your account!");
                    }
                }).catch(function (e) {
                    setAuthErr("signup-err", e.message);
                }).finally(function () { btnSignup.disabled = false; });
            });
        }

        // Forgot password link
        var btnForgot = document.getElementById("btn-forgot");
        if (btnForgot) {
            btnForgot.addEventListener("click", function () { showAuthView("auth-view-forgot"); });
        }
        var btnBack = document.getElementById("auth-back-from-forgot");
        if (btnBack) {
            btnBack.addEventListener("click", function () { showAuthView("auth-view-main"); });
        }

        // Send reset link
        var btnForgotSubmit = document.getElementById("btn-forgot-submit");
        if (btnForgotSubmit) {
            btnForgotSubmit.addEventListener("click", function () {
                var email = (document.getElementById("forgot-email") || {}).value || "";
                setAuthErr("forgot-err", "");
                setAuthOk("forgot-ok", "");
                btnForgotSubmit.disabled = true;
                auth.sendPasswordReset(email).then(function (res) {
                    if (res.error) setAuthErr("forgot-err", res.error.message);
                    else setAuthOk("forgot-ok", "Reset link sent! Check your email.");
                }).catch(function (e) {
                    setAuthErr("forgot-err", e.message);
                }).finally(function () { btnForgotSubmit.disabled = false; });
            });
        }

        // Set new password
        var btnNewpw = document.getElementById("btn-newpw");
        if (btnNewpw) {
            btnNewpw.addEventListener("click", function () {
                var pw = (document.getElementById("newpw-input") || {}).value || "";
                setAuthErr("newpw-err", "");
                btnNewpw.disabled = true;
                auth.setNewPassword(pw).then(function (res) {
                    if (res.error) setAuthErr("newpw-err", res.error.message);
                    else closeAuthModal();
                }).catch(function (e) {
                    setAuthErr("newpw-err", e.message);
                }).finally(function () { btnNewpw.disabled = false; });
            });
        }

        // Sign out
        var btnSignout = document.getElementById("auth-signout");
        if (btnSignout) {
            btnSignout.addEventListener("click", function () {
                auth.signOut().then(function () {
                    state.watchlistIds = new Set();
                    updateBookmarkButtons();
                    if (state.showMyList) { state.showMyList = false; render(); }
                    updateAuthHeader(null);
                    closeAuthModal();
                });
            });
        }

        // Account button
        var accountBtn = document.getElementById("account-btn");
        if (accountBtn) {
            accountBtn.addEventListener("click", function () {
                auth.getUser().then(function (user) {
                    if (user) {
                        var emailEl = document.getElementById("auth-user-email");
                        if (emailEl) emailEl.textContent = user.email || "";
                        showAuthView("auth-view-user");
                    } else {
                        if (!auth.isConfigured()) {
                            showAuthView("auth-view-setup");
                        } else {
                            showAuthView("auth-view-main");
                            switchAuthTab("signin");
                        }
                    }
                    var overlay = document.getElementById("auth-overlay");
                    if (overlay) overlay.hidden = false;
                    document.body.style.overflow = "hidden";
                });
            });
        }

        // Auth state changes (sign in / sign out / password recovery)
        auth.onAuthStateChange(function (event, session) {
            var user = session ? session.user : null;
            if (event === "SIGNED_IN") {
                updateAuthHeader(user);
                var nudge = document.getElementById("sync-nudge");
                if (nudge) nudge.hidden = true;
                auth.migrateLocalToAccount().then(function () {
                    return auth.getWatchlist();
                }).then(function (ids) {
                    state.watchlistIds = new Set(ids);
                    updateBookmarkButtons();
                    if (state.showMyList) render();
                });
                // If modal is open, switch to signed-in view
                var overlay = document.getElementById("auth-overlay");
                if (overlay && !overlay.hidden) {
                    var emailEl = document.getElementById("auth-user-email");
                    if (emailEl) emailEl.textContent = (user && user.email) || "";
                    showAuthView("auth-view-user");
                }
            } else if (event === "SIGNED_OUT") {
                updateAuthHeader(null);
                state.watchlistIds = new Set(auth.getLocalIds ? auth.getLocalIds() : []);
                updateBookmarkButtons();
                if (state.showMyList) { state.showMyList = false; render(); }
            } else if (event === "PASSWORD_RECOVERY") {
                showAuthView("auth-view-newpw");
                var overlay = document.getElementById("auth-overlay");
                if (overlay) overlay.hidden = false;
                document.body.style.overflow = "hidden";
            }
        });

        // Sync nudge actions
        var nudgeCta = document.getElementById("sync-nudge-cta");
        var nudgeDismiss = document.getElementById("sync-nudge-dismiss");
        if (nudgeCta) nudgeCta.addEventListener("click", function () { openAuthModal("signup"); });
        if (nudgeDismiss) {
            nudgeDismiss.addEventListener("click", function () {
                var nudge = document.getElementById("sync-nudge");
                if (nudge) nudge.hidden = true;
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────

    var expandCounter = 0;

    function renderRow(row, rank, type, maxScore) {
        var tr = document.createElement("tr");

        var rankTd = document.createElement("td");
        rankTd.className = "rank";
        rankTd.textContent = rank;
        tr.appendChild(rankTd);

        var year = row.release_date ? new Date(row.release_date + "T00:00:00").getFullYear() : null;
        var titleCell = makeTitleCell(row, year);
        tr.appendChild(titleCell.td);

        var genreTd = document.createElement("td");
        genreTd.className = "genre-cell";
        var genre = genreLabel(row.primary_genre);
        var runtime = formatRuntime(row.avg_runtime_mins);
        if (genre) {
            var genreBtn = document.createElement("button");
            genreBtn.type = "button";
            genreBtn.className = "cell-filter-btn";
            genreBtn.textContent = genre;
            genreBtn.title = "Filter to " + genre;
            genreBtn.addEventListener("click", function () {
                applyExclusiveFilter("genre", row.primary_genre);
            });
            genreTd.appendChild(genreBtn);
            if (runtime) {
                var sep = document.createElement("span");
                sep.className = "genre-runtime-sep";
                sep.textContent = " | " + runtime;
                genreTd.appendChild(sep);
            }
        } else if (runtime) {
            genreTd.textContent = runtime;
        } else {
            genreTd.textContent = "—";
            genreTd.className += " muted";
        }
        tr.appendChild(genreTd);

        var castTd = document.createElement("td");
        castTd.className = "cast-cell";
        if (row.top_cast && row.top_cast.length) {
            row.top_cast.forEach(function (name) {
                var a = document.createElement("a");
                a.className = "cast-link";
                a.href = personWikipediaUrl(name);
                a.target = "_blank";
                a.rel = "noopener";
                a.textContent = name;
                castTd.appendChild(a);
            });
        } else {
            castTd.textContent = "—";
        }
        tr.appendChild(castTd);

        var timesTd = document.createElement("td");
        timesTd.className = "weeks-cell";
        // No column header in the card layout (mobile or desktop), so the
        // bare number needs an inline label to stay self-explanatory.
        timesTd.textContent = row.times_in_top10 != null
            ? row.times_in_top10 + " week" + (row.times_in_top10 === 1 ? "" : "s") + " in Top 10"
            : "—";
        tr.appendChild(timesTd);

        tr.appendChild(makeScoreCell(row.vidmired_score, maxScore));

        var dateTd = document.createElement("td");
        dateTd.className = "date-cell";
        var dateVal = type === "series" ? row.latest_season_release_date : row.release_date;
        var formatted = formatDate(dateVal);
        var dateLabel = type === "series" ? "Latest season: " : "Released: ";
        if (formatted) {
            dateTd.textContent = dateLabel + formatted;
        } else {
            dateTd.textContent = "—";
            dateTd.className += " muted";
        }
        tr.appendChild(dateTd);

        tr.appendChild(makeWhereToWatchCell(row.where_to_watch));
        tr.appendChild(makeBookmarkBtn(row.wiki_page));

        var panelId = "detail-panel-" + (expandCounter++);
        var detail = makeDetailRow(row, panelId);

        var toggleButtons = [titleCell.boxartBtn, titleCell.titleBtn];
        toggleButtons.forEach(function (btn) {
            btn.setAttribute("aria-expanded", "false");
            btn.setAttribute("aria-controls", panelId);
            btn.addEventListener("click", function () {
                toggleExpand(tr, detail, toggleButtons);
            });
        });

        return { tr: tr, detailTr: detail.tr };
    }

    function anyFilterActive() {
        return Object.keys(filterRegistry).some(function (name) {
            return filterRegistry[name].selectedSet.size > 0;
        });
    }

    function updateClearFiltersButton() {
        var btn = document.getElementById("clear-filters-btn");
        btn.hidden = !anyFilterActive();
    }

    function render() {
        var tbody = document.getElementById("top10-body");
        var status = document.getElementById("status");
        var dateHeader = document.getElementById("date-col-header");

        updateClearFiltersButton();
        renderActiveFilterTokens();
        updateMastheadOffset();
        tbody.innerHTML = "";
        dateHeader.textContent = state.type === "series" ? "Latest Season Release" : "Release date";

        var allRows = (state.payload.data[state.type] || {})[state.period] || [];

        // Score bars are scaled against the full period/type ranking, not
        // whatever's currently visible -- so a title's bar count stays fixed
        // as the Top-N / genre / service filters narrow the view, and only
        // changes when the underlying period or type actually changes.
        var maxScore = allRows.length
            ? Math.max.apply(null, allRows.map(function (r) { return r.vidmired_score; }))
            : 0;

        var topRows = allRows.slice(0, state.topN);

        // Ranks are fixed to the unfiltered order — a title keeps its rank
        // whether or not filters are active, so #3 stays #3 even if #1 and
        // #2 are hidden.
        var rankMap = new Map(topRows.map(function (row, i) { return [row, i + 1]; }));

        var rows = topRows;
        if (state.selectedGenres.size > 0) {
            rows = rows.filter(function (r) { return state.selectedGenres.has(r.primary_genre); });
        }
        if (state.selectedServices.size > 0) {
            rows = rows.filter(function (r) {
                return (r.where_to_watch || []).some(function (w) { return state.selectedServices.has(w.name); });
            });
        }
        if (state.showMyList) {
            if (state.watchlistIds.size === 0) {
                status.textContent = "Your list is empty — bookmark titles to save them here.";
                status.hidden = false;
                return;
            }
            rows = rows.filter(function (r) { return state.watchlistIds.has(r.wiki_page); });
        }

        if (rows.length === 0) {
            status.textContent = "No titles match the current filters.";
            status.hidden = false;
            return;
        }

        status.hidden = true;
        rows.forEach(function (row) {
            var pair = renderRow(row, rankMap.get(row), state.type, maxScore);
            tbody.appendChild(pair.tr);
            tbody.appendChild(pair.detailTr);
        });
    }

    function populatePeriodSelect() {
        var select = document.getElementById("period-select");
        select.innerHTML = "";
        PERIOD_ORDER.forEach(function (key) {
            var meta = state.payload.periods[key];
            var opt = document.createElement("option");
            opt.value = key;
            opt.textContent = meta.through
                ? meta.label + " (thru " + formatMonthDay(meta.through) + ")"
                : meta.label;
            select.appendChild(opt);
        });
        select.value = state.period;
    }

    function collectAllRows(payload) {
        var all = [];
        Object.keys(payload.data).forEach(function (type) {
            var byPeriod = payload.data[type];
            Object.keys(byPeriod).forEach(function (period) {
                all = all.concat(byPeriod[period]);
            });
        });
        return all;
    }

    function collectGenres(rows) {
        var seen = {};
        rows.forEach(function (r) {
            if (r.primary_genre) seen[r.primary_genre] = true;
        });
        return Object.keys(seen).sort(function (a, b) {
            return genreLabel(a).localeCompare(genreLabel(b));
        });
    }

    function collectServices(rows) {
        var seen = {};
        rows.forEach(function (r) {
            (r.where_to_watch || []).forEach(function (w) { seen[w.name] = true; });
        });
        return Object.keys(seen).sort();
    }

    function updateFilterCount(toggle, countEl, selectedSet, total) {
        countEl.textContent = selectedSet.size === 0 ? "All" : selectedSet.size + " of " + total;
        toggle.classList.toggle("has-selection", selectedSet.size > 0);
    }

    function setupFilter(opts) {
        var toggle = document.getElementById(opts.toggleId);
        var panel = document.getElementById(opts.panelId);
        var countEl = document.getElementById(opts.countId);

        var actions = document.createElement("div");
        actions.className = "filter-actions";
        var selectAllBtn = document.createElement("button");
        selectAllBtn.type = "button";
        selectAllBtn.textContent = "Select all";
        var clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.textContent = "Clear";
        actions.appendChild(selectAllBtn);
        actions.appendChild(clearBtn);
        panel.appendChild(actions);

        opts.values.forEach(function (value) {
            var label = document.createElement("label");
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = value;
            checkbox.checked = opts.selectedSet.has(value);
            checkbox.addEventListener("change", function () {
                if (checkbox.checked) {
                    opts.selectedSet.add(value);
                } else {
                    opts.selectedSet.delete(value);
                }
                updateFilterCount(toggle, countEl, opts.selectedSet, opts.values.length);
                render();
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(opts.labelFn(value)));
            panel.appendChild(label);
        });

        selectAllBtn.addEventListener("click", function () {
            opts.values.forEach(function (v) { opts.selectedSet.add(v); });
            panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
            updateFilterCount(toggle, countEl, opts.selectedSet, opts.values.length);
            render();
        });
        clearBtn.addEventListener("click", function () {
            opts.selectedSet.clear();
            panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
            updateFilterCount(toggle, countEl, opts.selectedSet, opts.values.length);
            render();
        });

        toggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var willOpen = panel.hidden;
            document.querySelectorAll(".filter-panel").forEach(function (p) { p.hidden = true; });
            document.querySelectorAll(".filter-toggle").forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
            panel.hidden = !willOpen;
            toggle.setAttribute("aria-expanded", String(willOpen));
        });

        updateFilterCount(toggle, countEl, opts.selectedSet, opts.values.length);

        filterRegistry[opts.name] = {
            toggle: toggle,
            panel: panel,
            countEl: countEl,
            selectedSet: opts.selectedSet,
            total: opts.values.length,
            labelFn: opts.labelFn,
        };
    }

    function syncFilterPanel(name) {
        var f = filterRegistry[name];
        if (!f) return;
        f.panel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
            cb.checked = f.selectedSet.has(cb.value);
        });
        updateFilterCount(f.toggle, f.countEl, f.selectedSet, f.total);
    }

    function removeFilterValue(name, value) {
        var f = filterRegistry[name];
        if (!f) return;
        f.selectedSet.delete(value);
        syncFilterPanel(name);
        render();
    }

    function renderActiveFilterTokens() {
        var container = document.getElementById("active-filter-tokens");
        if (!container) return;
        container.innerHTML = "";
        Object.keys(filterRegistry).forEach(function (name) {
            var f = filterRegistry[name];
            f.selectedSet.forEach(function (value) {
                var token = document.createElement("span");
                token.className = "filter-token";
                token.textContent = f.labelFn(value);

                var removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "filter-token-remove";
                removeBtn.setAttribute("aria-label", "Remove " + f.labelFn(value) + " filter");
                removeBtn.textContent = "×";
                removeBtn.addEventListener("click", function () {
                    removeFilterValue(name, value);
                });

                token.appendChild(removeBtn);
                container.appendChild(token);
            });
        });
    }

    function applyExclusiveFilter(name, value) {
        var f = filterRegistry[name];
        if (!f) return;
        var alreadyActive = f.selectedSet.size === 1 && f.selectedSet.has(value);
        f.selectedSet.clear();
        if (!alreadyActive) {
            f.selectedSet.add(value);
        }
        syncFilterPanel(name);
        render();
    }

    function clearAllFilters() {
        Object.keys(filterRegistry).forEach(function (name) {
            filterRegistry[name].selectedSet.clear();
            syncFilterPanel(name);
        });
        render();
    }

    function setupFilterDismissal() {
        document.addEventListener("click", function (e) {
            if (!e.target.closest(".filter")) {
                document.querySelectorAll(".filter-panel").forEach(function (p) { p.hidden = true; });
                document.querySelectorAll(".filter-toggle").forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
            }
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                document.querySelectorAll(".filter-panel").forEach(function (p) { p.hidden = true; });
                document.querySelectorAll(".filter-toggle").forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
            }
        });
    }

    function updateMastheadOffset() {
        var masthead = document.querySelector("header.masthead");
        if (!masthead) return;
        document.documentElement.style.setProperty("--masthead-h", masthead.offsetHeight + "px");
    }

    function init() {
        var status = document.getElementById("status");
        var typeSelect = document.getElementById("type-select");
        var periodSelect = document.getElementById("period-select");

        window.addEventListener("resize", updateMastheadOffset);

        typeSelect.addEventListener("change", function () {
            state.type = typeSelect.value;
            render();
        });
        periodSelect.addEventListener("change", function () {
            state.period = periodSelect.value;
            render();
        });
        document.getElementById("clear-filters-btn").addEventListener("click", clearAllFilters);
        setupFilterDismissal();

        var myListBtn = document.getElementById("my-list-btn");
        if (myListBtn) {
            myListBtn.addEventListener("click", function () {
                state.showMyList = !state.showMyList;
                updateMyListBtn();
                render();
            });
        }

        setupAuthUI();

        // Load watchlist and data in parallel; render only after both are ready.
        var watchlistReady = loadWatchlist();
        var dataReady = fetch("data/top10.json")
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            });

        Promise.all([dataReady, watchlistReady])
            .then(function (results) {
                var payload = results[0];
                state.payload = payload;
                if (!payload.periods || !payload.data) {
                    status.textContent = "No data yet — run scripts/generate_top10.py.";
                    status.hidden = false;
                    return;
                }
                populatePeriodSelect();

                var allRows = collectAllRows(payload);
                setupFilter({
                    name: "genre",
                    toggleId: "genre-filter-toggle",
                    panelId: "genre-filter-panel",
                    countId: "genre-filter-count",
                    values: collectGenres(allRows),
                    selectedSet: state.selectedGenres,
                    labelFn: genreLabel,
                });
                setupFilter({
                    name: "service",
                    toggleId: "service-filter-toggle",
                    panelId: "service-filter-panel",
                    countId: "service-filter-count",
                    values: collectServices(allRows),
                    selectedSet: state.selectedServices,
                    labelFn: function (v) { return v; },
                });

                updateMyListBtn();
                render();

                // Seed My List button count (watchlist loaded before render)
                updateMyListBtn();
            })
            .catch(function (err) {
                status.textContent = "Couldn't load top10.json (" + err.message + "). Run scripts/generate_top10.py first.";
                status.hidden = false;
            });
    }

    document.addEventListener("DOMContentLoaded", init);
})();
