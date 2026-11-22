// ==UserScript==
// @name         GitHub Feed Filter
// @namespace    https://github.com/igugyj/github-feed-filter
// @version      2.0.0
// @description  Filter, collapse or hide GitHub feed cards by type, block by keyword, age the feed with time cutoff and auto-load. Adds a Stargazers button on your own repositories. Fully configurable.
// @author       Pfolg
// @license      MIT
// @homepageURL  https://github.com/igugyj/github-feed-filter
// @supportURL   https://github.com/igugyj/github-feed-filter/issues
// @downloadURL  https://raw.githubusercontent.com/igugyj/github-feed-filter/release/main.js
// @updateURL    https://raw.githubusercontent.com/igugyj/github-feed-filter/release/main.js
// @match        https://github.com/feed*
// @match        https://github.com/
// @match        https://github.com/*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
"use strict";
(() => {
  // src/config/defaults.ts
  var MODES_SET = /* @__PURE__ */ new Set(["show", "collapse", "hide"]);
  var SUB_MODES_SET = /* @__PURE__ */ new Set(["show", "collapse", "hide", "inherit"]);
  var DEFAULT_MODES = {
    merged: "show",
    release: "show",
    trending: "show",
    recommend: "show",
    popular: "show",
    created: "show",
    fork: "show",
    publicRepo: "show",
    follow: "show",
    other: "show",
    star: "show",
    "star.starred": "inherit",
    "star.list": "inherit"
  };
  function cloneDefault() {
    return {
      version: 2,
      features: {
        feed: { enabled: true, urls: ["https://github.com/feed*"] },
        rightColumn: { enabled: true, urls: ["https://github.com/"] },
        stargazers: {
          enabled: true,
          urls: ["https://github.com/*/*"],
          onlyOwn: true,
          extraOrgs: []
        }
      },
      modes: { ...DEFAULT_MODES },
      right: { banner: "show", changelog: "show" },
      keywords: { enabled: false, mode: "hide", list: [] },
      timeFilter: { enabled: false, days: 3 },
      autoLoad: { enabled: false, maxPages: 30 }
    };
  }
  function sanitizeMode(value, fallback) {
    return typeof value === "string" && MODES_SET.has(value) ? value : fallback;
  }
  function sanitizeSubMode(value, fallback) {
    return typeof value === "string" && SUB_MODES_SET.has(value) ? value : fallback;
  }
  function sanitizeStringArray(value) {
    if (!Array.isArray(value)) return void 0;
    return value.filter((v) => typeof v === "string");
  }
  function normalizeConfig(saved) {
    const def = cloneDefault();
    if (!saved || typeof saved !== "object") return def;
    const s = saved;
    const out = cloneDefault();
    if (s.modes && typeof s.modes === "object") {
      const m = s.modes;
      for (const key of Object.keys(DEFAULT_MODES)) {
        if (key === "star.starred" || key === "star.list") {
          out.modes[key] = sanitizeSubMode(m[key], DEFAULT_MODES[key]);
        } else {
          out.modes[key] = sanitizeMode(m[key], DEFAULT_MODES[key]);
        }
      }
    }
    if (s.right && typeof s.right === "object") {
      const r = s.right;
      out.right.banner = sanitizeMode(r.banner, def.right.banner);
      out.right.changelog = sanitizeMode(r.changelog, def.right.changelog);
    }
    if (s.timeFilter && typeof s.timeFilter === "object") {
      const t = s.timeFilter;
      out.timeFilter.enabled = t.enabled === true;
      const days = Number(t.days);
      out.timeFilter.days = Number.isFinite(days) && days >= 1 ? Math.min(days, 3650) : def.timeFilter.days;
    }
    if (s.autoLoad && typeof s.autoLoad === "object") {
      const a = s.autoLoad;
      out.autoLoad.enabled = a.enabled === true;
      const pages = Number(a.maxPages);
      out.autoLoad.maxPages = Number.isFinite(pages) && pages >= 0 ? Math.floor(pages) : def.autoLoad.maxPages;
    }
    if (s.keywords && typeof s.keywords === "object") {
      const k = s.keywords;
      out.keywords.enabled = k.enabled === true;
      out.keywords.mode = sanitizeMode(k.mode, def.keywords.mode);
      const list = sanitizeStringArray(k.list);
      if (list) out.keywords.list = list;
    }
    if (s.features && typeof s.features === "object") {
      const f = s.features;
      if (f.feed && typeof f.feed === "object") {
        out.features.feed.enabled = f.feed.enabled !== false;
        const urls = sanitizeStringArray(f.feed.urls);
        if (urls) out.features.feed.urls = urls;
      }
      if (f.rightColumn && typeof f.rightColumn === "object") {
        out.features.rightColumn.enabled = f.rightColumn.enabled !== false;
        const urls = sanitizeStringArray(f.rightColumn.urls);
        if (urls) out.features.rightColumn.urls = urls;
      }
      if (f.stargazers && typeof f.stargazers === "object") {
        out.features.stargazers.enabled = f.stargazers.enabled !== false;
        const urls = sanitizeStringArray(f.stargazers.urls);
        if (urls) out.features.stargazers.urls = urls;
        out.features.stargazers.onlyOwn = f.stargazers.onlyOwn !== false;
        const extra = sanitizeStringArray(f.stargazers.extraOrgs);
        if (extra) out.features.stargazers.extraOrgs = extra;
      }
    }
    out.version = 2;
    return out;
  }

  // src/config/storage.ts
  var V2_KEY = "gff-config-v2";
  var V1_KEY = "gff-config-v1";
  var ORG_CACHE_KEY = "gff-orgs-v1";
  function gmGet(key) {
    try {
      if (typeof GM_getValue === "function") {
        const v = GM_getValue(key, null);
        return typeof v === "string" ? v : v == null ? null : String(v);
      }
    } catch {
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch {
    }
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function readJson(key) {
    const raw = gmGet(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function writeJson(key, value) {
    gmSet(key, JSON.stringify(value));
  }
  function loadConfig() {
    let saved = readJson(V2_KEY);
    if (saved == null) {
      saved = readJson(V1_KEY);
    }
    const cfg = normalizeConfig(saved);
    if (saved != null) writeJson(V2_KEY, cfg);
    return cfg;
  }
  function saveConfig(cfg) {
    writeJson(V2_KEY, cfg);
  }
  function readOrgCache() {
    const raw = readJson(ORG_CACHE_KEY);
    if (!raw || typeof raw !== "object") return null;
    const o = raw;
    if (!Array.isArray(o.logins)) return null;
    return {
      logins: o.logins.filter((l) => typeof l === "string"),
      fetchedAt: typeof o.fetchedAt === "number" ? o.fetchedAt : 0
    };
  }
  function writeOrgCache(cache) {
    writeJson(ORG_CACHE_KEY, cache);
  }

  // src/core/url-scope.ts
  function matchesUrl(url, pattern) {
    if (!pattern) return false;
    if (pattern.includes("*")) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      const re = new RegExp("^" + escaped + "$");
      return re.test(url);
    }
    return url === pattern || url === pattern + "/" || pattern === url + "/";
  }
  function matchesAny(url, patterns) {
    return patterns.some((p) => matchesUrl(url, p));
  }

  // src/core/classify.ts
  function classifyCard(card) {
    if (!card || typeof card.card_type !== "string") return "other";
    const rel = card.resource_relationship || "";
    switch (card.card_type) {
      case "MERGED_PULL_REQUEST":
        return "merged";
      case "RELEASE":
        return "release";
      case "TRENDING_REPOSITORY":
        return "trending";
      case "REPOSITORY_RECOMMENDATION":
        return rel === "FOLLOWED" ? "popular" : "recommend";
      case "STARRED_REPOSITORY":
        return "star.starred";
      case "ADDED_TO_LIST":
        return "star.list";
      case "CREATED_REPOSITORY":
        return "created";
      case "FORKED_REPOSITORY":
        return "fork";
      case "PRIVATE_TO_PUBLIC_REPOSITORY":
        return "publicRepo";
      case "FOLLOW":
        return "follow";
      default:
        return "other";
    }
  }
  function classifyByText(text) {
    const s = (text || "").toLowerCase();
    if (/added a repository to/.test(s)) return "star.list";
    if (/\bstarred\b/.test(s)) return "star.starred";
    if (/forked a repository/.test(s)) return "fork";
    if (/made this repository public/.test(s)) return "publicRepo";
    if (/created a repository/.test(s)) return "created";
    if (/released|published \d* ?release/.test(s)) return "release";
    if (/trending repositories/.test(s)) return "trending";
    if (/recommended for you/.test(s)) return "recommend";
    if (/popular projects among/.test(s)) return "popular";
    if (/followed\b/.test(s)) return "follow";
    if (/contributed to|merged/.test(s)) return "merged";
    return "other";
  }
  function resolveMode(cfg, key) {
    if (key === "star.starred" || key === "star.list") {
      const own = cfg.modes[key];
      if (own && own !== "inherit") return own;
      return cfg.modes.star || "show";
    }
    return cfg.modes[key] || "show";
  }
  function readFeedCard(article) {
    const raw = article.getAttribute("data-hydro-view");
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      return obj && obj.payload && obj.payload.feed_card || null;
    } catch {
      return null;
    }
  }
  function classifyArticle(article) {
    const card = readFeedCard(article);
    if (card && typeof card.card_type === "string") return classifyCard(card);
    return classifyByText(article.textContent || "");
  }
  function isTopLevelCard(el2) {
    return el2.tagName === "ARTICLE" && !!el2.classList.contains("js-feed-item-component") && !el2.parentElement?.closest("article.js-feed-item-component");
  }
  function topLevelCards(root) {
    return Array.from(root.querySelectorAll("article.js-feed-item-component")).filter(
      isTopLevelCard
    );
  }
  function cardTimestamp(article) {
    const rt = article.querySelector("relative-time[datetime]");
    if (rt) {
      const t = Date.parse(rt.getAttribute("datetime") || "");
      if (!Number.isNaN(t)) return t;
    }
    const card = readFeedCard(article);
    if (card && card.created_at) {
      const t = Date.parse(card.created_at);
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }

  // src/core/labels.ts
  var CATEGORIES = [
    { key: "merged", label: "Merged pull requests" },
    { key: "release", label: "Releases" },
    { key: "trending", label: "Trending repositories" },
    { key: "recommend", label: "Recommended for you" },
    { key: "popular", label: "Popular among people you follow" },
    { key: "created", label: "Created repositories" },
    { key: "fork", label: "Forked repositories" },
    { key: "publicRepo", label: "Made public" },
    { key: "follow", label: "Follows" },
    { key: "other", label: "Other activity" }
  ];
  var STAR_GROUP = {
    key: "star",
    label: "Stars & lists",
    children: [
      { key: "star.starred", label: "Starred repositories" },
      { key: "star.list", label: "Added to a list" }
    ]
  };
  var RIGHT_ITEMS = [
    { key: "banner", label: "Universe banner" },
    { key: "changelog", label: "Changelog" }
  ];
  var MODE_LABELS = [
    { value: "show", label: "Show" },
    { value: "collapse", label: "Collapse" },
    { value: "hide", label: "Hide" }
  ];
  var SUB_MODE_LABELS = [
    { value: "inherit", label: "Inherit" },
    ...MODE_LABELS
  ];
  function labelFor(key) {
    if (key === "star.starred") return STAR_GROUP.children[0].label;
    if (key === "star.list") return STAR_GROUP.children[1].label;
    if (key === "star") return STAR_GROUP.label;
    const hit = CATEGORIES.find((c) => c.key === key);
    return hit ? hit.label : "Other activity";
  }

  // src/core/keywords.ts
  function parseKeywords(value) {
    return value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  function normalizeText(s) {
    return s.replace(/\s+/g, " ").trim().toLowerCase();
  }
  function matchesKeyword(text, keywords) {
    const norm = normalizeText(text);
    if (!norm) return false;
    return keywords.some((kw) => kw.length > 0 && norm.includes(kw.toLowerCase()));
  }

  // src/core/feed.ts
  var END_MARKER_ID = "gff-end-marker";
  var currentCfg = null;
  var timeCutoffHit = false;
  var autoObserver = null;
  var observedButton = null;
  var loadedPages = 0;
  var lastClickAt = 0;
  function setText(el2, text) {
    if (el2.textContent !== text) el2.textContent = text;
  }
  function ensurePlaceholder(el2, label) {
    let ph = el2.previousElementSibling;
    if (!(ph && ph.dataset.gffRole === "placeholder")) {
      ph = document.createElement("div");
      ph.dataset.gffRole = "placeholder";
      ph.className = "gff-placeholder";
      ph.addEventListener("click", () => {
        const expanded = el2.classList.toggle("gff-expanded");
        ph.classList.toggle("gff-expanded", expanded);
        setText(ph, placeholderText(label, expanded));
        if (currentCfg) updateFeedCount(currentCfg);
      });
      el2.parentElement.insertBefore(ph, el2);
    }
    if (!el2.classList.contains("gff-expanded")) {
      setText(ph, placeholderText(label, false));
      ph.classList.remove("gff-expanded");
    } else {
      setText(ph, placeholderText(label, true));
      ph.classList.add("gff-expanded");
    }
  }
  function placeholderText(label, expanded) {
    return expanded ? label + " \u2014 click to collapse" : label + " \u2014 collapsed, click to expand";
  }
  function removePlaceholder(el2) {
    const ph = el2.previousElementSibling;
    if (ph && ph.dataset.gffRole === "placeholder") ph.remove();
  }
  function applyCardMode(el2, mode, key) {
    if (mode === "hide") {
      el2.classList.add("gff-hide");
      el2.classList.remove("gff-collapsed");
      removePlaceholder(el2);
    } else if (mode === "collapse") {
      el2.classList.remove("gff-hide");
      el2.classList.add("gff-collapsed");
      ensurePlaceholder(el2, labelFor(key));
    } else {
      el2.classList.remove("gff-hide", "gff-collapsed", "gff-expanded");
      removePlaceholder(el2);
    }
  }
  function applyFeedCards(cfg) {
    const tf = cfg.timeFilter;
    const cutoff = tf.enabled && tf.days > 0 ? Date.now() - tf.days * 864e5 : null;
    const kw = cfg.keywords;
    const kwList = kw.enabled ? kw.list : [];
    timeCutoffHit = false;
    let cutoffReached = false;
    for (const el2 of topLevelCards(document)) {
      if (cutoff !== null) {
        if (!cutoffReached) {
          const ts = cardTimestamp(el2);
          if (ts !== null && ts < cutoff) cutoffReached = true;
        }
        if (cutoffReached) {
          timeCutoffHit = true;
          applyCardMode(el2, "hide", classifyArticle(el2));
          continue;
        }
      }
      const key = classifyArticle(el2);
      let mode = resolveMode(cfg, key);
      if (kwList.length > 0) {
        const text = el2.textContent || "";
        if (matchesKeyword(text, kwList)) mode = kw.mode;
      }
      applyCardMode(el2, mode, key);
    }
  }
  function placeEndMarker(marker, moreForm, feedContent) {
    let parent;
    let next;
    if (moreForm && moreForm.parentElement) {
      parent = moreForm.parentElement;
      next = moreForm;
    } else if (feedContent) {
      parent = feedContent;
      next = null;
    } else {
      return;
    }
    if (marker.parentElement !== parent || marker.nextElementSibling !== next) {
      parent.insertBefore(marker, next);
    }
  }
  function applyTimeFilterUI(cfg) {
    const tf = cfg.timeFilter;
    const feedContent = document.querySelector('div[data-target="feed-container.content"]');
    const moreForm = feedContent ? feedContent.querySelector("form.js-ajax-pagination") : null;
    let marker = document.getElementById(END_MARKER_ID);
    const active = tf.enabled && timeCutoffHit;
    if (active) {
      if (!marker) {
        marker = document.createElement("div");
        marker.id = END_MARKER_ID;
        marker.className = "gff-end-marker";
      }
      const text = "You\u2019ve reached the end of the feed \u2014 items older than " + tf.days + " day" + (tf.days === 1 ? "" : "s") + " are hidden.";
      setText(marker, text);
      placeEndMarker(marker, moreForm, feedContent);
      if (moreForm) moreForm.classList.add("gff-hide");
    } else {
      if (marker) marker.remove();
      if (moreForm) moreForm.classList.remove("gff-hide");
    }
  }
  function updateFeedCount(_cfg) {
    const el2 = document.getElementById("gff-count");
    if (!el2) return;
    let n = 0;
    for (const card of topLevelCards(document)) {
      if (card.classList.contains("gff-hide")) {
        n++;
        continue;
      }
      if (card.classList.contains("gff-collapsed") && !card.classList.contains("gff-expanded")) n++;
    }
    const text = "Hidden: " + n + " item" + (n === 1 ? "" : "s");
    setText(el2, text);
  }
  function destroyAutoLoad() {
    if (autoObserver) autoObserver.disconnect();
    autoObserver = null;
    observedButton = null;
  }
  function armAutoLoad(cfg) {
    const feedContent = document.querySelector('div[data-target="feed-container.content"]');
    const btn = feedContent ? feedContent.querySelector("form.js-ajax-pagination button") : null;
    if (!cfg.autoLoad.enabled || !btn || timeCutoffHit) {
      destroyAutoLoad();
      return;
    }
    if (btn === observedButton) return;
    destroyAutoLoad();
    observedButton = btn;
    autoObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) maybeAutoClick(cfg);
      }
    }, { rootMargin: "240px" });
    autoObserver.observe(btn);
  }
  function maybeAutoClick(cfg) {
    const al = cfg.autoLoad;
    if (!al.enabled || timeCutoffHit || document.hidden) return;
    if (al.maxPages > 0 && loadedPages >= al.maxPages) return;
    const btn = observedButton;
    if (!btn || !btn.isConnected || btn.disabled) return;
    const now = Date.now();
    if (now - lastClickAt < 800) return;
    lastClickAt = now;
    loadedPages++;
    btn.click();
  }
  function applyFeed(cfg) {
    currentCfg = cfg;
    applyFeedCards(cfg);
    applyTimeFilterUI(cfg);
    armAutoLoad(cfg);
    updateFeedCount(cfg);
  }

  // src/core/right-column.ts
  function setText2(el2, text) {
    if (el2.textContent !== text) el2.textContent = text;
  }
  function ensurePlaceholder2(el2, label) {
    let ph = el2.previousElementSibling;
    if (!(ph && ph.dataset.gffRole === "placeholder")) {
      ph = document.createElement("div");
      ph.dataset.gffRole = "placeholder";
      ph.className = "gff-placeholder";
      ph.addEventListener("click", () => {
        const expanded = el2.classList.toggle("gff-expanded");
        ph.classList.toggle("gff-expanded", expanded);
        setText2(ph, placeholderText2(label, expanded));
      });
      el2.parentElement.insertBefore(ph, el2);
    }
    if (!el2.classList.contains("gff-expanded")) {
      setText2(ph, placeholderText2(label, false));
      ph.classList.remove("gff-expanded");
    } else {
      setText2(ph, placeholderText2(label, true));
      ph.classList.add("gff-expanded");
    }
  }
  function placeholderText2(label, expanded) {
    return expanded ? label + " \u2014 click to collapse" : label + " \u2014 collapsed, click to expand";
  }
  function removePlaceholder2(el2) {
    const ph = el2.previousElementSibling;
    if (ph && ph.dataset.gffRole === "placeholder") ph.remove();
  }
  function applyMode(el2, mode, label) {
    if (mode === "hide") {
      el2.classList.add("gff-hide");
      el2.classList.remove("gff-collapsed");
      removePlaceholder2(el2);
    } else if (mode === "collapse") {
      el2.classList.remove("gff-hide");
      el2.classList.add("gff-collapsed");
      ensurePlaceholder2(el2, label);
    } else {
      el2.classList.remove("gff-hide", "gff-collapsed", "gff-expanded");
      removePlaceholder2(el2);
    }
  }
  function applyRightColumn(cfg) {
    const aside = document.querySelector("aside.feed-right-column");
    if (!aside) return;
    let visibleParts = 0;
    for (const item of RIGHT_ITEMS) {
      const sel = item.key === "banner" ? ".js-notice.marketing-banner" : ".dashboard-changelog";
      const el2 = aside.querySelector(sel);
      if (!el2) continue;
      const mode = cfg.right[item.key] || "show";
      applyMode(el2, mode, item.label);
      if (mode !== "hide") visibleParts++;
    }
    aside.classList.toggle("gff-hide", visibleParts === 0);
  }

  // src/core/ownership.ts
  var ORG_TTL_MS = 24 * 60 * 60 * 1e3;
  function getViewerLogin() {
    const el2 = document.querySelector('meta[name="user-login"]');
    const v = el2?.getAttribute("content")?.trim();
    return v ? v : null;
  }
  function getRepoNwo() {
    const el2 = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
    const v = el2?.getAttribute("content")?.trim();
    return v && v.includes("/") ? v : null;
  }
  function parseOrgLogins(html) {
    const found = /* @__PURE__ */ new Set();
    const addFromHref = (href) => {
      if (!href) return;
      const path = href.split("?")[0].split("#")[0];
      let m2 = path.match(/^\/orgs\/([^/]+)/);
      if (m2) {
        found.add(m2[1].toLowerCase());
        return;
      }
      m2 = path.match(/^\/organizations\/([^/]+)/);
      if (m2) {
        found.add(m2[1].toLowerCase());
        return;
      }
      m2 = path.match(/^\/([A-Za-z0-9-]+)\/?$/);
      if (m2 && !isReservedPath(m2[1])) {
        found.add(m2[1].toLowerCase());
      }
    };
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const a of doc.querySelectorAll("a[href]")) {
        if (a.getAttribute("data-hovercard-type") === "organization") {
          addFromHref(a.getAttribute("href"));
          continue;
        }
        const href = a.getAttribute("href") || "";
        if (href.startsWith("/orgs/") || href.startsWith("/organizations/")) {
          addFromHref(href);
        }
      }
      for (const el2 of doc.querySelectorAll("[data-hovercard-url]")) {
        const u = el2.getAttribute("data-hovercard-url") || "";
        const m2 = u.match(/^\/orgs\/([^/]+)/);
        if (m2) found.add(m2[1].toLowerCase());
      }
    } catch {
    }
    const re = /href="\/(?:orgs|organizations)\/([^/"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      found.add(m[1].toLowerCase());
    }
    return Array.from(found);
  }
  var RESERVED = /* @__PURE__ */ new Set([
    "settings",
    "orgs",
    "organizations",
    "users",
    "topics",
    "collections",
    "sponsors",
    "notifications",
    "new",
    "login",
    "signup",
    "marketplace",
    "trending",
    "explore",
    "features",
    "pricing",
    "about",
    "site",
    "apps",
    "codespaces",
    "account",
    "search",
    "pulls",
    "issues",
    "dashboard",
    "enterprises",
    "customer-stories",
    "resources",
    "readme",
    "team",
    "enterprise",
    "blog",
    "contact",
    "security",
    "terms",
    "privacy",
    "github",
    "copilot",
    "solutions"
  ]);
  function isReservedPath(s) {
    return RESERVED.has(s.toLowerCase());
  }
  async function fetchOrgLogins() {
    const res = await fetch("/settings/organizations", {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return parseOrgLogins(html);
  }
  async function loadOrgInfo(extra, force = false) {
    const viewer = getViewerLogin();
    if (!viewer) return { viewer: null, orgs: [], source: "logged-out" };
    const now = Date.now();
    let cache = readOrgCache();
    let source = "cache";
    if (force || !cache || now - cache.fetchedAt > ORG_TTL_MS) {
      try {
        const logins = await fetchOrgLogins();
        cache = { logins, fetchedAt: now };
        writeOrgCache(cache);
        source = "github";
      } catch {
        source = cache ? "cache" : "error";
      }
    }
    const set = /* @__PURE__ */ new Set();
    for (const l of cache?.logins ?? []) set.add(l.toLowerCase());
    for (const l of extra) {
      const v = l.trim().toLowerCase();
      if (v) set.add(v);
    }
    return { viewer, orgs: Array.from(set), source };
  }
  async function getEffectiveOrgs(extra) {
    const info = await loadOrgInfo(extra);
    return new Set(info.orgs);
  }
  function isOwnOrOrg(owner, viewer, orgs) {
    const o = owner.toLowerCase();
    if (viewer && o === viewer.toLowerCase()) return true;
    return orgs.has(o);
  }

  // src/core/stargazers.ts
  var BTN_ID = "gff-stargazers-btn";
  var LABEL = "Stargazers";
  var PEOPLE_SVG = '<svg data-component="Octicon" aria-hidden="true" focusable="false" class="octicon octicon-people" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" display="inline-block" overflow="visible" style="vertical-align: text-bottom;"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 0 11 5.5Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z"></path></svg>';
  var getCfg = null;
  var orgsSet = null;
  var orgsPromise = null;
  var orgsExtraKey = "";
  var wired = false;
  var scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      inject();
    });
  }
  async function ensureOrgs(extra) {
    const key = extra.join("\n");
    if (orgsPromise && key === orgsExtraKey) return orgsPromise;
    orgsExtraKey = key;
    orgsPromise = getEffectiveOrgs(extra).catch(() => /* @__PURE__ */ new Set());
    return orgsPromise;
  }
  function inject() {
    if (!getCfg) return;
    const cfg = getCfg().features.stargazers;
    if (!cfg.enabled) return;
    if (!matchesAny(location.href, cfg.urls)) return;
    const viewer = getViewerLogin();
    if (!viewer) return;
    const nwo = getRepoNwo();
    if (!nwo) return;
    const owner = nwo.split("/")[0];
    const repo = nwo.split("/")[1];
    if (!owner || !repo) return;
    const header = document.querySelector('ul[data-testid="repo-header-actions"]');
    if (!header) return;
    const existing = document.getElementById(BTN_ID);
    if (existing && existing.isConnected) {
      const want = `/${owner}/${repo}/stargazers`;
      if (existing.getAttribute("href") !== want) {
        existing.setAttribute("href", want);
      }
      return;
    }
    if (cfg.onlyOwn) {
      void ensureOrgs(cfg.extraOrgs).then((set) => {
        orgsSet = set;
        scheduleInject();
      });
      if (!orgsSet) return;
      if (!isOwnOrOrg(owner, viewer, orgsSet)) return;
    }
    const sample = header.querySelector('a[data-testid="fork-button"]') || header.querySelector('a[data-component="Button"]');
    if (!sample) return;
    const a = sample.cloneNode(true);
    a.id = BTN_ID;
    a.href = `/${owner}/${repo}/stargazers`;
    a.removeAttribute("aria-describedby");
    a.setAttribute("data-testid", "stargazers-button");
    a.setAttribute("aria-label", `View stargazers of ${owner}/${repo}`);
    a.removeAttribute("target");
    a.removeAttribute("rel");
    const oldSvg = a.querySelector("svg");
    if (oldSvg) {
      const tmp = document.createElement("div");
      tmp.innerHTML = PEOPLE_SVG;
      oldSvg.replaceWith(tmp.firstElementChild);
    }
    const label = a.querySelector('[data-component="text"]') || a.querySelector(".prc-Button-Label-FWkx3") || a.querySelector('span[data-component="buttonContent"] span:last-child');
    if (label) {
      while (label.firstChild) label.removeChild(label.firstChild);
      label.textContent = LABEL;
    }
    const li = document.createElement("li");
    li.appendChild(a);
    header.appendChild(li);
  }
  var SPA_EVENTS = [
    "turbo:load",
    "turbo:render",
    "turbo:frame-load",
    "turbo:before-render",
    "pjax:end",
    "soft-nav:end",
    "soft-nav:render"
  ];
  function initStargazers(cfgGetter) {
    getCfg = cfgGetter;
    if (wired) {
      scheduleInject();
      return;
    }
    wired = true;
    scheduleInject();
    for (const ev of SPA_EVENTS) {
      document.addEventListener(ev, scheduleInject);
    }
    window.addEventListener("popstate", scheduleInject);
    window.addEventListener("hashchange", scheduleInject);
    const observer = new MutationObserver(scheduleInject);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    window.setInterval(scheduleInject, 1e3);
  }
  function refreshStargazersOrgs() {
    orgsSet = null;
    orgsPromise = null;
    orgsExtraKey = "";
    scheduleInject();
  }

  // src/ui/styles.ts
  var STYLE_ID = "gff-style";
  var CSS = `
.gff-hide { display: none !important; }
.gff-collapsed:not(.gff-expanded) { display: none !important; }

.gff-placeholder {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; margin: 4px 0;
  border: 1px dashed var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-muted, rgba(175,184,193,.2));
  color: var(--fgColor-muted, #656d76);
  font-size: 12px; cursor: pointer; user-select: none;
}
.gff-placeholder:hover { border-color: var(--fgColor-muted, #656d76); }
.gff-placeholder::before { content: "\\25B8"; font-size: 10px; }
.gff-placeholder.gff-expanded::before { content: "\\25BE"; }

.gff-end-marker {
  padding: 24px 16px; text-align: center;
  color: var(--fgColor-muted, #656d76);
  font-size: 14px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  margin-top: 8px;
}

/* ---------- Settings overlay ---------- */

.gff-overlay {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(1,4,9,.55);
  padding: 24px;
}
.gff-overlay[hidden] { display: none; }

.gff-dialog {
  width: min(760px, 96vw);
  max-height: 90vh; overflow-y: auto;
  background: var(--bgColor-default, #fff);
  color: var(--fgColor-default, #1f2328);
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(1,4,9,.45);
  padding: 18px 22px 22px;
  font-size: 13px;
  text-align: left;
}
.gff-dialog h2 {
  margin: 0 0 4px; font-size: 16px; font-weight: 600;
}
.gff-dialog h3 {
  margin: 16px 0 6px; font-size: 12px; font-weight: 600;
  color: var(--fgColor-muted, #656d76);
  text-transform: uppercase; letter-spacing: .04em;
  border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
  padding-bottom: 4px;
}
.gff-dialog h3:first-of-type { margin-top: 8px; }

.gff-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
}
.gff-close {
  background: transparent; border: 0; cursor: pointer;
  font-size: 20px; line-height: 1; color: var(--fgColor-muted, #656d76);
  padding: 2px 6px; border-radius: 6px;
}
.gff-close:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }

.gff-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 3px 0;
}
.gff-row-label { flex: 1; min-width: 0; }
.gff-row-label small {
  display: block; color: var(--fgColor-muted, #656d76); font-size: 11px;
}

.gff-seg {
  display: inline-flex; flex-shrink: 0;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px; overflow: hidden;
}
.gff-seg button {
  padding: 2px 9px; font-size: 12px; line-height: 18px;
  background: transparent; border: 0; cursor: pointer;
  color: var(--fgColor-muted, #656d76);
}
.gff-seg button + button { border-left: 1px solid var(--borderColor-default, #d0d7de); }
.gff-seg button:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
.gff-seg button.gff-active {
  background: var(--bgColor-accent-emphasis, #0969da);
  color: var(--fgColor-onEmphasis, #fff);
  font-weight: 600;
}

.gff-group-toggle {
  background: transparent; border: 0; cursor: pointer; padding: 0 4px;
  color: var(--fgColor-muted, #656d76); font-size: 10px;
}
.gff-sub {
  padding-left: 14px; border-left: 2px solid var(--borderColor-muted, #d8dee4);
  margin-left: 3px;
}
.gff-sub[hidden] { display: none; }

.gff-check-row {
  display: flex; align-items: center; gap: 7px; padding: 4px 0;
  cursor: pointer;
}
.gff-check-row input { cursor: pointer; }

.gff-num, .gff-text, .gff-textarea {
  padding: 3px 6px; font-size: 12px;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  background: var(--bgColor-default, #fff);
  color: var(--fgColor-default, #1f2328);
}
.gff-num { width: 64px; }
.gff-text { width: 220px; }
.gff-textarea {
  width: 100%; min-height: 72px; resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.5;
}
.gff-textarea[disabled], .gff-num[disabled] { opacity: .55; }

.gff-hint { color: var(--fgColor-muted, #656d76); font-size: 11px; margin: 2px 0 6px; }
.gff-status { color: var(--fgColor-muted, #656d76); font-size: 11px; margin-top: 4px; }

.gff-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-top: 14px; padding-top: 10px;
  border-top: 1px solid var(--borderColor-muted, #d8dee4);
  color: var(--fgColor-muted, #656d76); font-size: 12px;
}
.gff-btn {
  padding: 4px 12px; font-size: 12px; cursor: pointer;
  background: transparent;
  border: 1px solid var(--borderColor-default, #d0d7de);
  border-radius: 6px;
  color: var(--fgColor-default, #1f2328);
}
.gff-btn:hover { background: var(--bgColor-muted, rgba(175,184,193,.2)); }
`;
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // src/ui/panel.ts
  var overlay = null;
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && overlay && !overlay.hidden) closePanel();
  });
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function segControl(scope, key, current, labels) {
    const wrap = el("span", "gff-seg");
    for (const opt of labels) {
      const b = el("button");
      b.type = "button";
      b.textContent = opt.label;
      b.dataset.scope = scope;
      b.dataset.key = key;
      b.dataset.value = opt.value;
      if (opt.value === current) b.classList.add("gff-active");
      wrap.appendChild(b);
    }
    return wrap;
  }
  function row(labelText, control, sub) {
    const r = el("div", "gff-row");
    const l = el("span", "gff-row-label", labelText);
    r.appendChild(l);
    r.appendChild(control);
    if (sub) r.appendChild(sub);
    return r;
  }
  function checkRow(id, labelText, checked, onChange2) {
    const label = el("label", "gff-check-row");
    const input = el("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = checked;
    input.addEventListener("change", () => onChange2(input.checked));
    label.appendChild(input);
    label.appendChild(el("span", void 0, labelText));
    return label;
  }
  function statusText(info) {
    switch (info.source) {
      case "github":
        return "Organizations loaded from GitHub.";
      case "cache":
        return "Using the cached organization list.";
      case "error":
        return "Could not load organizations \u2014 add them manually below.";
      case "logged-out":
        return "Sign in to GitHub to detect your organizations.";
      default:
        return "";
    }
  }
  function orgsText(info) {
    if (info.source === "logged-out") return "\u2014";
    if (info.orgs.length === 0) return "none detected";
    return info.orgs.join(", ");
  }
  function buildPanel(ctx) {
    const cfg = ctx.getConfig();
    const overlayEl = el("div", "gff-overlay");
    overlayEl.id = "gff-overlay";
    overlayEl.hidden = true;
    const dialog = el("div", "gff-dialog");
    overlayEl.appendChild(dialog);
    const head = el("div", "gff-head");
    head.appendChild(el("h2", void 0, "GitHub Feed Filter"));
    const closeBtn = el("button", "gff-close", "\xD7");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close settings");
    closeBtn.addEventListener("click", () => closePanel());
    head.appendChild(closeBtn);
    dialog.appendChild(head);
    dialog.appendChild(el("h3", void 0, "Features"));
    dialog.appendChild(
      checkRow("gff-feed-enabled", "Feed filter", cfg.features.feed.enabled, (v) => {
        cfg.features.feed.enabled = v;
        ctx.onChange(cfg);
      })
    );
    dialog.appendChild(el("div", "gff-hint", "Feed filter URLs (one per line):"));
    const feedUrls = el("textarea", "gff-textarea");
    feedUrls.id = "gff-feed-urls";
    feedUrls.value = cfg.features.feed.urls.join("\n");
    dialog.appendChild(feedUrls);
    dialog.appendChild(
      checkRow(
        "gff-right-enabled",
        "Right column (Explore)",
        cfg.features.rightColumn.enabled,
        (v) => {
          cfg.features.rightColumn.enabled = v;
          ctx.onChange(cfg);
        }
      )
    );
    dialog.appendChild(el("div", "gff-hint", "Right column URLs (one per line):"));
    const rightUrls = el("textarea", "gff-textarea");
    rightUrls.id = "gff-right-urls";
    rightUrls.value = cfg.features.rightColumn.urls.join("\n");
    dialog.appendChild(rightUrls);
    dialog.appendChild(
      checkRow("gff-stg-enabled", "Stargazers button", cfg.features.stargazers.enabled, (v) => {
        cfg.features.stargazers.enabled = v;
        ctx.onChange(cfg);
      })
    );
    dialog.appendChild(el("div", "gff-hint", "Stargazer URLs (one per line):"));
    const stgUrls = el("textarea", "gff-textarea");
    stgUrls.id = "gff-stg-urls";
    stgUrls.value = cfg.features.stargazers.urls.join("\n");
    dialog.appendChild(stgUrls);
    dialog.appendChild(
      checkRow(
        "gff-stg-onlyown",
        "Only my repositories and organizations",
        cfg.features.stargazers.onlyOwn,
        (v) => {
          cfg.features.stargazers.onlyOwn = v;
          ctx.onChange(cfg);
          refreshStargazersOrgs();
        }
      )
    );
    const viewerRow = el("div", "gff-row");
    viewerRow.appendChild(el("span", "gff-row-label", "Signed in as:"));
    const viewerSpan = el("span", "gff-row-label", "\u2026");
    viewerSpan.id = "gff-stg-viewer";
    viewerRow.appendChild(viewerSpan);
    dialog.appendChild(viewerRow);
    const orgsRow = el("div", "gff-row");
    const orgsLabel = el("span", "gff-row-label");
    orgsLabel.appendChild(document.createTextNode("Organizations: "));
    const orgsSpan = el("span", void 0, "\u2026");
    orgsSpan.id = "gff-stg-orgs";
    orgsLabel.appendChild(orgsSpan);
    orgsRow.appendChild(orgsLabel);
    const refreshBtn = el("button", "gff-btn", "Refresh");
    refreshBtn.type = "button";
    orgsRow.appendChild(refreshBtn);
    dialog.appendChild(orgsRow);
    dialog.appendChild(el("div", "gff-hint", "Additional organizations (one per line):"));
    const extraOrgs = el("textarea", "gff-textarea");
    extraOrgs.id = "gff-stg-extra";
    extraOrgs.value = cfg.features.stargazers.extraOrgs.join("\n");
    dialog.appendChild(extraOrgs);
    const statusEl = el("div", "gff-status");
    statusEl.id = "gff-stg-status";
    dialog.appendChild(statusEl);
    const refreshOrgs = async (force) => {
      const info = await ctx.loadOrgInfo(parseKeywords(extraOrgs.value), force);
      viewerSpan.textContent = info.viewer ?? "not signed in";
      orgsSpan.textContent = orgsText(info);
      statusEl.textContent = statusText(info);
    };
    void refreshOrgs(false);
    refreshBtn.addEventListener("click", () => void refreshOrgs(true));
    dialog.appendChild(el("h3", void 0, "Feed filters"));
    for (const cat of CATEGORIES) {
      dialog.appendChild(
        row(cat.label, segControl("modes", cat.key, cfg.modes[cat.key], MODE_LABELS))
      );
    }
    const groupRow = el("div", "gff-row");
    const groupLabel = el("span", "gff-row-label", STAR_GROUP.label);
    const expandBtn = el("button", "gff-group-toggle", "\u25B8");
    expandBtn.type = "button";
    expandBtn.title = "Show sub-types";
    groupRow.appendChild(groupLabel);
    groupRow.appendChild(expandBtn);
    groupRow.appendChild(segControl("modes", "star", cfg.modes.star, MODE_LABELS));
    dialog.appendChild(groupRow);
    const subWrap = el("div", "gff-sub");
    subWrap.hidden = true;
    for (const child of STAR_GROUP.children) {
      subWrap.appendChild(
        row(child.label, segControl("modes", child.key, cfg.modes[child.key], SUB_MODE_LABELS))
      );
    }
    dialog.appendChild(subWrap);
    expandBtn.addEventListener("click", () => {
      subWrap.hidden = !subWrap.hidden;
      expandBtn.textContent = subWrap.hidden ? "\u25B8" : "\u25BE";
    });
    dialog.appendChild(el("h3", void 0, "Keywords"));
    dialog.appendChild(
      checkRow("gff-kw-enabled", "Block by keyword", cfg.keywords.enabled, (v) => {
        cfg.keywords.enabled = v;
        ctx.onChange(cfg);
      })
    );
    dialog.appendChild(
      row(
        "When matched",
        segControl("keywords", "mode", cfg.keywords.mode, MODE_LABELS)
      )
    );
    dialog.appendChild(el("div", "gff-hint", "One keyword per line (case-insensitive substring):"));
    const kwList = el("textarea", "gff-textarea");
    kwList.id = "gff-kw-list";
    kwList.value = cfg.keywords.list.join("\n");
    dialog.appendChild(kwList);
    dialog.appendChild(el("h3", void 0, "Right column"));
    for (const item of RIGHT_ITEMS) {
      dialog.appendChild(
        row(item.label, segControl("right", item.key, cfg.right[item.key], MODE_LABELS))
      );
    }
    dialog.appendChild(
      el("div", "gff-hint", "Hiding both removes the whole Explore sidebar.")
    );
    dialog.appendChild(el("h3", void 0, "Time filter"));
    const tfRow = el("label", "gff-check-row");
    const tfCheck = el("input");
    tfCheck.type = "checkbox";
    tfCheck.id = "gff-time-enabled";
    tfCheck.checked = cfg.timeFilter.enabled;
    const tfLabel = el("span", void 0, "Hide items older than ");
    const tfNum = el("input", "gff-num");
    tfNum.type = "number";
    tfNum.id = "gff-time-days";
    tfNum.min = "1";
    tfNum.max = "3650";
    tfNum.value = String(cfg.timeFilter.days);
    tfNum.disabled = !cfg.timeFilter.enabled;
    const tfUnit = el("span", void 0, " day(s)");
    tfRow.appendChild(tfCheck);
    tfRow.appendChild(tfLabel);
    tfRow.appendChild(tfNum);
    tfRow.appendChild(tfUnit);
    dialog.appendChild(tfRow);
    dialog.appendChild(
      el(
        "div",
        "gff-hint",
        'Older cards are removed from the bottom and the "More" button is dropped.'
      )
    );
    dialog.appendChild(el("h3", void 0, "Auto-load"));
    const alRow = el("label", "gff-check-row");
    const alCheck = el("input");
    alCheck.type = "checkbox";
    alCheck.id = "gff-autoload";
    alCheck.checked = cfg.autoLoad.enabled;
    alRow.appendChild(alCheck);
    alRow.appendChild(el("span", void 0, "Auto-load feed (auto-expand while scrolling)"));
    dialog.appendChild(alRow);
    const alRow2 = el("label", "gff-check-row");
    const alNum = el("input", "gff-num");
    alNum.type = "number";
    alNum.id = "gff-autoload-pages";
    alNum.min = "0";
    alNum.value = String(cfg.autoLoad.maxPages);
    alNum.disabled = !cfg.autoLoad.enabled;
    alRow2.appendChild(alNum);
    alRow2.appendChild(el("span", void 0, "Page limit (0 = unlimited)"));
    dialog.appendChild(alRow2);
    const footer = el("div", "gff-footer");
    const count = el("span", void 0, "Hidden: 0 items");
    count.id = "gff-count";
    const reset = el("button", "gff-btn", "Reset to defaults");
    reset.type = "button";
    reset.id = "gff-reset";
    footer.appendChild(count);
    footer.appendChild(reset);
    dialog.appendChild(footer);
    dialog.addEventListener("click", (ev) => {
      const target = ev.target;
      const btn = target?.closest(".gff-seg button");
      if (!btn) return;
      const { scope, key, value } = btn.dataset;
      if (scope === "modes" && key) {
        cfg.modes[key] = value;
      } else if (scope === "right" && key) {
        cfg.right[key] = value;
      } else if (scope === "keywords" && key) {
        cfg.keywords[key] = value;
      } else {
        return;
      }
      for (const b of btn.parentElement.children) {
        b.classList.toggle("gff-active", b === btn);
      }
      ctx.onChange(cfg);
    });
    feedUrls.addEventListener("change", () => {
      cfg.features.feed.urls = parseKeywords(feedUrls.value);
      ctx.onChange(cfg);
    });
    rightUrls.addEventListener("change", () => {
      cfg.features.rightColumn.urls = parseKeywords(rightUrls.value);
      ctx.onChange(cfg);
    });
    stgUrls.addEventListener("change", () => {
      cfg.features.stargazers.urls = parseKeywords(stgUrls.value);
      ctx.onChange(cfg);
    });
    extraOrgs.addEventListener("change", () => {
      cfg.features.stargazers.extraOrgs = parseKeywords(extraOrgs.value);
      ctx.onChange(cfg);
    });
    kwList.addEventListener("change", () => {
      cfg.keywords.list = parseKeywords(kwList.value);
      ctx.onChange(cfg);
    });
    tfCheck.addEventListener("change", () => {
      cfg.timeFilter.enabled = tfCheck.checked;
      tfNum.disabled = !tfCheck.checked;
      ctx.onChange(cfg);
    });
    tfNum.addEventListener("change", () => {
      let v = parseInt(tfNum.value, 10);
      if (Number.isNaN(v) || v < 1) v = 1;
      if (v > 3650) v = 3650;
      tfNum.value = String(v);
      cfg.timeFilter.days = v;
      ctx.onChange(cfg);
    });
    alCheck.addEventListener("change", () => {
      cfg.autoLoad.enabled = alCheck.checked;
      alNum.disabled = !alCheck.checked;
      ctx.onChange(cfg);
    });
    alNum.addEventListener("change", () => {
      let v = parseInt(alNum.value, 10);
      if (Number.isNaN(v) || v < 0) v = 0;
      alNum.value = String(v);
      cfg.autoLoad.maxPages = v;
      ctx.onChange(cfg);
    });
    reset.addEventListener("click", () => ctx.onReset());
    overlayEl.addEventListener("click", (ev) => {
      if (ev.target === overlayEl) closePanel();
    });
    return overlayEl;
  }
  function openPanel(ctx) {
    ensureStyles();
    closePanel();
    overlay = buildPanel(ctx);
    document.body.appendChild(overlay);
    overlay.hidden = false;
  }
  function closePanel() {
    if (overlay && overlay.parentElement) overlay.remove();
    overlay = null;
  }

  // src/main.ts
  var config = loadConfig();
  function getConfig() {
    return config;
  }
  var applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      applyAll();
    });
  }
  function applyAll() {
    const url = location.href;
    const feedActive = config.features.feed.enabled && matchesAny(url, config.features.feed.urls);
    const rightActive = config.features.rightColumn.enabled && matchesAny(url, config.features.rightColumn.urls);
    if (feedActive) applyFeed(config);
    if (rightActive) applyRightColumn(config);
  }
  function onChange(cfg) {
    config = cfg;
    saveConfig(config);
    scheduleApply();
  }
  function onReset() {
    config = cloneDefault();
    saveConfig(config);
    scheduleApply();
    openPanel(panelCtx);
  }
  var panelCtx = {
    getConfig,
    onChange,
    onReset,
    loadOrgInfo
  };
  ensureStyles();
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("GitHub Feed Filter \u2014 Settings", () => openPanel(panelCtx));
    GM_registerMenuCommand("GitHub Feed Filter \u2014 Reset to defaults", () => {
      config = cloneDefault();
      saveConfig(config);
      scheduleApply();
    });
  }
  for (const ev of ["turbo:load", "turbo:frame-load", "pjax:end"]) {
    document.addEventListener(ev, () => setTimeout(scheduleApply, 0));
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleApply();
  });
  if (document.body) {
    const observer = new MutationObserver(() => scheduleApply());
    observer.observe(document.body, { childList: true, subtree: true });
  }
  initStargazers(getConfig);
  scheduleApply();
})();
