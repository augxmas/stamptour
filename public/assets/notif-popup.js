/* notif-popup.js — 랜딩 팝업 알림 렌더
 *  NotifPopup.show(data, {serial, preview})   — 단건(가운데 모달) : 관리자 미리보기용
 *  NotifPopup.showAll(list, {serial, preview}) — 다건(좌상단부터 좌→우 타일 배열)
 *  NotifPopup.auto(serial)                     — 활성 알림 fetch 후 (오늘 숨김 제외) 타일 표시
 *  data: { id, title, content, image_url }
 *  우하단 "오늘 하루 안 보기" 체크 후 닫으면 당일 재노출 안 함(localStorage)
 */
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function today() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }

  // 알림 카드 1개 생성 (닫기/오늘안보기 핸들러 포함)
  function buildCard(data, ctx) {
    ctx = ctx || {};
    var hasImg = !!data.image_url;
    var width = ctx.width || 320;
    var card = document.createElement("div");
    card.className = "notif-pop-card";
    // 이미지가 있으면 카드를 이미지 크기에 맞춤(뷰포트 내), 없으면 고정폭
    card.style.cssText =
      "position:relative;background:#fff;border-radius:14px;overflow:hidden;" +
      "display:flex;flex-direction:column;box-shadow:0 16px 40px rgba(0,0,0,.3);pointer-events:auto;" +
      "max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);" +
      (hasImg ? "width:fit-content;width:-moz-fit-content;" : ("width:" + width + "px;"));

    var img = hasImg
      ? '<img src="' + esc(data.image_url) + '" alt="" style="display:block;width:auto;height:auto;max-width:calc(100vw - 24px);">'
      : "";
    // 이미지형 알림은 이미지만 노출 — 제목/내용은 관리용이라 팝업에 표시하지 않음.
    // 이미지가 없는 경우(예: '알림으로 보이기' 공지)에만 제목/내용을 표시.
    var title = (!hasImg && data.title)
      ? '<div style="font-size:16px;font-weight:800;color:#0f172a;padding-right:28px;">' + esc(data.title) + "</div>"
      : "";
    var content = (!hasImg && data.content)
      ? '<div style="font-size:13.5px;color:#475569;line-height:1.6;white-space:pre-wrap;' + (title ? "margin-top:8px;" : "") + '">' + esc(data.content) + "</div>"
      : "";
    var textBlock = (title || content)
      ? '<div style="padding:18px;">' + title + content + "</div>"
      : "";
    var closeBtn =
      '<button class="np-x" aria-label="닫기" style="position:absolute;top:8px;right:8px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(15,23,42,.6);color:#fff;font-size:17px;line-height:1;cursor:pointer;z-index:3;">&times;</button>';

    card.innerHTML =
      closeBtn +
      '<div style="flex:1;min-height:0;overflow-y:auto;">' + img + textBlock + "</div>" +
      '<div style="flex:none;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:9px 14px;border-top:1px solid #f1f5f9;background:#f8fafc;">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;cursor:pointer;user-select:none;">' +
          '<input type="checkbox" class="np-today" style="width:15px;height:15px;cursor:pointer;"> 오늘 하루 안 보기</label>' +
        '<button class="np-close" style="background:#0f172a;color:#fff;border:none;border-radius:8px;padding:7px 15px;font-size:13px;font-weight:700;cursor:pointer;">닫기</button>' +
      "</div>";

    function close() {
      var chk = card.querySelector(".np-today");
      var k = (data.key != null) ? data.key : data.id;   // 알림/공지 키 분리
      if (!ctx.preview && chk && chk.checked && ctx.serial && k != null) {
        try { localStorage.setItem("notif_hide_" + ctx.serial + "_" + k, today()); } catch (e) {}
      }
      if (card.parentNode) card.parentNode.removeChild(card);
      if (typeof ctx.onClose === "function") ctx.onClose(card);
    }
    card.querySelector(".np-x").onclick = close;
    card.querySelector(".np-close").onclick = close;
    return card;
  }

  var NotifPopup = {
    today: today,

    // 단건 — 가운데 모달(어두운 배경). 관리자 미리보기용
    show: function (data, opts) {
      if (!data) return;
      opts = opts || {};
      var ex = document.getElementById("notif-pop-ov");
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      var ov = document.createElement("div");
      ov.id = "notif-pop-ov";
      ov.style.cssText =
        "position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.6);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;";
      var card = buildCard(data, {
        serial: opts.serial, preview: opts.preview, width: 440,
        onClose: function () { if (ov.parentNode) ov.parentNode.removeChild(ov); },
      });
      ov.appendChild(card);
      ov.addEventListener("click", function (e) {
        if (e.target === ov) { var b = card.querySelector(".np-close"); if (b) b.click(); }
      });
      document.body.appendChild(ov);
    },

    // 다건 — 좌상단부터 좌→우로 타일 배열 (배경 없음, 페이지 사용 가능)
    showAll: function (list, opts) {
      if (!list || !list.length) return;
      opts = opts || {};
      var ex = document.getElementById("notif-pop-wrap");
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      var wrap = document.createElement("div");
      wrap.id = "notif-pop-wrap";
      // 화면 좌상단 기준, flex 로 좌→우 배치 + 넘치면 다음 줄로 래핑
      wrap.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;" +
        "display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:flex-start;" +
        "gap:16px;padding:16px;pointer-events:none;overflow:auto;";
      list.forEach(function (data) {
        wrap.appendChild(buildCard(data, { serial: opts.serial, preview: opts.preview, width: 320 }));
      });
      document.body.appendChild(wrap);
    },

    auto: function (serial) {
      var self = this;
      if (!serial) return;
      var enc = encodeURIComponent(serial);
      function getJson(url) {
        return fetch(url).then(function (r) { return r.json(); }).catch(function () { return null; });
      }
      Promise.all([
        getJson("/api/notification/public/projects/" + enc + "/notification/active"),
        getJson("/api/notice/public/projects/" + enc + "/popup-notices"),
      ]).then(function (res) {
        var nd = res[0], cd = res[1];
        var items = [];
        // 알림(이미지 팝업)
        if (nd && nd.ok) {
          var nlist = nd.notifications || (nd.notification ? [nd.notification] : []);
          nlist.forEach(function (n) {
            items.push({ key: "notif_" + n.id, title: n.title, content: n.content, image_url: n.image_url });
          });
        }
        // '알림으로 보이기' 공지
        if (cd && cd.ok) {
          (cd.notices || []).forEach(function (n) {
            items.push({ key: "notice_" + n.id, title: n.title, content: n.content, image_url: null });
          });
        }
        var t = today();
        var visible = items.filter(function (n) {
          try { return localStorage.getItem("notif_hide_" + serial + "_" + n.key) !== t; }
          catch (e) { return true; }
        });
        if (visible.length) self.showAll(visible, { serial: serial });
      });
    },
  };

  window.NotifPopup = NotifPopup;
})();
