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
    };

    // Populated by setupFilter, keyed by filter name ("genre" / "service"),
    // so table-cell clicks and the "Clear all filters" button can drive the
    // same checkbox panels the dropdowns use.
    var filterRegistry = {};

    function genreLabel(genre) {
        if (!genre) return null;
        return GENRE_LABELS[genre] || genre;
    }

    function wikipediaUrl(wikiPage) {
        return "https://en.wikipedia.org/wiki/" + encodeURIComponent(wikiPage);
    }

    function personWikipediaUrl(name) {
        return wikipediaUrl(name.trim().replace(/\s+/g, "_"));
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

    function makeBoxArtLink(row) {
        var link = document.createElement("a");
        link.className = "boxart-link";
        link.href = wikipediaUrl(row.wiki_page);
        link.target = "_blank";
        link.rel = "noopener";

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

    function makeTitleCell(row) {
        var td = document.createElement("td");
        td.className = "title-cell";

        var inner = document.createElement("div");
        inner.className = "title-cell-inner";
        inner.appendChild(makeBoxArtLink(row));

        var titleLink = document.createElement("a");
        titleLink.className = "title-name";
        titleLink.href = wikipediaUrl(row.wiki_page);
        titleLink.target = "_blank";
        titleLink.rel = "noopener";
        // Text lives in an inner span, not directly on the <a>: on mobile
        // the <a> is promoted to a direct CSS Grid item (title-cell and
        // title-cell-inner are display: contents), and Chrome silently
        // breaks -webkit-line-clamp on an element that is itself a grid
        // item (the clamp's height math still applies, but it stops
        // actually truncating the text at N lines). Clamping the nested,
        // non-grid-item span instead sidesteps that.
        var titleText = document.createElement("span");
        titleText.className = "title-name-text";
        titleText.textContent = row.title;
        titleLink.appendChild(titleText);
        inner.appendChild(titleLink);

        td.appendChild(inner);
        return td;
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

    var SCORE_BAR_MAX = 10;

    function makeScoreCell(score, maxScore) {
        var td = document.createElement("td");
        td.className = "score-cell";
        var wrap = document.createElement("div");
        wrap.className = "score-bars";
        wrap.title = "Vidmired score, relative to this week's ranking";
        wrap.setAttribute("aria-label", "Vidmired score, relative to this week's ranking");

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

    function renderRow(row, rank, type, maxScore) {
        var tr = document.createElement("tr");

        var rankTd = document.createElement("td");
        rankTd.className = "rank";
        rankTd.textContent = rank;
        tr.appendChild(rankTd);

        tr.appendChild(makeTitleCell(row));

        var genreTd = document.createElement("td");
        genreTd.className = "genre-cell";
        var genre = genreLabel(row.primary_genre);
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

        return tr;
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

        var rows = allRows.slice(0, state.topN);

        if (state.selectedGenres.size > 0) {
            rows = rows.filter(function (r) { return state.selectedGenres.has(r.primary_genre); });
        }
        if (state.selectedServices.size > 0) {
            rows = rows.filter(function (r) {
                return (r.where_to_watch || []).some(function (w) { return state.selectedServices.has(w.name); });
            });
        }

        if (rows.length === 0) {
            status.textContent = "No titles match the current filters.";
            status.hidden = false;
            return;
        }

        status.hidden = true;
        rows.forEach(function (row, i) {
            tbody.appendChild(renderRow(row, i + 1, state.type, maxScore));
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

        fetch("../static/data/vidverse/top10.json")
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            })
            .then(function (payload) {
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

                render();
            })
            .catch(function (err) {
                status.textContent = "Couldn't load top10.json (" + err.message + "). Run scripts/generate_top10.py first.";
                status.hidden = false;
            });
    }

    document.addEventListener("DOMContentLoaded", init);
})();
