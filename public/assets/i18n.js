/* ──────────────────────────────────────────────────────────────
 * i18n.js — 한국어/영어/태국어 런타임 다국어
 *  · 브라우저 기본 언어 감지 → ko/en/th 중 하나로 초기 설정
 *  · 우상단 언어 전환기(🌐) — 변경 시 전체 화면 즉시 번역, 사용자 선택 저장
 *  · 한국어 원문을 키로 하는 사전(window.I18N_DICT) 기반 DOM 텍스트/placeholder/title 번역
 *  · MutationObserver 로 동적으로 그려지는 화면까지 자동 번역
 *  · 사전에 없는 문구는 한국어 원문 유지(점진 확장)
 * ────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var SUPPORTED = ["ko", "en", "th"];
  var NAMES = { ko: "한국어", en: "English", th: "ไทย" };
  var DICT = window.I18N_DICT || {};
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, OPTION: 0 };

  function detect() {
    try {
      var saved = localStorage.getItem("app_lang");
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    var langs = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || "").toLowerCase();
      if (l.indexOf("th") === 0) return "th";
      if (l.indexOf("ko") === 0) return "ko";
      if (l.indexOf("en") === 0) return "en";
    }
    return "en"; // 셋 중 매칭 없으면 영어
  }
  var lang = detect();

  function tr(key) {
    if (lang === "ko") return null;
    var m = DICT[lang];
    return (m && m[key] != null) ? m[key] : null;
  }
  // 사전 조회 — 전체 일치 우선, 없으면 선행 이모지/기호(💾 ➕ 등) 분리 후 본문만 번역
  function translateKey(s) {
    if (lang === "ko" || !s) return null;
    var t = tr(s);
    if (t != null) return t;
    var m = s.match(/^([^가-힣A-Za-z0-9]+\s*)([가-힣A-Za-z0-9].*)$/);
    if (m) { var rest = tr(m[2].trim()); if (rest != null) return m[1] + rest; }
    return null;
  }

  // ── 텍스트 노드 번역(원문 보존 → 항상 원문 기준 재계산, 멱등) ──
  function applyText(node) {
    var cur = node.nodeValue;
    if (cur == null || !cur.trim()) return;
    var orig = node.__i18nOrig;
    if (orig == null) orig = cur;
    else if (cur !== orig && cur !== node.__i18nTrans) orig = cur; // 앱이 새 값으로 교체
    node.__i18nOrig = orig;
    var t = translateKey(orig.trim());
    var desired = orig;
    if (t != null) {
      var lead = (orig.match(/^\s*/) || [""])[0];
      var trail = (orig.match(/\s*$/) || [""])[0];
      desired = lead + t + trail;
    }
    node.__i18nTrans = desired;
    if (cur !== desired) node.nodeValue = desired;
  }

  function applyAttr(el, attr) {
    var cur = el.getAttribute(attr);
    if (cur == null || !cur.trim()) return;
    var ok = "__i18n_" + attr, tk = ok + "_t";
    var orig = el[ok];
    if (orig == null) orig = cur;
    else if (cur !== orig && cur !== el[tk]) orig = cur;
    el[ok] = orig;
    var t = translateKey(orig.trim());
    var desired = (t != null) ? t : orig;
    el[tk] = desired;
    if (cur !== desired) el.setAttribute(attr, desired);
  }

  function skipped(el) {
    while (el) {
      if (el.nodeType === 1) {
        if (SKIP_TAGS[el.nodeName] === 1) return true;
        if (el.getAttribute && el.getAttribute("data-i18n-skip") != null) return true;
      }
      el = el.parentNode;
    }
    return false;
  }

  function translateEl(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root.parentNode)) applyText(root); return; }
    if (root.nodeType !== 1) return;
    if (skipped(root)) return;
    // 텍스트 노드
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return skipped(n.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var list = [], x;
    while ((x = walker.nextNode())) list.push(x);
    for (var i = 0; i < list.length; i++) applyText(list[i]);
    // 속성(placeholder/title)
    var self = (root.hasAttribute) ? [root] : [];
    var attrEls = self.concat(Array.prototype.slice.call(root.querySelectorAll("[placeholder],[title]")));
    for (var j = 0; j < attrEls.length; j++) {
      var el = attrEls[j];
      if (skipped(el)) continue;
      if (el.hasAttribute("placeholder")) applyAttr(el, "placeholder");
      if (el.hasAttribute("title")) applyAttr(el, "title");
    }
  }

  function translateAll() { if (document.body) translateEl(document.body); }

  // ── 동적 화면 번역 ──
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var nd = m.addedNodes[j];
          if (nd.nodeType === 1) translateEl(nd);
          else if (nd.nodeType === 3 && !skipped(nd.parentNode)) applyText(nd);
        }
      } else if (m.type === "characterData") {
        if (!skipped(m.target.parentNode)) applyText(m.target);
      }
    }
  });
  var observing = false;
  function startObs() { if (!observing && document.body) { obs.observe(document.body, { childList: true, subtree: true, characterData: true }); observing = true; } }
  function stopObs() { if (observing) { obs.disconnect(); observing = false; } }

  // ── 언어 전환기(우상단 고정) ──
  function injectSwitcher() {
    if (document.getElementById("i18n-switch")) return;
    var box = document.createElement("div");
    box.id = "i18n-switch";
    box.setAttribute("data-i18n-skip", "");
    box.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:99999;display:flex;gap:2px;align-items:center;" +
      "background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:999px;padding:3px 5px;" +
      "box-shadow:0 3px 12px rgba(0,0,0,.18);font-size:12px;";
    box.innerHTML = '<span style="padding:0 4px;color:#94a3b8;">🌐</span>';
    SUPPORTED.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = l === "ko" ? "한" : (l === "en" ? "EN" : "ไทย");
      b.title = NAMES[l];
      b.dataset.lang = l;
      b.style.cssText = "border:none;background:none;cursor:pointer;border-radius:999px;padding:3px 8px;font-weight:700;color:#475569;line-height:1.2;";
      b.onclick = function () { setLang(l); };
      box.appendChild(b);
    });
    document.body.appendChild(box);
    paintSwitcher();
  }
  function paintSwitcher() {
    var box = document.getElementById("i18n-switch");
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
      var on = b.dataset.lang === lang;
      b.style.background = on ? "#1d4ed8" : "none";
      b.style.color = on ? "#fff" : "#475569";
    });
  }

  function setLang(l) {
    if (SUPPORTED.indexOf(l) < 0) return;
    lang = l;
    try { localStorage.setItem("app_lang", l); } catch (e) {}
    document.documentElement.setAttribute("lang", l);
    translateAll();      // ko 면 원문 복원, 그 외 번역
    if (l === "ko") stopObs(); else startObs();
    paintSwitcher();
  }

  function init() {
    document.documentElement.setAttribute("lang", lang);
    injectSwitcher();
    if (lang !== "ko") { translateAll(); startObs(); }   // 한국어 기본은 오버헤드 없음
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.I18N = {
    setLang: setLang,
    get lang() { return lang; },
    t: function (key) { var v = tr(key); return v == null ? key : v; },
    refresh: translateAll,
  };
})();
