/* ──────────────────────────────────────────────────────────────
 * grid-sort.js — 범용 표(grid) 정렬
 *  · 모든 <table> 의 헤더(th) 클릭 시 해당 컬럼 기준으로 tbody 행을 정렬
 *  · 이벤트 위임 방식 → 동적으로 다시 그려지는 표도 자동 적용
 *  · 기존 커스텀 정렬(th[onclick]) 은 건드리지 않음 (그쪽 핸들러 우선)
 *  · 제외 대상: th[onclick], 그룹헤더(colspan>1), 다중행 헤더,
 *               data-nosort 가 붙은 table/thead/th
 *  · 숫자·날짜·문자 자동 판별 (콤마/원/%/명/개 등 단위 제거 후 비교)
 * ────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── 셀 값 → 비교용 { n: 숫자, s: 문자 } ──
  function parseVal(text) {
    var t = (text || "").trim();
    if (t === "" || t === "-" || t === "—") return { n: NaN, s: "" };
    // 날짜 (yyyy-mm-dd / yyyy.mm.dd / yyyy/mm/dd [ hh:mm])
    if (/^\d{4}[-.\/]\d{1,2}([-.\/]\d{1,2})?/.test(t)) {
      var d = Date.parse(t.replace(/\./g, "-").replace(/\//g, "-").replace(" ", "T"));
      if (!isNaN(d)) return { n: d, s: t };
    }
    // 숫자 (통화/콤마/퍼센트/단위 제거)
    var num = t.replace(/[,\s₩원%개명곳표점위명건]/g, "").replace(/[()]/g, "");
    if (num !== "" && !isNaN(Number(num)) && /\d/.test(num)) return { n: Number(num), s: t };
    return { n: NaN, s: t };
  }

  // th 의 논리 컬럼 index = 같은 행 앞 형제들의 colSpan 합
  function colIndexOf(th) {
    var idx = 0, el = th.previousElementSibling;
    while (el) { idx += (el.colSpan || 1); el = el.previousElementSibling; }
    return idx;
  }

  // body 행에서 논리 컬럼 index 에 해당하는 셀 찾기 (colspan 고려)
  function cellAt(row, colIndex) {
    var i = 0, cells = row.children;
    for (var c = 0; c < cells.length; c++) {
      var span = cells[c].colSpan || 1;
      if (colIndex < i + span) return cells[c];
      i += span;
    }
    return null;
  }

  function isPlaceholderRow(r) {
    // "불러오는 중…" / "결과 없음" 같은 colspan 단일 셀 행
    return r.cells.length === 1 && (r.cells[0].colSpan || 1) > 1;
  }

  function sortTable(table, colIndex, asc) {
    var tbody = table.tBodies[0];
    if (!tbody) return;
    var rows = [];
    for (var i = 0; i < tbody.rows.length; i++) {
      if (!isPlaceholderRow(tbody.rows[i])) rows.push(tbody.rows[i]);
    }
    if (rows.length < 2) return;

    var dec = rows.map(function (r, i) {
      var cell = cellAt(r, colIndex);
      return { r: r, i: i, v: parseVal(cell ? cell.textContent : "") };
    });
    var allNum = dec.every(function (d) { return !isNaN(d.v.n) || d.v.s === ""; });

    dec.sort(function (a, b) {
      var c;
      if (allNum) {
        var an = isNaN(a.v.n) ? -Infinity : a.v.n;
        var bn = isNaN(b.v.n) ? -Infinity : b.v.n;
        c = an < bn ? -1 : an > bn ? 1 : 0;
      } else {
        c = a.v.s.localeCompare(b.v.s, "ko");
      }
      if (c === 0) c = a.i - b.i;       // 안정 정렬
      return asc ? c : -c;
    });

    // 상단고정(data-pin="1") 행은 정렬과 무관하게 앞단 유지 (그룹 내 정렬순서 보존)
    var pinned = [], rest = [];
    dec.forEach(function (d) {
      if (d.r.getAttribute("data-pin") === "1") pinned.push(d); else rest.push(d);
    });
    var ordered = pinned.concat(rest);

    var frag = document.createDocumentFragment();
    ordered.forEach(function (d) { frag.appendChild(d.r); });
    tbody.appendChild(frag);
  }

  document.addEventListener("click", function (e) {
    var th = e.target.closest && e.target.closest("th");
    if (!th) return;
    // 헤더 안의 입력요소/버튼/링크 클릭은 정렬 트리거 제외
    if (e.target.closest("input,select,button,a,label,textarea")) return;

    var thead = th.closest("thead");
    if (!thead) return;                              // thead 안의 th 만 대상
    if (th.hasAttribute("onclick")) return;          // 기존 커스텀 정렬 우선
    if ((th.colSpan || 1) > 1) return;               // 그룹 헤더 제외
    if (thead.rows.length > 1) return;               // 다중행(그룹) 헤더 제외 — 오정렬 방지
    if (th.closest("[data-nosort]")) return;

    var table = th.closest("table");
    if (!table || table.hasAttribute("data-nosort")) return;
    var tbody = table.tBodies[0];
    if (!tbody || tbody.rows.length < 2) return;

    var colIndex = colIndexOf(th);
    var asc = (table.__sortCol === colIndex) ? !table.__sortAsc : true;
    table.__sortCol = colIndex;
    table.__sortAsc = asc;

    sortTable(table, colIndex, asc);

    // 정렬 방향 표시 갱신
    var ths = thead.querySelectorAll("th");
    for (var i = 0; i < ths.length; i++) ths[i].removeAttribute("data-sortdir");
    th.setAttribute("data-sortdir", asc ? "asc" : "desc");
  }, false);

  // ── 스타일 주입 (포인터 커서 + 정렬 화살표) ──
  var css =
    "thead th:not([data-nosort]){cursor:pointer;}" +
    "thead th[data-sortdir]::after{font-size:10px;color:#2563eb;margin-left:3px;}" +
    'thead th[data-sortdir="asc"]::after{content:"\\25B2";}' +
    'thead th[data-sortdir="desc"]::after{content:"\\25BC";}';
  var style = document.createElement("style");
  style.setAttribute("data-grid-sort", "");
  style.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(style);
})();
