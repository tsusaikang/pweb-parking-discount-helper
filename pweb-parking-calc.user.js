// ==UserScript==
// @name         pweb 주차할인 계산기
// @namespace    https://tsusaikang.github.io/pweb-parking-discount-helper
// @version      1.0.0
// @description  pweb.kr 할인등록 화면에서 "0원까지 할인권을 몇 장 더 적용해야 하는지"를 자동 계산해 패널로 표시 (비공식 보조 도구)
// @author       강주상 (tsusai@msn.com)
// @match        https://*.pweb.kr/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://tsusaikang.github.io/pweb-parking-discount-helper/pweb-parking-calc.user.js
// @updateURL    https://tsusaikang.github.io/pweb-parking-discount-helper/pweb-parking-calc.user.js
// ==/UserScript==

/*
 * 본체(app.js)를 배포 페이지에서 항상 최신으로 받아 실행하는 래퍼 —
 * 북마클릿 로더와 같은 방식이다. 데이터는 아무것도 보내지 않는다.
 *
 * 지원 화면(PC·모바일 할인등록)에서만 패널을 띄우고, 로그인 페이지나
 * 다른 메뉴에서는 아무것도 하지 않는다(자동 실행이 방해되지 않도록).
 * 계산 로직·UI·호환성 가드는 전부 app.js 쪽에 있다.
 */
(function () {
  'use strict';
  var path = location.pathname;
  if (path.indexOf('/discount/registration') !== 0 &&
      path.indexOf('/discount/doViewRegistrationDscnt') !== 0) return; // 지원 화면에서만
  var s = document.createElement('script');
  s.src = 'https://tsusaikang.github.io/pweb-parking-discount-helper/app.js?t=' + Date.now();
  s.onerror = function () { console.warn('[pweb 주차할인 계산기] app.js 로드 실패 — 인터넷 연결 확인'); };
  (document.head || document.documentElement).appendChild(s);
})();
