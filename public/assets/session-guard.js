/* session-guard.js — 세션 만료(401/440) 전역 처리
 *  세션 종료 후 버튼 클릭 등으로 API 가 401(not_logged_in / *_login_required) /
 *  440(session_expired) 을 반환하면 → "다시 로그인" 안내 후 로그인 화면으로 전환.
 *  admin / merchant / supervisor 공용.
 */
(function () {
  "use strict";
  if (window.__sessionGuard) return;
  window.__sessionGuard = true;

  var _fetch = window.fetch.bind(window);
  var handling = false;
  var MSG = "세션이 종료되었습니다.\n다시 로그인해 주세요.";

  function dashVisible() {
    var d = document.getElementById("sec-dashboard") || document.getElementById("dashboard");
    // offsetParent === null 이면 display:none(또는 조상 숨김) → 비표시
    return !!(d && d.offsetParent !== null);
  }

  function toLogin() {
    try { if (typeof stopSessionWatch === "function") stopSessionWatch(); } catch (e) {}
    try { if (typeof stopScanner === "function") stopScanner(); } catch (e) {}
    // 앱별 로그인 전환 함수 우선
    if (typeof showLogin === "function") { try { showLogin(); return; } catch (e) {} }
    if (typeof show === "function" && document.getElementById("sec-login")) { try { show("sec-login"); return; } catch (e) {} }
    // 폴백 — DOM 직접 토글
    var login = document.getElementById("sec-login") || document.getElementById("login-wrap");
    var dash = document.getElementById("sec-dashboard") || document.getElementById("dashboard");
    if (login) { login.classList.add("active"); login.style.display = ""; }
    if (dash) { dash.classList.remove("active"); dash.style.display = "none"; }
  }

  function notify() {
    if (typeof uiAlert === "function") { try { uiAlert(MSG, { title: "로그인 필요" }); return; } catch (e) {} }
    try { alert(MSG.replace("\n", " ")); } catch (e) {}
  }

  window.fetch = function (input, init) {
    return _fetch(input, init).then(function (res) {
      try {
        var url = (typeof input === "string") ? input : (input && input.url) || "";
        // 로그인/세션 폴링·연장 엔드포인트는 제외 (로그인 실패 401·안내 중복 방지)
        var skip = url.indexOf("/api/session-info") >= 0
          || url.indexOf("/api/session-extend") >= 0
          || url.indexOf("/login") >= 0;
        // 로그인 상태(대시보드 표시 중)에서 발생한 경우에만 안내 — 로그인 화면 배경 401 은 무시
        if ((res.status === 401 || res.status === 440) && !skip && !handling && dashVisible()) {
          handling = true;
          toLogin();
          notify();
          setTimeout(function () { handling = false; }, 1500);
        }
      } catch (e) {}
      return res;
    });
  };
})();
