/*
 * pweb 주차할인 계산기 — 본체 (app.js)
 *
 * 2026-07-21 로더 방식 전환 (사용자 승인): 북마크에는 초소형 로더만 들어가고,
 * 클릭할 때마다 이 파일을 GitHub Pages 에서 새로 받아 실행한다.
 *   - 이유: 전체 코드를 북마크 URL 에 내장하면 모바일 브라우저의 길이 한계로
 *     실행이 조용히 실패한다 (인코딩 후 수만 자).
 *   - 효과: 항상 최신 실행 → 수동 업데이트·버전 배너 불필요. 배포 = push 뿐.
 *   - 이 파일은 어떤 데이터도 외부로 보내지 않는다. 받아오기(GET)만 한다.
 *
 * 지원 화면 (둘 다 pweb.kr):
 *   PC  /discount/registration — 페이지 전역(dataSetMst/dataSetDtl)만 읽는다.
 *   모바일 /discount/doViewRegistrationDscnt/{id}/{token}/{날짜}/{cardType}
 *     — 전용 모바일 UI. 적용 내역이 페이지에 없어 조회 API
 *       POST /discount/registration/getForDiscount (읽기 전용)를 5초마다 부른다
 *       (2026-07-21 사용자 승인. 적용 내역은 응답의 parkVisitCar 필드).
 *
 * 계산 규칙 (사용자 확정 2026-07-16):
 *   커버 = 기본무료 30분 + 적용된 할인 dc_time 합계
 *   여유 = 커버 − 경과.  여유≥0 → 0원(여유 분·만료 시각 표시),
 *   부족 → 무료2시간(미사용 시) 먼저 + 최소 비용 유료권 조합(DP), 안전하게 초과 커버.
 *
 * ▼ 주차장 규칙이 다르면 BASE_FREE 와 TICKETS 만 고치면 된다 ▼
 */
