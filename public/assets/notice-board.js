/* notice-board.js — 랜딩 공지사항 목록 + 상세 모달
 *  NoticeBoard.render(serial, containerEl)  — 공지 목록을 container 에 렌더
 *  NoticeBoard.open(id)                     — 상세 모달 표시
 *  NoticeBoard.preview(data)                — 관리자 미리보기(단건 상세 모달)
 */
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var NoticeBoard = {
    _list: [],

    render: function (serial, container, opts) {
      var self = this;
      opts = opts || {};
      if (!serial || !container) return;
      function hideSection() { if (opts.section) opts.section.style.display = "none"; }
      function showSection() { if (opts.section) opts.section.style.display = ""; }
      container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:24px;font-size:14px;">불러오는 중…</div>';
      fetch("/api/notice/public/projects/" + encodeURIComponent(serial) + "/notices")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) { container.innerHTML = ""; hideSection(); return; }
          self._list = d.notices || [];
          if (!self._list.length) {
            container.innerHTML = "";
            // 섹션 숨김 옵션이 있으면 섹션째 숨기고, 없으면 안내 문구
            if (opts.section) { hideSection(); return; }
            container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:24px;border:1px dashed #e2e8f0;border-radius:12px;font-size:14px;">등록된 공지사항이 없습니다.</div>';
            return;
          }
          showSection();
          container.innerHTML =
            '<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;">' +
            self._list.map(function (n) {
              var pin = n.pinned
                ? '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;margin-right:8px;">중요</span>'
                : "";
              return (
                '<button type="button" onclick="NoticeBoard.open(' + n.id + ')" ' +
                'style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid #f1f5f9;padding:14px 18px;cursor:pointer;font:inherit;">' +
                '<span style="font-size:14px;color:#1e293b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + pin + esc(n.title) + "</span>" +
                '<span style="flex:none;font-size:12px;color:#94a3b8;">' + esc(n.created_date || "") + "</span>" +
                "</button>"
              );
            }).join("") +
            "</div>";
        })
        .catch(function () { container.innerHTML = ""; hideSection(); });
    },

    open: function (id) {
      var n = this._list.filter(function (x) { return Number(x.id) === Number(id); })[0];
      if (n) this.preview(n);
    },

    preview: function (data) {
      if (!data) return;
      var ex = document.getElementById("notice-detail-ov");
      if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
      var ov = document.createElement("div");
      ov.id = "notice-detail-ov";
      ov.style.cssText =
        "position:fixed;inset:0;z-index:9100;background:rgba(15,23,42,.6);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;";
      var pin = data.pinned
        ? '<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;margin-bottom:8px;">중요 공지</span><br>'
        : "";
      var date = data.created_date
        ? '<div style="font-size:12px;color:#94a3b8;margin-top:4px;">' + esc(data.created_date) + "</div>"
        : "";
      ov.innerHTML =
        '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);">' +
          '<div style="flex:none;padding:18px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
            "<div>" + pin + '<div style="font-size:18px;font-weight:800;color:#0f172a;">' + esc(data.title || "") + "</div>" + date + "</div>" +
            '<button id="notice-detail-x" aria-label="닫기" style="flex:none;width:30px;height:30px;border:none;border-radius:50%;background:#f1f5f9;color:#475569;font-size:18px;line-height:1;cursor:pointer;">&times;</button>' +
          "</div>" +
          '<div style="flex:1;min-height:0;overflow-y:auto;padding:20px;font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap;">' + esc(data.content || "") + "</div>" +
        "</div>";
      document.body.appendChild(ov);
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.querySelector("#notice-detail-x").onclick = close;
      ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    },
  };

  window.NoticeBoard = NoticeBoard;
})();
