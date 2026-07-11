/* ──────────────────────────────────────────────────────────────
 * grid-columns.js — 모든 그리드(표) 컬럼 조정
 *  · 각 표 우상단에 '⚙ 컬럼조정' 버튼 자동 삽입
 *  · 컬럼 표시/숨김(체크박스) + 드래그앤드랍 순서변경
 *  · 설정은 로그인 사용자별로 서버 저장 (/api/grid-prefs)
 *  · 동적으로 다시 그려지는 표·이후 추가되는 표에도 자동 적용
 *  · 대상: 단일행 헤더(th) 데이터 그리드. data-nocols 로 제외 가능
 * ────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var prefsCache = {};      // grid_key -> { order:[origIdx...], hidden:[origIdx...] }
  var prefsLoaded = false;
  var COOKIE_CONSENT = "tt_cookie_consent";
  var COOKIE_PREFIX = "tt_grid_widths_";
  var COOKIE_ALIGN_PREFIX = "tt_grid_align_";
  var sessionWidths = {};
  var sessionAligns = {};

  // ── 유틸 ──
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function cleanLabel(th) { return (th.textContent || "").replace(/[▲▼★]/g, "").trim(); }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function getCookie(name) {
    var parts = ("; " + document.cookie).split("; " + name + "=");
    return parts.length === 2 ? decodeURIComponent(parts.pop().split(";").shift() || "") : "";
  }
  function setCookie(name, value, days) {
    var maxAge = days ? "; max-age=" + (days * 86400) : "";
    document.cookie = name + "=" + encodeURIComponent(value) + maxAge + "; path=/; SameSite=Lax";
  }
  function hasCookieConsent() { return getCookie(COOKIE_CONSENT) === "yes"; }
  function consentDecided() { return !!getCookie(COOKIE_CONSENT); }
  function cookieNameForKey(key) { return (COOKIE_PREFIX + key).slice(0, 180); }
  function cookieKey(table) { return cookieNameForKey(gridKey(table)); }
  function alignCookieNameForKey(key) { return (COOKIE_ALIGN_PREFIX + key).slice(0, 180); }
  function alignCookieKey(table) { return alignCookieNameForKey(gridKey(table)); }
  function loadWidths(table) {
    var key = gridKey(table);
    if (sessionWidths[key]) return sessionWidths[key];
    if (!hasCookieConsent()) return {};
    try {
      var parsed = JSON.parse(getCookie(cookieKey(table)) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveWidths(table, widths) {
    sessionWidths[gridKey(table)] = widths;
    if (hasCookieConsent()) setCookie(cookieKey(table), JSON.stringify(widths), 365);
  }
  function loadAligns(table) {
    var key = gridKey(table);
    if (sessionAligns[key]) return sessionAligns[key];
    if (!hasCookieConsent()) return {};
    try {
      var parsed = JSON.parse(getCookie(alignCookieKey(table)) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveAligns(table, aligns) {
    sessionAligns[gridKey(table)] = aligns || {};
    if (hasCookieConsent()) setCookie(alignCookieKey(table), JSON.stringify(aligns || {}), 365);
  }
  function flushSessionGridSettingsToCookies() {
    Object.keys(sessionWidths).forEach(function (key) {
      setCookie(cookieNameForKey(key), JSON.stringify(sessionWidths[key] || {}), 365);
    });
    Object.keys(sessionAligns).forEach(function (key) {
      setCookie(alignCookieNameForKey(key), JSON.stringify(sessionAligns[key] || {}), 365);
    });
  }
  function showCookieConsent() {
    if (consentDecided() || document.getElementById("gc-cookie-consent")) return;
    var bar = document.createElement("div");
    bar.id = "gc-cookie-consent";
    bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:9700;background:#0f172a;color:#fff;border-radius:12px;box-shadow:0 18px 42px rgba(15,23,42,.28);padding:14px 16px;display:flex;align-items:center;gap:12px;font-size:13px;line-height:1.45;";
    bar.innerHTML =
      '<div style="flex:1;min-width:0;"><b>쿠키 사용 동의</b><br><span style="color:#cbd5e1;">그리드 컬럼 폭과 정렬 설정을 다음 방문에도 유지하기 위해 쿠키를 사용합니다.</span></div>' +
      '<button type="button" id="gc-cookie-no" style="border:1px solid #64748b;background:transparent;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;white-space:nowrap;">거부</button>' +
      '<button type="button" id="gc-cookie-yes" style="border:0;background:#22c55e;color:#052e16;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;white-space:nowrap;">동의</button>';
    document.body.appendChild(bar);
    bar.querySelector("#gc-cookie-yes").onclick = function () { setCookie(COOKIE_CONSENT, "yes", 365); flushSessionGridSettingsToCookies(); bar.remove(); };
    bar.querySelector("#gc-cookie-no").onclick = function () { setCookie(COOKIE_CONSENT, "no", 365); bar.remove(); };
  }

  function eligible(table) {
    if (table.__gcDone) return false;
    var thead = table.tHead;
    if (!thead || thead.rows.length !== 1) return false;     // 단일행 헤더만
    if (!table.tBodies.length) return false;
    if (table.hasAttribute("data-nocols") || table.closest("[data-nocols]")) return false;
    // 모달 안의 (재사용/전환되는) 테이블은 제외
    if (table.closest('.modal-ov, .modal, [id^="modal-"], #gc-panel')) return false;
    var ths = thead.rows[0].cells;
    if (ths.length < 2) return false;
    for (var i = 0; i < ths.length; i++) if ((ths[i].colSpan || 1) > 1) return false;  // 그룹헤더 제외
    return true;
  }

  function origCols(table) {
    if (table.__gcCols) return table.__gcCols;
    var ths = table.tHead.rows[0].cells, cols = [];
    for (var i = 0; i < ths.length; i++) cols.push({ idx: i, label: cleanLabel(ths[i]) || ("컬럼 " + (i + 1)) });
    table.__gcCols = cols;
    return cols;
  }

  function gridKey(table) {
    if (table.__gcKey) return table.__gcKey;
    if (table.dataset.gridKey) { table.__gcKey = table.dataset.gridKey; return table.__gcKey; }
    var idEl = table.closest("[id]");
    var base = (idEl ? idEl.id : "grid").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "grid";
    var sig = origCols(table).map(function (c) { return c.label; }).join("|");
    table.__gcKey = (base + "_" + hash(location.pathname + "|" + sig)).slice(0, 191);
    return table.__gcKey;
  }

  function getPrefs(table) {
    var n = origCols(table).length;
    var p = prefsCache[gridKey(table)];
    var freeze = (p && p.freeze != null) ? p.freeze : null;
    var align = (p && p.align && typeof p.align === "object") ? Object.assign({}, p.align) : {};
    Object.assign(align, loadAligns(table));
    if (!p || !Array.isArray(p.order) || p.order.length !== n) {
      return { order: range(n), hidden: (p && Array.isArray(p.hidden)) ? p.hidden.slice() : [], freeze: freeze, align: align };
    }
    return { order: p.order.slice(), hidden: (p.hidden || []).slice(), freeze: freeze, align: align };
  }

  function validAlign(v) {
    return v === "left" || v === "center" || v === "right" ? v : "";
  }
  function alignButtonsHtml(current) {
    current = validAlign(current);
    function btn(v, icon, title) {
      var on = current === v;
      return '<button type="button" class="gc-align-btn' + (on ? ' act' : '') + '" data-align="' + v + '" title="' + title + '" aria-label="' + title + '" style="width:26px;height:26px;border:1px solid ' + (on ? '#2563eb' : '#cbd5e1') + ';border-radius:6px;background:' + (on ? '#eff6ff' : '#fff') + ';color:' + (on ? '#1d4ed8' : '#475569') + ';font-size:13px;font-weight:800;line-height:1;cursor:pointer;">' + icon + '</button>';
    }
    return '<span class="gc-align" title="정렬" style="flex:none;display:inline-flex;gap:3px;align-items:center;">' +
      btn("left", "⇤", "좌측 정렬") +
      btn("center", "↔", "중앙 정렬") +
      btn("right", "⇥", "우측 정렬") +
      '</span>';
  }
  function selectedAlign(item) {
    var btn = item.querySelector(".gc-align-btn.act");
    return btn ? validAlign(btn.dataset.align) : "";
  }
  function setAlignActive(btn) {
    var wrap = btn.closest(".gc-align");
    if (!wrap) return;
    wrap.querySelectorAll(".gc-align-btn").forEach(function (b) {
      var on = b === btn && !b.classList.contains("act");
      b.classList.toggle("act", on);
      b.style.borderColor = on ? "#2563eb" : "#cbd5e1";
      b.style.background = on ? "#eff6ff" : "#fff";
      b.style.color = on ? "#1d4ed8" : "#475569";
    });
  }
  function applyAlignments(table) {
    var p = getPrefs(table);
    var align = p.align || {};
    centerHeaderLabels(table);
    origCols(table).forEach(function (col) {
      var v = validAlign(align[col.idx]);
      bodyCellsByCol(table, col.idx).forEach(function (cell) {
        cell.style.textAlign = v || "";
      });
    });
  }

  function centerHeaderLabels(table) {
    if (!table.tHead) return;
    var ths = table.tHead.querySelectorAll("th");
    for (var i = 0; i < ths.length; i++) ths[i].style.textAlign = "center";
  }

  // ── 적용 (헤더+바디 셀을 원본 index(data-col) 기준으로 재배치/숨김) ──
  function applyRow(row, order, hiddenSet, n) {
    var cells = Array.prototype.slice.call(row.children);
    if (cells.length !== n) return;   // colspan/placeholder 행은 건너뜀
    cells.forEach(function (c, i) { if (c.getAttribute("data-col") === null) c.setAttribute("data-col", String(i)); });
    order.forEach(function (ci) {
      var cell = null;
      for (var j = 0; j < cells.length; j++) if (cells[j].getAttribute("data-col") === String(ci)) { cell = cells[j]; break; }
      if (cell) { cell.style.display = hiddenSet.has(ci) ? "none" : ""; row.appendChild(cell); }
    });
  }
  function applyTable(table) {
    var n = origCols(table).length;
    var p = getPrefs(table);
    var hiddenMap = {}; p.hidden.forEach(function (h) { hiddenMap[h] = 1; });
    var hiddenSet = { has: function (k) { return !!hiddenMap[k]; } };
    if (table.tHead && table.tHead.rows[0]) applyRow(table.tHead.rows[0], p.order, hiddenSet, n);
    for (var b = 0; b < table.tBodies.length; b++) {
      var rows = table.tBodies[b].rows;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (row.cells.length === 1 && (row.cells[0].colSpan || 1) > 1) continue;
        applyRow(row, p.order, hiddenSet, n);
      }
    }
    applyFreeze(table);
    applyWidths(table);
    applyAlignments(table);
    attachResizeHandles(table);
  }

  function cellsByCol(table, ci) {
    var out = [];
    var all = table.querySelectorAll("[data-col='" + ci + "']");
    for (var i = 0; i < all.length; i++) out.push(all[i]);
    return out;
  }
  function bodyCellsByCol(table, ci) {
    var out = [];
    for (var b = 0; b < table.tBodies.length; b++) {
      var all = table.tBodies[b].querySelectorAll("[data-col='" + ci + "']");
      for (var i = 0; i < all.length; i++) out.push(all[i]);
    }
    return out;
  }
  function applyWidths(table) {
    var widths = loadWidths(table);
    Object.keys(widths).forEach(function (ci) {
      var w = Math.max(48, Number(widths[ci]) || 0);
      if (!w) return;
      cellsByCol(table, ci).forEach(function (cell) {
        cell.style.width = w + "px";
        cell.style.minWidth = w + "px";
        cell.style.maxWidth = w + "px";
      });
    });
  }
  function attachResizeHandles(table) {
    var row = table.tHead && table.tHead.rows[0];
    if (!row) return;
    Array.prototype.forEach.call(row.children, function (th) {
      if (th.querySelector(":scope > .gc-resize")) return;
      if (th.getAttribute("data-col") == null) return;
      th.style.position = th.style.position || "sticky";
      var handle = document.createElement("span");
      handle.className = "gc-resize";
      handle.title = "컬럼 폭 조정";
      handle.style.cssText = "position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:20;user-select:none;";
      handle.addEventListener("click", function (e) { e.stopPropagation(); });
      handle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showCookieConsent();
        var ci = th.getAttribute("data-col");
        var startX = e.clientX;
        var startW = th.getBoundingClientRect().width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        function move(ev) {
          var nextW = Math.max(48, Math.round(startW + ev.clientX - startX));
          var widths = loadWidths(table);
          widths[ci] = nextW;
          saveWidths(table, widths);
          applyWidths(table);
          applyFreeze(table);
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      th.appendChild(handle);
    });
  }
  function attachBasicResizeHandles(table) {
    if (!table.tHead || !table.tHead.rows.length || table.closest("#gc-panel")) return;
    var widths = loadWidths(table);
    Array.prototype.forEach.call(table.tHead.querySelectorAll("th"), function (th, idx) {
      if ((th.colSpan || 1) > 1) return;
      var colAttr = null, colVal = null;
      Array.prototype.forEach.call(th.attributes || [], function (attr) {
        if (!colAttr && /-col$/.test(attr.name)) { colAttr = attr.name; colVal = attr.value; }
      });
      var key = colAttr ? (colAttr + ":" + colVal) : ("h" + idx);
      if (widths[key]) {
        applyBasicWidth(table, key, Math.max(48, Number(widths[key])), th);
      }
      if (th.querySelector(":scope > .gc-resize")) return;
      th.style.position = th.style.position || "sticky";
      var handle = document.createElement("span");
      handle.className = "gc-resize";
      handle.title = "컬럼 폭 조정";
      handle.style.cssText = "position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:20;user-select:none;";
      handle.addEventListener("click", function (e) { e.stopPropagation(); });
      handle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showCookieConsent();
        var startX = e.clientX;
        var startW = th.getBoundingClientRect().width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        function move(ev) {
          var nextW = Math.max(48, Math.round(startW + ev.clientX - startX));
          var next = loadWidths(table);
          next[key] = nextW;
          saveWidths(table, next);
          applyBasicWidth(table, key, nextW, th);
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      th.appendChild(handle);
    });
  }
  function applyBasicWidth(table, key, width, fallbackTh) {
    var targets = [];
    if (key.indexOf(":") > 0) {
      var parts = key.split(":");
      targets = Array.prototype.slice.call(table.querySelectorAll("[" + parts[0] + "='" + parts.slice(1).join(":").replace(/'/g, "\\'") + "']"));
    }
    if (!targets.length && fallbackTh) targets = [fallbackTh];
    targets.forEach(function (cell) {
      cell.style.width = width + "px";
      cell.style.minWidth = width + "px";
      cell.style.maxWidth = width + "px";
    });
  }

  // ── 틀 고정 (freeze panes) — 지정 컬럼까지 가로 스크롤 시 좌측 고정 ──
  function cellByCol(row, ci) {
    var cells = row.children;
    for (var j = 0; j < cells.length; j++) if (cells[j].getAttribute("data-col") === String(ci)) return cells[j];
    return null;
  }
  function clearFreeze(table) {
    var stuck = table.querySelectorAll("[data-gc-stuck]");
    for (var i = 0; i < stuck.length; i++) {
      var c = stuck[i];
      c.style.position = ""; c.style.left = ""; c.style.zIndex = ""; c.style.boxShadow = "";
      c.style.background = c.getAttribute("data-gc-bg") || "";   // 원래 인라인 배경 복원
      c.removeAttribute("data-gc-bg");
      c.removeAttribute("data-gc-stuck");
    }
  }
  function stickCell(cell, left, isHeader, isLast) {
    if (!cell.hasAttribute("data-gc-stuck")) cell.setAttribute("data-gc-bg", cell.style.background || "");
    cell.style.position = "sticky";
    cell.style.left = left + "px";
    cell.style.zIndex = isHeader ? "6" : "3";
    if (!cell.style.background) cell.style.background = isHeader ? "#eef2f7" : "#fff";
    if (isLast) cell.style.boxShadow = "2px 0 0 0 #cbd5e1";
    cell.setAttribute("data-gc-stuck", "1");
  }
  function applyFreeze(table) {
    clearFreeze(table);
    var headRow = table.tHead && table.tHead.rows[0];
    if (!headRow) return;
    var p = getPrefs(table);
    if (p.freeze == null) return;
    var hiddenMap = {}; p.hidden.forEach(function (h) { hiddenMap[h] = 1; });
    // 고정 대상 = 시각순서상 freeze 경계 위치까지의 '표시중' 컬럼
    var frozenIds = hiddenMap[p.freeze] ? [] : [p.freeze];
    if (!frozenIds.length) return;
    var left = 0;
    frozenIds.forEach(function (ci, k) {
      var th = cellByCol(headRow, ci);
      if (!th) return;
      var w = th.offsetWidth;
      var isLast = (k === frozenIds.length - 1);
      stickCell(th, left, true, isLast);
      for (var b = 0; b < table.tBodies.length; b++) {
        var rows = table.tBodies[b].rows;
        for (var r = 0; r < rows.length; r++) {
          if (rows[r].cells.length === 1 && (rows[r].cells[0].colSpan || 1) > 1) continue;
          var td = cellByCol(rows[r], ci);
          if (td) stickCell(td, left, false, isLast);
        }
      }
      left += w;
    });
  }

  function groupedEligible(table) {
    if (table.__gcDone || table.__gcGroupedDone) return false;
    if ((!table.classList || !table.classList.contains("settle-grid")) && table.dataset.gridGrouped !== "1") return false;
    if (!table.tHead || table.tHead.rows.length < 2) return false;
    if (!table.tBodies.length) return false;
    if (table.hasAttribute("data-nocols") || table.closest("[data-nocols]")) return false;
    if (table.closest('.modal-ov, .modal, [id^="modal-"], #gc-panel')) return false;
    return true;
  }

  function groupedCols(table) {
    if (table.__gcGroupCols) return table.__gcGroupCols;
    var rows = table.tHead.rows;
    var top = rows[0], second = rows[1];
    var cols = [], leaf = 0, child = 0;
    Array.prototype.forEach.call(top.cells, function (th) {
      var group = cleanLabel(th);
      var span = th.colSpan || 1;
      var rowSpan = th.rowSpan || 1;
      if (rowSpan > 1 || span === 1) {
        th.setAttribute("data-col", String(leaf));
        cols.push({ idx: leaf, label: group || ("컬럼 " + (leaf + 1)), top: th, child: null, groupTop: null });
        leaf++;
        return;
      }
      for (var i = 0; i < span; i++) {
        var childTh = second.cells[child++];
        if (!childTh) continue;
        childTh.setAttribute("data-col", String(leaf));
        cols.push({
          idx: leaf,
          label: [group, cleanLabel(childTh)].filter(Boolean).join(" / ") || ("컬럼 " + (leaf + 1)),
          top: th,
          child: childTh,
          groupTop: th
        });
        leaf++;
      }
    });
    table.__gcGroupCols = cols;
    table.__gcCols = cols;
    return cols;
  }

  function applyGroupedTable(table) {
    var cols = groupedCols(table);
    var p = getPrefs(table);
    var hidden = {};
    p.hidden.forEach(function (ci) { hidden[ci] = 1; });
    cols.forEach(function (col) {
      if (col.child) col.child.style.display = hidden[col.idx] ? "none" : "";
      else if (col.top) col.top.style.display = hidden[col.idx] ? "none" : "";
    });
    var groupMap = [];
    cols.forEach(function (col) {
      if (!col.groupTop) return;
      var found = null;
      for (var i = 0; i < groupMap.length; i++) if (groupMap[i].top === col.groupTop) found = groupMap[i];
      if (!found) { found = { top: col.groupTop, total: 0, visible: 0 }; groupMap.push(found); }
      found.total++;
      if (!hidden[col.idx]) found.visible++;
    });
    groupMap.forEach(function (g) {
      g.top.style.display = g.visible ? "" : "none";
      g.top.colSpan = Math.max(1, g.visible || g.total);
    });
    for (var b = 0; b < table.tBodies.length; b++) {
      var rows = table.tBodies[b].rows;
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (row.cells.length === 1 && (row.cells[0].colSpan || 1) > 1) continue;
        Array.prototype.forEach.call(row.cells, function (cell, i) {
          if (cell.getAttribute("data-col") === null) cell.setAttribute("data-col", String(i));
          cell.style.display = hidden[i] ? "none" : "";
        });
      }
    }
    applyWidths(table);
    applyAlignments(table);
    attachGroupedResizeHandles(table);
    applyGroupedFreeze(table);
  }

  function applyGroupedFreeze(table) {
    clearFreeze(table);
    var p = getPrefs(table);
    if (p.freeze == null) return;
    var hidden = {};
    p.hidden.forEach(function (ci) { hidden[ci] = 1; });
    if (hidden[p.freeze]) return;
    var col = groupedCols(table).filter(function (c) { return c.idx === p.freeze; })[0];
    if (!col) return;
    var th = col.child || col.top;
    if (!th) return;
    var w = th.offsetWidth;
    stickCell(th, 0, true, true);
    for (var b = 0; b < table.tBodies.length; b++) {
      var rows = table.tBodies[b].rows;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].cells.length === 1 && (rows[r].cells[0].colSpan || 1) > 1) continue;
        var td = cellByCol(rows[r], p.freeze);
        if (td) stickCell(td, 0, false, true);
      }
    }
    th.style.minWidth = w + "px";
  }

  function attachGroupedResizeHandles(table) {
    groupedCols(table).forEach(function (col) {
      var th = col.child || col.top;
      if (!th || th.querySelector(":scope > .gc-resize")) return;
      th.style.position = th.style.position || "sticky";
      var handle = document.createElement("span");
      handle.className = "gc-resize";
      handle.title = "컬럼 폭 조정";
      handle.style.cssText = "position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:col-resize;z-index:20;user-select:none;";
      handle.addEventListener("click", function (e) { e.stopPropagation(); });
      handle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showCookieConsent();
        var ci = String(col.idx);
        var startX = e.clientX;
        var startW = th.getBoundingClientRect().width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        function move(ev) {
          var nextW = Math.max(48, Math.round(startW + ev.clientX - startX));
          var widths = loadWidths(table);
          widths[ci] = nextW;
          saveWidths(table, widths);
          applyWidths(table);
          applyGroupedFreeze(table);
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      th.appendChild(handle);
    });
  }

  function openGroupedPanel(table) {
    closePanel();
    var cols = groupedCols(table);
    var p = getPrefs(table);
    var hiddenSet = {}; p.hidden.forEach(function (h) { hiddenSet[h] = 1; });
    var alignMap = Object.assign({}, p.align || {});
    var freeze = (p.freeze != null) ? p.freeze : null;
    var panel = document.createElement("div");
    panel.id = "gc-panel";
    panel.style.cssText = "position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:16px;font-size:13px;color:#1e293b;";
    panel.innerHTML =
      '<div class="gc-modal" style="background:#fff;border-radius:14px;width:380px;max-width:calc(100vw - 32px);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);">' +
        '<div style="flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;">' +
          '<div style="font-weight:800;font-size:15px;color:#0f172a;">컬럼조정</div>' +
          '<button type="button" id="gc-x" aria-label="닫기" style="flex:none;width:30px;height:30px;border:none;border-radius:50%;background:#f1f5f9;color:#475569;font-size:18px;line-height:1;cursor:pointer;">&times;</button>' +
        '</div>' +
        '<div style="flex:1;min-height:0;overflow-y:auto;padding:14px 18px;">' +
          '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">정산 표는 그룹 헤더를 유지하기 위해 표시/숨김, 틀고정, 컬럼 폭 조정을 지원합니다.</div>' +
          '<div id="gc-list"></div>' +
        '</div>' +
        '<div style="flex:none;display:flex;gap:8px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
          '<button type="button" id="gc-reset" style="flex:1;font-size:13px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px;cursor:pointer;color:#475569;">초기화</button>' +
          '<button type="button" id="gc-close" style="flex:1;font-size:13px;background:#0f172a;color:#fff;border:none;border-radius:8px;padding:9px;cursor:pointer;font-weight:700;">닫기</button>' +
        '</div>' +
      '</div>';
    var listEl = panel.querySelector("#gc-list");
    cols.forEach(function (col) {
      var item = document.createElement("div");
      item.className = "gc-item";
      item.dataset.col = String(col.idx);
      item.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 6px;border:1px solid #f1f5f9;border-radius:7px;margin-bottom:4px;background:#fff;";
      item.innerHTML =
        '<input type="checkbox" class="gc-chk" ' + (hiddenSet[col.idx] ? "" : "checked") + ' style="width:15px;height:15px;cursor:pointer;">' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + col.label + '</span>' +
        alignButtonsHtml(alignMap[col.idx]) +
        '<select class="gc-align" title="정렬" style="flex:none;border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:3px 5px;font-size:12px;color:#475569;">' +
          '<option value="" ' + (!validAlign(alignMap[col.idx]) ? "selected" : "") + '>기본</option>' +
          '<option value="left" ' + (alignMap[col.idx] === "left" ? "selected" : "") + '>좌</option>' +
          '<option value="center" ' + (alignMap[col.idx] === "center" ? "selected" : "") + '>중앙</option>' +
          '<option value="right" ' + (alignMap[col.idx] === "right" ? "selected" : "") + '>우</option>' +
        '</select>' +
        '<button type="button" class="gc-pin" title="이 컬럼을 좌측에 틀고정" style="flex:none;border:none;background:none;cursor:pointer;font-size:14px;line-height:1;padding:2px;opacity:.35;">📌</button>';
      listEl.appendChild(item);
    });
    function paintFreeze() {
      listEl.querySelectorAll(".gc-item").forEach(function (it) {
        var frozen = parseInt(it.dataset.col, 10) === freeze;
        it.style.background = frozen ? "#eff6ff" : "#fff";
        it.style.borderColor = frozen ? "#bfdbfe" : "#f1f5f9";
        it.querySelector(".gc-pin").style.opacity = frozen ? "1" : ".35";
      });
    }
    function commit() {
      var hidden = [], align = {};
      listEl.querySelectorAll(".gc-item").forEach(function (it) {
        var ci = parseInt(it.dataset.col, 10);
        if (!it.querySelector(".gc-chk").checked) hidden.push(ci);
        var av = selectedAlign(it);
        if (av) align[ci] = av;
      });
      if (freeze != null && hidden.indexOf(freeze) >= 0) freeze = null;
      var prefs = { order: range(cols.length), hidden: hidden, freeze: freeze, align: align };
      prefsCache[gridKey(table)] = prefs;
      applyGroupedTable(table);
      savePrefs(table, prefs);
    }
    listEl.querySelectorAll("select.gc-align").forEach(function (s) { s.remove(); });
    paintFreeze();
    document.body.appendChild(panel);
    panel.addEventListener("click", function (e) { if (e.target === panel) closePanel(); });
    listEl.addEventListener("change", function (e) {
      if (e.target.classList.contains("gc-chk")) commit();
    });
    listEl.addEventListener("click", function (e) {
      var alignBtn = e.target.closest(".gc-align-btn");
      if (alignBtn) { setAlignActive(alignBtn); commit(); return; }
      var pin = e.target.closest(".gc-pin");
      if (!pin) return;
      var ci = parseInt(pin.closest(".gc-item").dataset.col, 10);
      freeze = (freeze === ci) ? null : ci;
      paintFreeze();
      commit();
    });
    panel.querySelector("#gc-x").onclick = closePanel;
    panel.querySelector("#gc-close").onclick = closePanel;
    panel.querySelector("#gc-reset").onclick = function () {
      freeze = null;
      var prefs = { order: range(cols.length), hidden: [], freeze: null, align: {} };
      prefsCache[gridKey(table)] = prefs;
      applyGroupedTable(table);
      savePrefs(table, prefs);
      closePanel();
    };
  }

  function savePrefs(table, prefs) {
    var k = gridKey(table);
    prefsCache[k] = prefs;
    saveAligns(table, prefs && prefs.align ? prefs.align : {});
    fetch("/api/grid-prefs", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grid_key: k, prefs: prefs }),
    }).catch(function () {});
  }

  // ── 컬럼조정 패널 ──
  function openPanel(table, btn) {
    closePanel();
    var cols = origCols(table);
    var p = getPrefs(table);
    var hiddenSet = {}; p.hidden.forEach(function (h) { hiddenSet[h] = 1; });
    var alignMap = Object.assign({}, p.align || {});
    var freeze = (p.freeze != null) ? p.freeze : null;

    // 중앙 모달(헤더/푸터 고정 + 본문 세로 스크롤)
    var panel = document.createElement("div");
    panel.id = "gc-panel";
    panel.style.cssText =
      "position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.5);" +
      "display:flex;align-items:center;justify-content:center;padding:16px;font-size:13px;color:#1e293b;";
    panel.innerHTML =
      '<div class="gc-modal" style="background:#fff;border-radius:14px;width:360px;max-width:calc(100vw - 32px);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);">' +
        // 헤더 (고정)
        '<div style="flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;">' +
          '<div style="font-weight:800;font-size:15px;color:#0f172a;">⚙ 컬럼 조정</div>' +
          '<button type="button" id="gc-x" aria-label="닫기" style="flex:none;width:30px;height:30px;border:none;border-radius:50%;background:#f1f5f9;color:#475569;font-size:18px;line-height:1;cursor:pointer;">&times;</button>' +
        '</div>' +
        // 본문 (세로 스크롤)
        '<div style="flex:1;min-height:0;overflow-y:auto;padding:14px 18px;">' +
          '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px;">표시할 컬럼을 선택하고, 드래그(⠿)로 순서를 바꾸세요. 📌 를 누르면 <b>그 컬럼 하나만 좌측 틀 고정</b>됩니다.</div>' +
          '<div id="gc-list"></div>' +
        '</div>' +
        // 푸터 (고정)
        '<div style="flex:none;display:flex;gap:8px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
          '<button type="button" id="gc-reset" style="flex:1;font-size:13px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:9px;cursor:pointer;color:#475569;">초기화</button>' +
          '<button type="button" id="gc-close" style="flex:1;font-size:13px;background:#0f172a;color:#fff;border:none;border-radius:8px;padding:9px;cursor:pointer;font-weight:700;">닫기</button>' +
        '</div>' +
      '</div>';

    var listEl = panel.querySelector("#gc-list");
    // 현재 순서대로 행 구성
    p.order.forEach(function (ci) {
      var col = cols[ci];
      if (!col) return;
      var item = document.createElement("div");
      item.className = "gc-item";
      item.setAttribute("draggable", "true");
      item.dataset.col = String(ci);
      item.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 6px;border:1px solid #f1f5f9;border-radius:7px;margin-bottom:4px;background:#fff;cursor:grab;";
      item.innerHTML =
        '<span style="color:#cbd5e1;font-size:14px;">⠿</span>' +
        '<input type="checkbox" class="gc-chk" ' + (hiddenSet[ci] ? "" : "checked") + ' style="width:15px;height:15px;cursor:pointer;">' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (col.label || ("컬럼 " + (ci + 1))) + "</span>" +
        alignButtonsHtml(alignMap[ci]) +
        '<select class="gc-align" title="정렬" style="flex:none;border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:3px 5px;font-size:12px;color:#475569;">' +
          '<option value="" ' + (!validAlign(alignMap[ci]) ? "selected" : "") + '>기본</option>' +
          '<option value="left" ' + (alignMap[ci] === "left" ? "selected" : "") + '>좌</option>' +
          '<option value="center" ' + (alignMap[ci] === "center" ? "selected" : "") + '>중앙</option>' +
          '<option value="right" ' + (alignMap[ci] === "right" ? "selected" : "") + '>우</option>' +
        '</select>' +
        '<button type="button" class="gc-pin" title="이 컬럼을 좌측에 틀고정" style="flex:none;border:none;background:none;cursor:pointer;font-size:14px;line-height:1;padding:2px;opacity:.35;">📌</button>';
      listEl.appendChild(item);
    });

    // 틀 고정 경계 시각 표시 (경계 컬럼 및 그 앞쪽 표시 컬럼 강조)
    function paintFreeze() {
      var items = listEl.querySelectorAll(".gc-item");
      items.forEach(function (it) {
        var frozen = parseInt(it.dataset.col, 10) === freeze;
        it.style.background = frozen ? "#eff6ff" : "#fff";
        it.style.borderColor = frozen ? "#bfdbfe" : "#f1f5f9";
        var pin = it.querySelector(".gc-pin");
        pin.style.opacity = frozen ? "1" : ".35";
      });
    }
    listEl.querySelectorAll("select.gc-align").forEach(function (s) { s.remove(); });
    paintFreeze();

    document.body.appendChild(panel);
    // 배경(오버레이) 클릭 시 닫기
    panel.addEventListener("click", function (e) { if (e.target === panel) closePanel(); });

    function commit() {
      var items = listEl.querySelectorAll(".gc-item");
      var order = [], hidden = [], align = {};
      items.forEach(function (it) {
        var ci = parseInt(it.dataset.col, 10);
        order.push(ci);
        if (!it.querySelector(".gc-chk").checked) hidden.push(ci);
        var av = selectedAlign(it);
        if (av) align[ci] = av;
      });
      // freeze 컬럼이 숨김이면 고정 해제
      if (freeze != null && hidden.indexOf(freeze) >= 0) freeze = null;
      var prefs = { order: order, hidden: hidden, freeze: freeze, align: align };
      prefsCache[gridKey(table)] = prefs;
      applyTable(table);
      savePrefs(table, prefs);
    }

    // 체크박스 → 표시/숨김
    listEl.addEventListener("change", function (e) {
      if (e.target.classList.contains("gc-chk")) commit();
    });

    // 📌 → 틀 고정 경계 지정 (토글)
    listEl.addEventListener("click", function (e) {
      var alignBtn = e.target.closest(".gc-align-btn");
      if (alignBtn) { setAlignActive(alignBtn); commit(); return; }
      var pin = e.target.closest(".gc-pin");
      if (!pin) return;
      var it = pin.closest(".gc-item");
      var ci = parseInt(it.dataset.col, 10);
      freeze = (freeze === ci) ? null : ci;
      paintFreeze();
      commit();
    });

    // 드래그앤드랍 순서변경
    var dragEl = null;
    listEl.addEventListener("dragstart", function (e) {
      var it = e.target.closest(".gc-item"); if (!it) return;
      dragEl = it; it.style.opacity = ".4";
    });
    listEl.addEventListener("dragend", function () {
      if (dragEl) dragEl.style.opacity = "";
      dragEl = null; commit();
    });
    listEl.addEventListener("dragover", function (e) {
      e.preventDefault();
      var over = e.target.closest(".gc-item");
      if (!over || over === dragEl || !dragEl) return;
      var rc = over.getBoundingClientRect();
      var after = (e.clientY - rc.top) > rc.height / 2;
      listEl.insertBefore(dragEl, after ? over.nextSibling : over);
    });

    panel.querySelector("#gc-x").onclick = closePanel;
    panel.querySelector("#gc-close").onclick = closePanel;
    panel.querySelector("#gc-reset").onclick = function () {
      var n = cols.length;
      freeze = null;
      var prefs = { order: range(n), hidden: [], freeze: null, align: {} };
      prefsCache[gridKey(table)] = prefs;
      applyTable(table);
      savePrefs(table, prefs);
      closePanel();
    };
  }
  function closePanel() {
    var ex = document.getElementById("gc-panel");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }
  // ESC 로 닫기
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });

  // ── 버튼 삽입 ──
  function isToolbarCandidate(el) {
    if (!el || !el.matches) return false;
    if (el.matches(".filter-bar,.guest-querybar,.guest-table-tools,.loc-summary")) return true;
    if (!el.querySelector || !el.querySelector("input,select")) return false;
    var cs = getComputedStyle(el);
    return cs.display.indexOf("flex") >= 0;
  }
  function findToolbar(anchor) {
    var node = anchor;
    var depth = 0;
    while (node && node !== document.body && depth < 6) {
      var cur = node.previousElementSibling;
      var hops = 0;
      while (cur && hops < 10) {
        if (isToolbarCandidate(cur)) return cur;
        cur = cur.previousElementSibling;
        hops++;
      }
      var parent = node.parentElement;
      if (parent) {
        var direct = parent.querySelector(":scope > .filter-bar, :scope > .guest-querybar, :scope > .guest-table-tools, :scope > .loc-summary");
        if (direct) return direct;
      }
      node = parent;
      depth++;
    }
    return null;
  }
  function injectButton(table) {
    var anchor = (table.parentElement && table.parentElement.classList.contains("tbl-wrap"))
      ? table.parentElement : table;
    if (!anchor.parentNode) return;
    function bindButton(targetBtn) {
      targetBtn.onclick = function (e) {
        e.stopPropagation();
        if (typeof table.__gcOpenPanel === "function") table.__gcOpenPanel(table, targetBtn);
        else openPanel(table, targetBtn);
      };
    }
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "gc-btn"; btn.textContent = "⚙ 컬럼조정";
    btn.style.cssText = "font-size:12px;color:#475569;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:5px 11px;cursor:pointer;line-height:1.2;";
    btn.onmouseover = function () { btn.style.background = "#f1f5f9"; };
    btn.onmouseout = function () { btn.style.background = "#fff"; };
    bindButton(btn);
    btn.textContent = "⚙ 컬럼조정";
    btn.style.padding = "7px 11px";
    btn.style.whiteSpace = "nowrap";
    var toolbar = findToolbar(anchor);
    if (toolbar) {
      if (!toolbar.style.display) toolbar.style.display = "flex";
      if (!toolbar.style.alignItems) toolbar.style.alignItems = "center";
      if (!toolbar.style.gap) toolbar.style.gap = "8px";
      if (table.classList && table.classList.contains("settle-grid")) {
        var existingSettleBtn = toolbar.querySelector(":scope > .gc-settle-btn");
        if (existingSettleBtn) return;
        btn.classList.add("gc-settle-btn");
        btn.onclick = function (e) {
          e.stopPropagation();
          var root = document.getElementById("tab-settle") || document;
          var panes = root.querySelectorAll(".stl-sub-pane");
          var activeTable = table;
          Array.prototype.forEach.call(panes, function (pane) {
            if (pane.style.display === "none") return;
            var t = pane.querySelector("table.settle-grid");
            if (t) activeTable = t;
          });
          if (typeof activeTable.__gcOpenPanel === "function") activeTable.__gcOpenPanel(activeTable, btn);
          else openPanel(activeTable, btn);
        };
        var excelBtn = toolbar.querySelector("#settle-excel");
        if (excelBtn) excelBtn.style.marginLeft = "auto";
        btn.style.marginLeft = excelBtn ? "0" : "auto";
        btn.style.order = "999";
        toolbar.appendChild(btn);
        return;
      }
      var inlineHost = toolbar.querySelector(":scope > .gc-inline-actions");
      var existingBtns = inlineHost
        ? Array.prototype.slice.call(inlineHost.querySelectorAll(":scope > .gc-btn"))
        : Array.prototype.slice.call(toolbar.querySelectorAll(":scope > .gc-btn"));
      var existingBtn = existingBtns[0] || null;
      existingBtns.slice(1).forEach(function (extra) { extra.remove(); });
      if (existingBtn) {
        bindButton(existingBtn);
        existingBtn.style.marginLeft = inlineHost ? "" : "auto";
        existingBtn.style.order = "999";
        return;
      }
      if (inlineHost) {
        btn.style.marginLeft = "";
        btn.style.order = "999";
        inlineHost.appendChild(btn);
      } else {
        btn.style.marginLeft = "auto";
        btn.style.order = "999";
        toolbar.appendChild(btn);
      }
      return;
    }
    var bar = document.createElement("div");
    bar.className = "gc-bar";
    bar.style.cssText = "display:flex;justify-content:flex-end;margin:0 0 6px;";
    bar.appendChild(btn);
    anchor.parentNode.insertBefore(bar, anchor);
  }

  // ── 표 처리 ──
  var processed = [];
  function processTable(table) {
    if (groupedEligible(table)) {
      table.__gcGroupedDone = true;
      table.__gcOpenPanel = openGroupedPanel;
      processed.push(table);
      groupedCols(table);
      injectButton(table);
      applyGroupedTable(table);
      var groupedReapply = debounce(function () { applyGroupedTable(table); }, 30);
      var groupedMo = new MutationObserver(groupedReapply);
      if (table.tHead) groupedMo.observe(table.tHead, { childList: true, subtree: true });
      for (var gb = 0; gb < table.tBodies.length; gb++) groupedMo.observe(table.tBodies[gb], { childList: true, subtree: true });
      return;
    }
    if (!eligible(table)) {
      attachBasicResizeHandles(table);
      return;
    }
    table.__gcDone = true;
    processed.push(table);
    origCols(table);
    injectButton(table);
    applyTable(table);
    // 재렌더 시 재적용 — 헤더/바디 행 교체 감지 (셀 이동은 tr 내부라 미감지 → 루프 없음)
    var reapply = debounce(function () { applyTable(table); }, 30);
    var mo = new MutationObserver(reapply);
    if (table.tHead) mo.observe(table.tHead, { childList: true });
    for (var b = 0; b < table.tBodies.length; b++) mo.observe(table.tBodies[b], { childList: true });
  }
  // 창 크기 변경 → 고정 컬럼 폭 재계산
  var onResize = debounce(function () {
    for (var i = 0; i < processed.length; i++) {
      if (!document.body.contains(processed[i])) continue;
      if (processed[i].__gcGroupedDone) applyGroupedFreeze(processed[i]);
      else applyFreeze(processed[i]);
    }
  }, 150);
  window.addEventListener("resize", onResize);

  function debounce(fn, ms) {
    var t = null;
    return function () { if (t) clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function scanAll() {
    if (!prefsLoaded) return;
    var tables = document.getElementsByTagName("table");
    for (var i = 0; i < tables.length; i++) processTable(tables[i]);
  }

  window.TourTrackerGridColumns = {
    scan: scanAll,
    openFor: function (table, btn) {
      if (!table) return false;
      processTable(table);
      if (typeof table.__gcOpenPanel === "function") table.__gcOpenPanel(table, btn || table);
      else openPanel(table, btn || table);
      return true;
    }
  };

  // ── 초기화 ──
  function init() {
    fetch("/api/grid-prefs")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok && d.prefs) prefsCache = d.prefs; })
      .catch(function () {})
      .then(function () {
        prefsLoaded = true;
        scanAll();
        // 이후 동적으로 추가되는 표도 처리
        var rescan = debounce(scanAll, 250);
        new MutationObserver(rescan).observe(document.body, { childList: true, subtree: true });
      });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