(function () {
  var VERSION = '2026.07.22.8';
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

  // 화면 모드
  var ON_PWEB = /(^|\.)pweb\.kr$/i.test(location.hostname);
  // jQuery Mobile 마커 — 모바일 조회 화면 등이 PC 경로(/discount/registration…)와
  // 접두어를 공유할 수 있어, JQM 이면 PC 화면으로 취급하지 않는다 (오탐 방지)
  var JQM = !!document.querySelector('[data-role="page"], .ui-page');
  var PC_PAGE = location.pathname.indexOf('/discount/registration') === 0 && !JQM;
  var MOB_PAGE = location.pathname.indexOf('/discount/doViewRegistrationDscnt') === 0;

  // 부족한 need(분)을 최소 비용으로 덮는 유료권 조합 (DP). items 는 id→장수
  // 같은 비용이면 장수가 적은 조합을 고른다 (30분권 7장 대신 1시간권 3장+30분권 1장).
  function best(need) {
    if (need <= 0) return { cover: 0, cost: 0, items: {}, count: 0 };
    var MAX = need + 1440, dp = new Array(MAX + 1).fill(null);
    dp[0] = { cost: 0, items: {}, count: 0 };
    for (var m = 0; m <= MAX; m++) {
      if (!dp[m]) continue;
      for (var i = 0; i < PAID.length; i++) {
        var t = PAID[i], nm = Math.min(MAX, m + t.m),
            nc = dp[m].cost + t.p, nk = dp[m].count + 1;
        if (!dp[nm] || nc < dp[nm].cost || (nc === dp[nm].cost && nk < dp[nm].count)) {
          var it = Object.assign({}, dp[m].items);
          it[t.id] = (it[t.id] || 0) + 1;
          dp[nm] = { cost: nc, items: it, count: nk };
        }
      }
    }
    var b = null;
    for (var m2 = need; m2 <= MAX; m2++)
      if (dp[m2] && (!b || dp[m2].cost < b.cost || (dp[m2].cost === b.cost && dp[m2].count < b.count)))
        b = { cover: m2, cost: dp[m2].cost, items: dp[m2].items, count: dp[m2].count };
    return b;
  }

  // 이미 0원인데 "필요보다 비싸게" 적용했는지 판정 (사용자 확정 2026-07-22).
  // 무료2시간은 항상 활용한다고 보고, 최소 비용 조합보다 유료 지출이 크면 절약 안내.
  // 도구 추천대로(안전 초과 포함) 적용한 경우엔 curPaid == optCost 라 뜨지 않는다.
  function overApplied(elapsed, counts) {
    var curPaid = 0;
    Object.keys(counts).forEach(function (id) {
      if (byId[id] && byId[id].p > 0) curPaid += counts[id] * byId[id].p;
    });
    var need = Math.ceil(elapsed - BASE_FREE - byId[FREE_ID].m); // 무료2시간 활용 가정
    var opt = best(need);
    var optCost = opt.cost || 0;
    if (curPaid > optCost)
      return { save: curPaid - optCost, curPaid: curPaid, optCost: optCost,
               combo: opt, freeUsed: (counts[FREE_ID] || 0) >= 1 };
    return null;
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

  // ── 모바일: 적용 내역 조회 (읽기 전용, 5초 스로틀) ────────────────
  var M = { applied: null, lastFetch: 0, err: 0 };
  function mobParams() {
    var seg = location.pathname.split('/'); // ['','discount','doView…',id,token,날짜,cardType]
    // member_id 는 서버가 페이지(사이드 메뉴)에 박아준 "이름(ID)" 패턴에서 추출
    var mid = (document.body.textContent.match(/\(([A-Za-z0-9]{2,12})\)/) || [])[1] || '';
    return { id: seg[3] || '', startDate: seg[5] || '', iCardType: seg[6] || '0', member: mid };
  }
  function mobFetch() {
    var now = Date.now();
    if (now - M.lastFetch < 5000) return;
    M.lastFetch = now;
    var p = mobParams();
    try {
      fetch('/discount/registration/getForDiscount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'id=' + encodeURIComponent(p.id) + '&iCardType=' + encodeURIComponent(p.iCardType) +
              '&member_id=' + encodeURIComponent(p.member) + '&startDate=' + encodeURIComponent(p.startDate),
        credentials: 'same-origin'
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && 'parkVisitCar' in j) {
          var arr = j.parkVisitCar;
          if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { arr = []; } }
          M.applied = Array.isArray(arr) ? arr : [];
          M.err = 0;
        } else { M.err++; }
      }).catch(function () { M.err++; });
    } catch (e) { M.err++; }
  }

  // ── 호환성 자가진단 ──────────────────────────────────────────────
  // 기대 구조가 어긋나면 계산을 신뢰할 수 없으므로 전부 중단하고 차단한다.
  function compat() {
    var bad = [];
    if (MOB_PAGE) {
      var dt = document.getElementById('differentTime');
      if (!dt) bad.push('#differentTime 없음');
      else if (parseDT(dt.value || dt.textContent) == null) bad.push('주차시간 형식 다름');
      if (typeof window.fncGoDscnt !== 'function') bad.push('fncGoDscnt 함수 없음');
      if (!/^\d+$/.test((location.pathname.split('/')[3] || ''))) bad.push('URL 차량id 없음');
      if (M.err >= 3) bad.push('조회 API 연속 실패');
      if (M.applied && M.applied.length) {
        var d0 = M.applied[0];
        if (!('discountTypeId' in d0) || !('dc_time' in d0) || !('discount_name' in d0)) bad.push('적용내역 필드 다름');
        else if (!isFinite(parseFloat(d0.dc_time))) bad.push('dc_time 숫자 아님');
      }
    } else {
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
    }
    return bad;
  }

  // 안내 화면: 비호환이 아니라 "실행할 곳이 아님" — 차단하지 않고 안내만.
  // 폴링은 유지한다(화면이 바뀌어 구조가 나타나면 자동 복귀).
  function guide(onPweb) {
    setStatus('#2b6cb0', 'ℹ 안내');
    var el = document.getElementById('__pk_body');
    if (!el) return;
    el.innerHTML =
      '<div style="background:#ebf4ff;border:1px solid #90b8e0;border-radius:10px;padding:12px;line-height:1.7">' +
      (onPweb
        ? '<b>아직 할인등록 화면이 아닙니다.</b><br>로그인한 뒤 <b>할인등록 화면</b>으로 이동해서 이 북마크를 다시 실행하세요.'
        : '<b>이 도구는 pweb.kr 할인등록 화면 전용입니다.</b><br>건물의 pweb.kr 주소로 접속해 로그인한 뒤, <b>할인등록 화면</b>에서 실행하세요.') +
      '</div>';
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
    // 몇 장인지가 핵심 정보라 배지로 강조한다 (1장이어도 표시)
    var chip = '<span style="display:inline-block;margin-left:6px;padding:0 8px;border-radius:10px;font-weight:800;font-size:14px;color:#fff;background:' +
      (applied ? '#137a3f' : '#b26a00') + '">' + cnt + '장</span>';
    var right = applied
      ? '<span style="color:#137a3f;font-weight:700;white-space:nowrap">✓ 적용됨</span>'
      : '<span style="color:#b26a00;font-weight:700;white-space:nowrap">적용 필요</span>';
    var style = applied
      ? 'border:1px solid #86d9a8;background:#e6f7ed'
      : 'border:1px solid #f0c36d;background:#fff8e8';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;margin:6px 0;border-radius:8px;' + style + '">' +
      '<div><b>' + t.n + '</b>' + chip +
      '<span style="color:#888;margin-left:6px">' + (t.m * cnt) + '분 · ' + (t.p * cnt).toLocaleString() + '원</span></div>' +
      right + '</div>';
  }

  function setStatus(color, text) {
    var head = document.getElementById('__pk_head'),
        st = document.getElementById('__pk_status');
    if (head) head.style.background = color;
    if (st) st.textContent = MOBILE
      ? text.replace('0원 완료', '완료').replace('적용 필요', '부족').replace('사용 금지', '금지')
      : text;
  }

  function waiting(msg) {
    setStatus('#6b7280', '대기');
    var el = document.getElementById('__pk_body');
    if (el) el.innerHTML = '<div style="padding:10px;color:#888">' + msg + '</div>';
  }

  function render() {
    var el = document.getElementById('__pk_body');
    if (!el) return;
    var bad = compat();
    if (bad.length) {
      // 구조가 안 보이는 이유를 위치로 구분:
      //   pweb.kr 아님 → 전용 도구 안내 / pweb.kr 인데 지원 화면 아님 → 이동 안내
      //   지원 화면인데 어긋남 → 진짜 비호환 → 전면 차단
      if (ON_PWEB && (PC_PAGE || MOB_PAGE)) { block(bad); return; }
      guide(ON_PWEB); return;
    }
    var now = Date.now();

    // 화면 모드별로 차량·경과·적용내역을 모은다
    var carKey, carNo, rawE, appliedRaw;
    if (MOB_PAGE) {
      mobFetch(); // 5초 스로틀 내장
      if (M.applied === null) { waiting('적용 내역을 조회하는 중…'); return; }
      carKey = 'M' + location.pathname.split('/')[3];
      carNo = (document.getElementById('carNo') || {}).value || '-';
      var dt = document.getElementById('differentTime');
      rawE = parseDT(dt ? (dt.value || dt.textContent) : '');
      appliedRaw = M.applied.map(function (a) {
        return { typeId: String(a.discountTypeId), name: a.discount_name, min: parseFloat(a.dc_time) || 0 };
      });
    } else {
      var mst = window.dataSetMst,
          peId = (document.getElementById('peId') || {}).value;
      if (!peId) { S.carId = null; waiting('차량을 조회·선택하세요.'); return; }
      carKey = peId;
      var carRow = (mst || []).find ? (mst || []).find(function (r) { return String(r.id) === String(peId); }) : null;
      carNo = carRow ? carRow.carNo : '-';
      rawE = carRow ? parseFloat(carRow.incar_min)
                    : parseDT((document.getElementById('differentTime') || {}).textContent);
      appliedRaw = (window.dataSetDtl || []).map(function (a) {
        return { typeId: String(a.discountTypeId), name: a.discount_name, min: parseFloat(a.dc_time) || 0 };
      });
    }
    if (rawE == null || isNaN(rawE)) { waiting('경과시간을 읽는 중…'); return; }

    // 차량이 바뀌면 추적 리셋. PC 는 상세가 비동기라 base 스냅샷을 1초 늦춘다.
    if (carKey !== S.carId) {
      S = { carId: carKey, E: null, seenAt: now, base: null, baseAt: now + (MOB_PAGE ? 0 : 1000) };
    }
    if (rawE !== S.E) { S.E = rawE; S.seenAt = now; } // 사이트가 재조회하면 기준 갱신
    var elapsed = S.E + (now - S.seenAt) / 60000;     // 현재 경과(분, 실시간 보간)

    var counts = {}, sum = 0, list = [];
    appliedRaw.forEach(function (a) {
      counts[a.typeId] = (counts[a.typeId] || 0) + 1;
      sum += a.min;
      list.push(a.name + '(' + a.min + '분)');
    });
    if (S.base === null && now >= S.baseAt) S.base = counts;

    var covered = BASE_FREE + sum, margin = covered - elapsed;

    // 패널을 연 뒤 새로 적용된 할인 (id→장수)
    var newly = {};
    if (S.base) Object.keys(counts).forEach(function (id) {
      var d = counts[id] - (S.base[id] || 0);
      if (d > 0) newly[id] = d;
    });

    // ── 모바일: 우측 세로 도크용 최소 정보 레이아웃 (2026-07-21 사용자 요청) ──
    // 페이지에 이미 보이는 차량번호·주차시간 등은 생략. 상태 + 핵심 수치 +
    // 권종 칩(몇 장) + 비용·만료시각을 세로로 쌓는다.
    if (MOBILE) {
      // 좁은 세로 도크 — 좌우를 아끼고 요소를 위아래로 길게 쌓는다 (2026-07-22 사용자 요청).
      // 권종 칩은 이름/장수를 두 줄로, 구획마다 얇은 구분선 + 작은 라벨.
      var mchip = function (t, cnt, done) {
        return '<div style="margin:5px 0;padding:7px 3px;border-radius:10px;font-weight:800;font-size:12px;text-align:center;line-height:1.25;' +
          (done ? 'background:#e6f7ed;border:1px solid #86d9a8;color:#137a3f'
                : 'background:#fff8e8;border:1px solid #f0c36d;color:#8a5a00') + '">' +
          (done ? '✓ ' : '') + t.n + '<br><span style="font-size:13px">×' + cnt + '</span></div>';
      };
      var section = function (label, inner) {
        return '<div style="border-top:1px solid rgba(0,0,0,.08);margin-top:8px;padding-top:7px">' +
          '<div style="font-size:10px;color:#9aa0a6;text-align:center;margin-bottom:3px;line-height:1.3">' + label + '</div>' + inner + '</div>';
      };
      // 현재 적용된 할인 전부를 ✓칩으로 (PC 의 "적용된 할인" 표시에 해당)
      var appliedChips = Object.keys(counts).map(function (id) {
        return byId[id] ? mchip(byId[id], counts[id], true) : '';
      }).join('');
      var mh;
      if (margin >= 0) {
        setStatus('#137a3f', '✓ 0원 완료');
        mh = '<div style="text-align:center;padding:4px 0 2px">' +
             '<div style="font-size:22px;line-height:1">✅</div>' +
             '<div style="font-size:14px;font-weight:800;color:#0c5a2e;margin-top:3px">0원</div>' +
             '<div style="font-size:17px;font-weight:800;color:#0c5a2e;margin-top:11px;line-height:1.2">' + fmt(margin) + '</div>' +
             '<div style="font-size:11px;color:#137a3f;font-weight:700;margin-top:1px">남음</div>' +
             '<div style="font-size:12px;color:#137a3f;margin-top:11px">~<b>' + clock(now + margin * 60000) + '</b></div>' +
             '</div>';
        if (appliedChips) mh += section('적용된 할인', appliedChips);
        // 필요보다 많이 적용됐으면: 절약 라벨 + 최소 조합 칩 (같은 0원)
        var mOver = overApplied(elapsed, counts);
        if (mOver) {
          var oChips = (mOver.freeUsed ? '' : mchip(byId[FREE_ID], 1, false)) +
            TICKETS.map(function (t) {
              return (mOver.combo.items && mOver.combo.items[t.id]) ? mchip(t, mOver.combo.items[t.id], false) : '';
            }).join('');
          mh += section('<b style="color:#8a5a00">💡 -' + mOver.save.toLocaleString() + '원 가능</b><br>이 조합으로 바꾸면 절약', oChips);
        }
      } else {
        var mShort = elapsed - covered;
        var mFreeUsed = (counts[FREE_ID] || 0) >= 1;
        var mCombo = best(Math.ceil(mShort - (mFreeUsed ? 0 : byId[FREE_ID].m)));
        var mCover = (mFreeUsed ? 0 : byId[FREE_ID].m) + (mCombo.cover || 0);
        var mMargin = covered + mCover - elapsed;
        var pendChips = (mFreeUsed ? '' : mchip(byId[FREE_ID], 1, false)) +
          TICKETS.map(function (t) {
            return (mCombo.items && mCombo.items[t.id]) ? mchip(t, mCombo.items[t.id], false) : '';
          }).join('');
        setStatus('#c0392b', '⚠ 적용 필요');
        mh = '<div style="text-align:center;padding:4px 0 2px">' +
             '<div style="font-size:18px;line-height:1">⚠</div>' +
             '<div style="font-size:13px;font-weight:800;color:#96281b;margin-top:3px">부족</div>' +
             '<div style="font-size:17px;font-weight:800;color:#96281b;margin-top:9px;line-height:1.2">' + fmt(mShort) + '</div>' +
             '</div>';
        mh += section('적용하세요', pendChips);
        if (appliedChips) mh += section('이미 적용됨', appliedChips);
        mh += '<div style="text-align:center;color:#555;font-size:11px;margin-top:10px;line-height:1.55"><b>' +
              (mCombo.cost || 0).toLocaleString() + '원</b><br>적용 후<br>~<b>' + clock(now + mMargin * 60000) + '</b></div>';
      }
      el.innerHTML = mh;
      return;
    }

    var h = '';
    h += '<div style="font-size:15px;font-weight:700;margin-bottom:2px">' + carNo + '</div>';
    h += '<div style="color:#555;margin-bottom:8px">경과 <b>' + fmt(elapsed) + '</b> · 기본무료 ' + BASE_FREE + '분</div>';
    h += '<div style="margin-bottom:4px;color:#555">적용된 할인: ' +
         (list.length ? list.join(', ') : '<span style="color:#999">없음</span>') +
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
      // 필요보다 많이 적용됐으면 더 싼 조합으로 바꾸라고 안내 (같은 0원)
      var over = overApplied(elapsed, counts);
      if (over) {
        var oCards = '';
        if (!over.freeUsed) oCards += card(byId[FREE_ID], 1, false);
        TICKETS.forEach(function (t) {
          if (over.combo.items && over.combo.items[t.id]) oCards += card(t, over.combo.items[t.id], false);
        });
        h += '<div style="background:#fffbe6;border:1px solid #f0c36d;border-radius:10px;padding:10px 12px;margin-top:10px">' +
             '<div style="font-weight:800;color:#8a5a00">💡 필요보다 많이 적용됐어요 — ' + over.save.toLocaleString() + '원 절약 가능</div>' +
             '<div style="color:#555;margin:4px 0 8px;font-size:12px">지금 유료 할인 <b>' + over.curPaid.toLocaleString() + '원</b> 적용됨. 아래 조합이면 <b>같은 0원</b>인데 <b>' + over.optCost.toLocaleString() + '원</b>입니다.</div>' +
             oCards +
             '<div style="color:#777;font-size:12px;margin-top:4px">실수로 많이 적용했다면 <b>지금 유료 할인을 빼고</b> 위 조합으로 다시 적용하세요. 일부러 넉넉히 둔 거면 그대로 둬도 됩니다.</div>' +
             '</div>';
      }
    } else {
      var shortage = elapsed - covered;
      var freeUsed = (counts[FREE_ID] || 0) >= 1;
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
  if (old) { // 다시 누르면 닫기(토글)
    clearInterval(window.__pk_t);
    document.body.style.paddingRight = window.__pk_pad0 || '';
    old.remove(); return;
  }

  // 자동 실행(유저스크립트)으로 불렸을 때: 지원 화면이 아니면 조용히 물러난다
  // (조회 화면·로그인·다른 메뉴에서 패널이 뜨지 않게. 북마클릿 클릭은 항상 표시)
  if (window.__pk_auto && !(ON_PWEB && (PC_PAGE || MOB_PAGE))) return;

  // 모바일(터치) 기기면 우측 세로 도크(화면 폭의 ~29%). 하단 시트는 페이지의
  // 할인 버튼을 가려서 폐기(2026-07-21). 데스크톱 레이아웃으로 렌더되는 페이지
  // 대비 zoom 보정 유지 (모바일 전용 페이지는 뷰포트가 정상이라 Z≈1).
  var MOBILE = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  var Z = MOBILE ? Math.min(2.8, Math.max(1, (window.innerWidth || 400) / 400)) : 1;
  // 좁게 — 본문 글씨가 도크에 덜 가리도록 (2026-07-22). 세로로 긴 레이아웃이라 폭이 좁아도 됨.
  var dockRender = Math.min(130, Math.max(86, (window.innerWidth || 400) * 0.23)); // 화면상 실제 폭
  var DOCKW = Math.round(dockRender / Z); // zoom 반영한 style 폭

  var p = document.createElement('div');
  p.id = '__pk_panel';
  p.style.cssText = (MOBILE
    // 떠 있는 라운드 반투명 박스 (꽉 채우지 않기 — 2026-07-21 사용자 요청)
    ? 'position:fixed;top:' + Math.round(60 / Z) + 'px;right:' + Math.round(6 / Z) + 'px;width:' + DOCKW + 'px;max-height:' + Math.round(78 / Z) + 'vh;border:1px solid rgba(0,0,0,.15);border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.25);overflow-y:auto;overflow-x:hidden;zoom:' + Z + ';font-size:12px;background:rgba(255,255,255,.86);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)'
    : 'position:fixed;top:16px;right:16px;width:320px;border-radius:12px;border:1px solid #ccc;box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13px;background:#fff') +
    ';z-index:2147483647;font-family:-apple-system,"Malgun Gothic",sans-serif;color:#222';
  p.innerHTML = MOBILE
    ? '<div id="__pk_head" style="display:flex;justify-content:space-between;align-items:center;gap:2px;padding:6px 5px;background:#6b7280;color:#fff;border-radius:11px 11px 0 0;transition:background .3s">' +
      '<span id="__pk_min" style="cursor:pointer;font-size:15px;padding:2px 4px">▸</span>' + // 접기 — ✕와 반대편
      '<span id="__pk_status" style="font-weight:700;font-size:12px;white-space:nowrap">대기</span>' +
      '<span id="__pk_x" style="cursor:pointer;font-size:15px;padding:2px 4px">✕</span></div>' +
      '<div id="__pk_body" style="padding:9px 5px"></div>' +
      '<div id="__pk_foot" style="display:none"></div>'
    : '<div id="__pk_head" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#6b7280;color:#fff;border-radius:12px 12px 0 0;cursor:move;transition:background .3s">' +
      '<b>pweb 주차할인 계산기</b><span style="display:flex;align-items:center;gap:10px">' +
      '<span id="__pk_status" style="font-weight:700">대기</span>' +
      '<span id="__pk_min" style="cursor:pointer;font-size:16px;padding:2px 6px">▾</span>' +
      '<span id="__pk_x" style="cursor:pointer;font-size:16px;padding:2px 6px">✕</span></span></div>' +
      '<div id="__pk_body" style="padding:12px"></div>' +
      '<div id="__pk_foot" style="padding:6px 12px;color:#999;border-top:1px solid #eee">1초마다 자동 갱신 · 기본무료 ' + BASE_FREE + '분 기준 · v' + VERSION + ' (항상 최신 실행)<br>문의: tsusai@msn.com</div>';
  document.body.appendChild(p);

  // 모바일: 도크 폭만큼 본문 오른쪽 여백을 만들어 가려지는 영역이 없게 한다. 닫으면 원복.
  window.__pk_pad0 = document.body.style.paddingRight;
  function syncPad() {
    if (!MOBILE) return;
    try { document.body.style.paddingRight = Math.ceil(p.getBoundingClientRect().width + 10) + 'px'; } catch (e) {}
  }

  document.getElementById('__pk_x').onclick = function () {
    clearInterval(window.__pk_t);
    document.body.style.paddingRight = window.__pk_pad0 || '';
    p.remove();
  };

  // 접기/펴기 — 모바일 도크는 얇은 띠(상태색만 보임)로, 데스크톱은 헤더만 남긴다
  var minimized = false;
  document.getElementById('__pk_min').onclick = function () {
    minimized = !minimized;
    document.getElementById('__pk_body').style.display = minimized ? 'none' : '';
    document.getElementById('__pk_foot').style.display = (minimized || MOBILE) ? 'none' : '';
    if (MOBILE) {
      p.style.width = (minimized ? Math.ceil(34 / Z) : DOCKW) + 'px';
      var st = document.getElementById('__pk_status');
      var xb = document.getElementById('__pk_x');
      if (st) st.style.display = minimized ? 'none' : '';
      if (xb) xb.style.display = minimized ? 'none' : '';
      this.textContent = minimized ? '◂' : '▸';
    } else {
      this.textContent = minimized ? '▴' : '▾';
    }
    syncPad();
  };

  // 모바일: 헤더를 손가락으로 끌어 박스 위치 이동 (터치 드래그)
  if (MOBILE) (function () {
    var head = document.getElementById('__pk_head'), sx, sy, ox, oy, dragging = false;
    head.addEventListener('touchstart', function (e) {
      var t = e.target;
      if (t && (t.id === '__pk_x' || t.id === '__pk_min')) return; // 버튼은 드래그 제외
      var tc = e.touches[0];
      dragging = true; sx = tc.clientX; sy = tc.clientY;
      var r = p.getBoundingClientRect(); ox = r.left; oy = r.top;
    }, { passive: true });
    head.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var tc = e.touches[0];
      // zoom 이 적용된 요소라 스타일 좌표는 화면 좌표를 Z 로 나눠 넣는다
      p.style.left = Math.round((ox + tc.clientX - sx) / Z) + 'px';
      p.style.top = Math.round((oy + tc.clientY - sy) / Z) + 'px';
      p.style.right = 'auto';
      if (e.cancelable) e.preventDefault(); // 페이지 스크롤과 겹치지 않게
    }, { passive: false });
    head.addEventListener('touchend', function () { dragging = false; }, { passive: true });
  })();

  // 헤더 드래그로 이동 (데스크톱 전용 — 마우스)
  if (!MOBILE) (function () {
    var head = document.getElementById('__pk_head'), sx, sy, ox, oy, drag = false;
    head.addEventListener('mousedown', function (e) {
      if (e.target && e.target.id === '__pk_x') return; // 닫기 버튼은 드래그 시작 금지
      drag = true; sx = e.clientX; sy = e.clientY;
      var r = p.getBoundingClientRect(); ox = r.left; oy = r.top;
      // right 를 풀기 전에 left/top 을 현재 위치로 고정 — 안 그러면 패널이
      // 정적 위치(좌상단)로 점프해 click 이 무효가 되는 버그가 있었다
      p.style.left = r.left + 'px'; p.style.top = r.top + 'px';
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
  syncPad();
  clearInterval(window.__pk_t);
  window.__pk_t = setInterval(function () { render(); syncPad(); }, 1000);
})();
