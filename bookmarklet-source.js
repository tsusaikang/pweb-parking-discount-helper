/*
 * pweb 주차할인 계산기 — pweb.kr 웹 할인등록 화면 보조 패널 (북마클릿)
 *
 * 사이트 주소 앞부분(예: a23021)은 건물 번호일 뿐이며, 이 도구는 특정 건물에
 * 한정되지 않는다. pweb.kr 웹 할인등록 화면이면 어디서든 동작한다.
 *
 * 사이트는 pweb.kr(주차관제 벤더)이 제공하므로 직접 수정할 수 없다. 이 스크립트는
 * 이미 로그인된 페이지 위에 계산 패널을 하나 띄운다. 페이지가 이미 불러온
 * 데이터(전역 변수)만 읽으며, 외부로 아무것도 보내지 않고 저장하지도 않는다.
 * (예외 1건: 패널을 열 때 공개 배포 페이지의 version.json 을 1회 읽어 새 버전
 *  여부만 확인한다. 차량번호 등 어떤 데이터도 보내지 않으며 실패해도 무시한다.)
 *
 * 배포 절차: VERSION 을 올리고 → 같은 값으로 version.json 갱신 → 공개 페이지 재배포.
 *   기존 사용자 북마클릿이 version.json 과 자신의 VERSION 이 다르면
 *   패널 상단에 깜빡이는 업데이트 안내 + 새창 링크를 띄운다.
 *
 * 읽는 값:
 *   window.dataSetMst  — 조회된 차량 목록 (id, carNo, incar_min 경과분)
 *   #peId              — 현재 선택된 차량 id
 *   window.dataSetDtl  — 선택 차량에 이미 적용된 할인 목록 (discountTypeId, dc_time)
 *
 * 계산 규칙 (사용자 확정 2026-07-16):
 *   커버 = 기본무료 30분 + 적용된 할인 dc_time 합계
 *   여유 = 커버 − 경과.  여유≥0 → 0원(여유 분·만료 시각 표시),
 *   부족 → 무료2시간(미사용 시) 먼저 + 최소 비용 유료권 조합(DP), 안전하게 초과 커버.
 *
 * UI (2026-07-16 개편):
 *   - 추천 주차권을 카드 리스트로 표시. 패널을 연 뒤 사용자가 실제로 적용한
 *     주차권은 dataSetDtl 변화로 감지해 ✓적용됨 카드로 남기고,
 *     남은 부족분은 매번 재계산한다 (추천과 다른 권종을 써도 맞춰 감).
 *   - 헤더 색·배지로 완료(초록)/부족(빨강)/대기(회색) 상태를 크게 표시.
 *   - 0원 상태에선 남은 여유를 "N시간 N분 · HH:MM까지"로 크게, 1초마다
 *     카운트다운한다. (incar_min 은 재조회 전까지 고정이므로, 값이 갱신된
 *     시각을 기억해 현재 경과를 보간한다.)
 *
 * ▼ 주차장 규칙이 다르면 BASE_FREE 와 TICKETS 만 고치면 된다 ▼
 */
(function () {
  var VERSION = '2026.07.21';                 // 배포 버전 — version.json 과 함께 갱신할 것
  var HOME = 'https://pweb-parking-help.kr';  // 공개 배포 페이지 (도메인 확정 시 수정)
  var BASE_FREE = 30; // 기본 무료 주차시간(분)
  var TICKETS = [     // id = 사이트 discountTypeId
    { id: '5', m: 120,  p: 0,     n: '무료2시간' }, // 평일 · 1회 한정
    { id: '1', m: 30,   p: 500,   n: '30분권' },
    { id: '2', m: 60,   p: 1000,  n: '1시간권' },
    { id: '3', m: 240,  p: 4000,  n: '4시간권' },
    { id: '4', m: 1440, p: 15000, n: '24시간권' }
  ];
  var FREE_ID = '5';
  var PAID = TICKETS.filter(function (t) { return t.p > 0; });
  var byId = {};
  TICKETS.forEach(function (t) { byId[t.id] = t; });

  // 부족한 need(분)을 최소 비용으로 덮는 유료권 조합 (DP). items 는 id→장수
  function best(need) {
    if (need <= 0) return { cover: 0, cost: 0, items: {} };
    var MAX = need + 1440, dp = new Array(MAX + 1).fill(null);
    dp[0] = { cost: 0, items: {} };
    for (var m = 0; m <= MAX; m++) {
      if (!dp[m]) continue;
      for (var i = 0; i < PAID.length; i++) {
        var t = PAID[i], nm = Math.min(MAX, m + t.m), nc = dp[m].cost + t.p;
        if (!dp[nm] || nc < dp[nm].cost) {
          var it = Object.assign({}, dp[m].items);
          it[t.id] = (it[t.id] || 0) + 1;
          dp[nm] = { cost: nc, items: it };
        }
      }
    }
    var b = null;
    for (var m2 = need; m2 <= MAX; m2++)
      if (dp[m2] && (!b || dp[m2].cost < b.cost))
        b = { cover: m2, cost: dp[m2].cost, items: dp[m2].items };
    return b;
  }

  function fmt(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + '시간 ' : '') + m + '분';
  }
  function clock(ms) {
    var d = new Date(ms);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function parseDT(t) { // "6시간 20분" / "6:20" → 분
    if (!t) return null;
    var h = /(\d+)\s*시간/.exec(t), m = /(\d+)\s*분/.exec(t);
    if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
    var c = /(\d+):(\d+)/.exec(t);
    if (c) return +c[1] * 60 + +c[2];
    return null;
  }

  // 현재 선택 차량에 적용된 할인 → { counts: id→장수, sum: 총 차감분, list: 이름들 }
  function curApplied() {
    var counts = {}, sum = 0, list = [];
    (window.dataSetDtl || []).forEach(function (a) {
      var id = String(a.discountTypeId), min = parseFloat(a.dc_time) || 0;
      counts[id] = (counts[id] || 0) + 1;
      sum += min;
      list.push(a.discount_name + '(' + min + '분)');
    });
    return { counts: counts, sum: sum, list: list };
  }

  // ── 호환성 자가진단 ──────────────────────────────────────────────
  // 다른 건물 사이트는 구조가 다를 수 있다. 이 도구가 기대하는 구조가
  // 하나라도 어긋나면 계산을 신뢰할 수 없으므로 전부 중단하고 차단한다.
  function compat() {
    var bad = [];
    if (!document.getElementById('peId')) bad.push('#peId 입력 없음');
    if (typeof window.fncDoListMst !== 'function') bad.push('fncDoListMst 함수 없음');
    if (typeof window.fncDetailInfo !== 'function') bad.push('fncDetailInfo 함수 없음');
    var mst = window.dataSetMst;
    if (mst != null) {
      if (!Array.isArray(mst)) bad.push('dataSetMst 형식 다름');
      else if (mst.length) {
        var r = mst[0];
        if (!('id' in r) || !('carNo' in r) || !('incar_min' in r)) bad.push('dataSetMst 필드 다름');
        else if (!isFinite(parseFloat(r.incar_min))) bad.push('incar_min 숫자 아님');
      }
    }
    var dtl = window.dataSetDtl;
    if (dtl != null) {
      if (!Array.isArray(dtl)) bad.push('dataSetDtl 형식 다름');
      else if (dtl.length) {
        var d = dtl[0];
        if (!('discountTypeId' in d) || !('dc_time' in d) || !('discount_name' in d)) bad.push('dataSetDtl 필드 다름');
        else if (!isFinite(parseFloat(d.dc_time))) bad.push('dc_time 숫자 아님');
      }
    }
    return bad;
  }

  // 차단 화면: 폴링을 완전히 멈추고 사용 금지 안내만 남긴다
  function block(bad) {
    clearInterval(window.__pk_t);
    setStatus('#7f1d1d', '⛔ 사용 금지');
    var el = document.getElementById('__pk_body');
    if (el) el.innerHTML =
      '<div style="background:#7f1d1d;color:#fff;border-radius:10px;padding:14px;text-align:center">' +
      '<div style="font-size:20px;font-weight:800">⛔ 사용 금지</div>' +
      '<div style="margin-top:8px;line-height:1.6">이 사이트는 이 도구가 아는 구조와 달라<br><b>계산 결과를 신뢰할 수 없습니다.</b><br>모든 기능을 중단했습니다.</div>' +
      '<div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,.14);border-radius:8px">이 도구를 사용하지 마시고<br><b>강주상 (tsusai@msn.com)</b> 에게 문의하세요.</div>' +
      '</div>' +
      '<div style="margin-top:8px;color:#999;font-size:11px">사유: ' + bad.join(' · ') + '</div>';
  }

  // 차량별 추적 상태: 패널을 연 뒤 새로 적용된 할인을 알아내기 위한 기준(base)과
  // 경과시간 보간을 위한 (E, seenAt)
  var S = { carId: null, E: null, seenAt: 0, base: null, baseAt: 0 };

  function card(t, cnt, applied) {
    var right = applied
      ? '<span style="color:#137a3f;font-weight:700;white-space:nowrap">✓ 적용됨</span>'
      : '<span style="color:#b26a00;font-weight:700;white-space:nowrap">적용 필요</span>';
    var style = applied
      ? 'border:1px solid #86d9a8;background:#e6f7ed'
      : 'border:1px solid #f0c36d;background:#fff8e8';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin:6px 0;border-radius:8px;' + style + '">' +
      '<div><b>' + t.n + '</b>' + (cnt > 1 ? ' ×' + cnt : '') +
      '<span style="color:#888;margin-left:6px">' + (t.m * cnt) + '분 · ' + (t.p * cnt).toLocaleString() + '원</span></div>' +
      right + '</div>';
  }

  function setStatus(color, text) {
    var head = document.getElementById('__pk_head'),
        st = document.getElementById('__pk_status');
    if (head) head.style.background = color;
    if (st) st.textContent = text;
  }

  function render() {
    var el = document.getElementById('__pk_body');
    if (!el) return;
    var bad = compat();
    if (bad.length) { block(bad); return; } // 호환 문제 → 전면 차단
    var now = Date.now();
    var mst = window.dataSetMst,
        peId = (document.getElementById('peId') || {}).value;
    if (!peId) {
      S.carId = null;
      setStatus('#6b7280', '대기');
      el.innerHTML = '<div style="padding:10px;color:#888">차량을 조회·선택하세요.</div>';
      return;
    }

    // 차량이 바뀌면 추적 리셋. base(기준 적용내역)는 상세가 비동기로 오므로
    // 1초 뒤 스냅샷한다 — 그 전까지는 "새로 적용됨" 판정을 하지 않는다.
    if (peId !== S.carId) {
      S = { carId: peId, E: null, seenAt: now, base: null, baseAt: now + 1000 };
    }
    if (S.base === null && now >= S.baseAt) S.base = curApplied().counts;

    var car = (mst || []).find ? (mst || []).find(function (r) { return String(r.id) === String(peId); }) : null;
    var rawE = car ? parseFloat(car.incar_min)
                   : parseDT((document.getElementById('differentTime') || {}).textContent);
    if (rawE == null || isNaN(rawE)) {
      setStatus('#6b7280', '대기');
      el.innerHTML = '<div style="padding:10px;color:#888">경과시간을 읽는 중…</div>';
      return;
    }
    if (rawE !== S.E) { S.E = rawE; S.seenAt = now; } // 사이트가 재조회하면 기준 갱신
    var elapsed = S.E + (now - S.seenAt) / 60000;     // 현재 경과(분, 실시간 보간)

    var ap = curApplied();
    var covered = BASE_FREE + ap.sum, margin = covered - elapsed;

    // 패널을 연 뒤 새로 적용된 할인 (id→장수)
    var newly = {};
    if (S.base) Object.keys(ap.counts).forEach(function (id) {
      var d = ap.counts[id] - (S.base[id] || 0);
      if (d > 0) newly[id] = d;
    });

    var h = '';
    h += '<div style="font-size:15px;font-weight:700;margin-bottom:2px">' + (car ? car.carNo : '-') + '</div>';
    h += '<div style="color:#555;margin-bottom:8px">경과 <b>' + fmt(elapsed) + '</b> · 기본무료 ' + BASE_FREE + '분</div>';
    h += '<div style="margin-bottom:4px;color:#555">적용된 할인: ' +
         (ap.list.length ? ap.list.join(', ') : '<span style="color:#999">없음</span>') +
         ' · 커버 <b>' + fmt(covered) + '</b></div>';

    var appliedCards = Object.keys(newly).map(function (id) {
      return byId[id] ? card(byId[id], newly[id], true) : '';
    }).join('');

    if (margin >= 0) {
      setStatus('#137a3f', '✓ 0원 완료');
      h += '<div style="background:#e6f7ed;border:1px solid #86d9a8;border-radius:10px;padding:12px;text-align:center">' +
           '<div style="font-size:13px;color:#137a3f;font-weight:700">✅ 0원 상태 — 추가 적용 불필요</div>' +
           '<div style="font-size:22px;font-weight:800;color:#0c5a2e;margin-top:6px">' + fmt(margin) + ' 남음</div>' +
           '<div style="font-size:15px;color:#137a3f;margin-top:2px"><b>' + clock(now + margin * 60000) + '</b>까지 0원</div></div>';
      h += appliedCards;
    } else {
      var shortage = elapsed - covered;
      var freeUsed = (ap.counts[FREE_ID] || 0) >= 1;
      var need = Math.ceil(shortage - (freeUsed ? 0 : byId[FREE_ID].m));
      var combo = best(need);
      var pendCover = (freeUsed ? 0 : byId[FREE_ID].m) + (combo.cover || 0);
      var finalMargin = covered + pendCover - elapsed;

      setStatus('#c0392b', '⚠ 적용 필요');
      h += '<div style="background:#fdecea;border:1px solid #f1a9a0;border-radius:10px;padding:10px 12px;text-align:center">' +
           '<div style="font-size:13px;color:#c0392b;font-weight:700">⚠ 아직 부족합니다</div>' +
           '<div style="font-size:20px;font-weight:800;color:#96281b;margin-top:4px">부족 ' + fmt(shortage) + '</div></div>';
      h += appliedCards;
      h += '<div style="margin:8px 0 2px;font-weight:700">아래 주차권을 적용하세요</div>';
      if (!freeUsed) h += card(byId[FREE_ID], 1, false);
      TICKETS.forEach(function (t) {
        if (combo.items && combo.items[t.id]) h += card(t, combo.items[t.id], false);
      });
      h += '<div style="margin-top:6px;color:#555">예상 비용 <b>' + (combo.cost || 0).toLocaleString() +
           '원</b> · 적용 후 여유 ' + fmt(finalMargin) +
           ' (<b>' + clock(now + finalMargin * 60000) + '</b>까지)</div>';
    }
    el.innerHTML = h;
  }

  var old = document.getElementById('__pk_panel');
  if (old) { clearInterval(window.__pk_t); old.remove(); return; } // 다시 누르면 닫기(토글)

  // 모바일(터치) 기기면 하단 시트 형태. 이 사이트는 모바일 뷰포트 설정이 없어
  // 폰에서 데스크톱처럼 축소 렌더링될 수 있으므로 zoom 으로 읽을 크기로 키운다.
  var MOBILE = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  var Z = MOBILE ? Math.min(2.8, Math.max(1.3, (window.innerWidth || 400) / 400)) : 1;

  var p = document.createElement('div');
  p.id = '__pk_panel';
  p.style.cssText = (MOBILE
    ? 'position:fixed;left:0;right:0;bottom:0;border-radius:14px 14px 0 0;border-bottom:none;box-shadow:0 -6px 24px rgba(0,0,0,.25);max-height:' + Math.round(70 / Z) + 'vh;overflow:auto;zoom:' + Z
    : 'position:fixed;top:16px;right:16px;width:320px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18)') +
    ';z-index:2147483647;background:#fff;border:1px solid #ccc;font-family:-apple-system,"Malgun Gothic",sans-serif;font-size:13px;color:#222';
  p.innerHTML =
    '<div id="__pk_head" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#6b7280;color:#fff;border-radius:' +
    (MOBILE ? '14px 14px 0 0' : '12px 12px 0 0') + ';' + (MOBILE ? '' : 'cursor:move;') + 'transition:background .3s">' +
    '<b>pweb 주차할인 계산기</b><span style="display:flex;align-items:center;gap:10px">' +
    '<span id="__pk_status" style="font-weight:700">대기</span>' +
    '<span id="__pk_x" style="cursor:pointer;font-size:16px;padding:2px 6px">✕</span></span></div>' +
    '<div id="__pk_upd" style="display:none;padding:8px 12px;background:#b45309;color:#fff;line-height:1.5"></div>' +
    '<div id="__pk_body" style="padding:12px"></div>' +
    '<div style="padding:6px 12px;color:#999;border-top:1px solid #eee">1초마다 자동 갱신 · 기본무료 ' + BASE_FREE + '분 기준 · v' + VERSION + '</div>';
  document.body.appendChild(p);
  document.getElementById('__pk_x').onclick = function () { clearInterval(window.__pk_t); p.remove(); };

  // ── 버전 확인 (패널을 열 때 1회) ─────────────────────────────────
  // 공개 페이지의 정적 파일 version.json 만 읽는다. 아무 데이터도 보내지
  // 않으며, 서버가 없거나 실패하면 조용히 넘어간다 — 계산 기능과 무관.
  try {
    fetch(HOME + '/version.json', { mode: 'cors', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.version || String(v.version) === VERSION) return;
        var bar = document.getElementById('__pk_upd');
        if (!bar) return;
        if (!document.getElementById('__pk_css')) {
          var st = document.createElement('style');
          st.id = '__pk_css';
          st.textContent = '@keyframes __pk_blink{0%,100%{opacity:1}50%{opacity:.45}}';
          document.head.appendChild(st);
        }
        var page = (typeof v.page === 'string' && /^https:\/\//.test(v.page)) ? v.page : HOME;
        bar.style.display = 'block';
        bar.style.animation = '__pk_blink 1.1s infinite';
        bar.innerHTML = '🔔 새 버전 <b>v' + String(v.version).replace(/[<>&"']/g, '') + '</b> 이 나왔습니다!<br>' +
          '<a href="' + page + '" target="_blank" rel="noopener" style="color:#fff;font-weight:700">여기서 북마클릿을 새 버전으로 교체하세요 →</a>';
      })
      .catch(function () {});
  } catch (e) {}

  // 헤더 드래그로 이동 (데스크톱 전용 — 모바일 하단 시트는 고정)
  if (!MOBILE) (function () {
    var head = document.getElementById('__pk_head'), sx, sy, ox, oy, drag = false;
    head.addEventListener('mousedown', function (e) {
      drag = true; sx = e.clientX; sy = e.clientY;
      var r = p.getBoundingClientRect(); ox = r.left; oy = r.top;
      p.style.right = 'auto'; e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      p.style.left = (ox + e.clientX - sx) + 'px';
      p.style.top = (oy + e.clientY - sy) + 'px';
    });
    document.addEventListener('mouseup', function () { drag = false; });
  })();

  render();
  clearInterval(window.__pk_t);
  window.__pk_t = setInterval(render, 1000);
})();
