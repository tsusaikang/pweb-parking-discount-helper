#!/usr/bin/env python3
"""문서 지도 점검 — CLAUDE.md "문서 지도" 표를 정본으로 읽어 연결·분류·영향·정합성을 확인한다.

  list                 등록된 파일 전부(역할·분류·범위)
  topics [분류]        같은 분류의 파일을 제목·역할·범위부터 조회(분류 생략 시 분류 정의와 개수)
  links <파일>         그 파일이 적어 둔 정방향 연결(종류·대상·감시 키워드·이유)
  backrefs <파일>      그 파일을 가리키는 연결(정방향에서 계산 — 양쪽에 수기로 적지 않는다)
  affected [REV]       REV(기본 HEAD)와 작업 트리(미추적 포함) 사이 변경이 영향 주는 파일 → 확인할 것
  affected --staged    HEAD와 인덱스 사이(이번 커밋 대상)
  affected --base A --head B   두 커밋 사이(이미 커밋한 작업)
  check                등록 ↔ 실제 파일 양방향 대조, 연결 대상·분류 유효성, 본문의 파일 참조 존재,
                       버전 3곳+HANDOVER 일치, 래퍼 @version 표기 일치, 코드 값(EXIT_BUFFER·BASE_FREE)과 문서·설치 페이지 서술 일치,
                       로더 길이 서술 일치, HANDOVER 머리말, 한글 \\uXXXX 이스케이프
표준 라이브러리만 쓴다. 기계는 확인 대상을 고를 뿐이고 실제 영향은 문서를 열어 판단한다.
"""
import os, re, subprocess, sys, unicodedata, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DOC_MAP = 'CLAUDE.md'
MAP_HEADING = '## 문서 지도'          # 이 헤딩부터 다음 '## ' 전까지가 등록부
nfc = lambda s: unicodedata.normalize('NFC', s)
REL = re.compile(r'^(의존|참고|상충)\s*:\s*([^\s(—]+)\s*(?:\(([^)]*)\))?\s*(?:—\s*(.*))?$')
FILE_TOKEN = re.compile(r'`([\w\-./가-힣]+\.(?:md|txt|js|json|html|xml|py|css))`')


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def git(*args):
    r = subprocess.run(['git', '-c', 'core.quotepath=false', *args], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f'git {" ".join(args)} 실패: {r.stderr.strip()}')
    return r.stdout


def registry():
    """CLAUDE.md 문서 지도 절의 표와 분류 정의를 읽는다."""
    t = read(DOC_MAP)
    i = t.find(MAP_HEADING)
    if i < 0: raise SystemExit(f'{DOC_MAP}에 "{MAP_HEADING}" 절이 없다')
    j = t.find('\n## ', i + len(MAP_HEADING))
    sec = t[i:j if j > 0 else None]
    topics = {m.group(1): m.group(2).strip() for m in re.finditer(r'^- \*\*([^*]+)\*\* — (.+)$', sec, re.M)}
    rows = []
    for line in sec.splitlines():
        if not line.startswith('| `'): continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) < 5: raise SystemExit(f'문서 지도 표의 열이 5개가 아니다: {line[:60]}')
        path = nfc(cells[0].strip('`'))
        rels = []
        for part in (p.strip() for p in cells[4].split(';')):
            if not part or part == '—': continue
            m = REL.match(part)
            if not m: raise SystemExit(f'{path}: 연결 형식 오류 — "{part}" (종류: 대상(키워드) — 이유)')
            kws = [k.strip() for k in (m.group(3) or '').split(',') if k.strip()]
            rels.append({'kind': m.group(1), 'to': nfc(m.group(2)), 'kw': kws, 'why': (m.group(4) or '').strip()})
        rows.append({'path': path, 'role': cells[1], 'topics': [x.strip() for x in cells[2].split('·')],
                     'scope': cells[3], 'rels': rels})
    if not rows: raise SystemExit('문서 지도 표에 행이 없다')
    return rows, topics


def by_path(rows): return {r['path']: r for r in rows}


def cmd_list(a):
    for r in registry()[0]:
        print(f"{r['path']:34} {r['role']} [{'·'.join(r['topics'])}] — {r['scope']}")
    return 0


def cmd_topics(a):
    rows, topics = registry()
    if not a:
        for name, meaning in topics.items():
            n = sum(name in r['topics'] for r in rows)
            print(f'{name}({n}): {meaning}')
        return 0
    hit = [r for r in rows if a[0] in r['topics']]
    if a[0] not in topics: print(f'정의되지 않은 분류: {a[0]} (정의: {", ".join(topics)})'); return 1
    print(f'[{a[0]}] {topics[a[0]]}')
    for r in hit: print(f"  {r['path']:34} {r['role']} — {r['scope']}")
    return 0


def cmd_links(a):
    rows = registry()[0]; m = by_path(rows)
    if not a or nfc(a[0]) not in m: print('등록된 파일 경로를 하나 주세요'); return 2
    r = m[nfc(a[0])]
    print(f"{r['path']} — {r['role']} [{'·'.join(r['topics'])}]")
    for x in r['rels']:
        print(f"  {x['kind']} → {x['to']}" + (f"({', '.join(x['kw'])})" if x['kw'] else '') + (f" — {x['why']}" if x['why'] else ''))
    return 0


def backrefs(rows, target):
    return [(r, x) for r in rows for x in r['rels'] if x['to'] == target]


def cmd_backrefs(a):
    rows = registry()[0]
    if not a: print('파일 경로를 하나 주세요'); return 2
    t = nfc(a[0]); hits = backrefs(rows, t)
    print(f'{t} 를 가리키는 연결 {len(hits)}건 (정방향에서 계산)')
    for r, x in hits:
        print(f"  {r['path']} ({x['kind']})" + (f" 감시: {', '.join(x['kw'])}" if x['kw'] else '') + (f" — {x['why']}" if x['why'] else ''))
    return 0


def changed_files(mode):
    """(변경 파일 집합, 각 파일의 변경 줄 함수, 비교 범위 설명)"""
    if mode and mode[0] == '--staged':
        spec, desc = ['--cached', 'HEAD'], 'HEAD ↔ 인덱스(staged)'
        untracked = set()
    elif mode and mode[0] == '--base':
        if len(mode) < 4 or mode[2] != '--head': raise SystemExit('사용: affected --base <A> --head <B>')
        spec, desc = [mode[1], mode[3]], f'{mode[1]} ↔ {mode[3]}'
        untracked = set()
    else:
        rev = mode[0] if mode else 'HEAD'
        spec, desc = [rev], f'{rev} ↔ 작업 트리(미추적 포함)'
        untracked = {nfc(x) for x in git('ls-files', '--others', '--exclude-standard').splitlines() if x}
    files = {nfc(x) for x in git('diff', '--name-only', '--no-renames', *spec).splitlines() if x} | untracked

    def lines(path):
        if path in untracked:
            return read(path).splitlines()
        d = git('diff', '-U0', '--no-renames', *spec, '--', path)
        return [l[1:] for l in d.splitlines() if l[:1] in '+-' and not l.startswith(('+++', '---'))]
    return files, lines, desc


def cmd_affected(a):
    rows = registry()[0]; m = by_path(rows)
    files, lines, desc = changed_files(a)
    print(f'비교 범위: {desc}')
    if not files: print('바뀐 파일 없음'); return 0
    unreg = sorted(f for f in files if f not in m)
    if unreg: print('△ 문서 지도에 없는 변경 파일(등록하거나 제외 사유를 적을 것): ' + ', '.join(unreg))
    flagged = {}
    for f in sorted(files):
        for r, x in backrefs(rows, f):
            if x['kw']:
                found = sorted({k for k in x['kw'] for l in lines(f) if k in l})
                if not found: continue
                why = f'{f} 의 감시 키워드가 든 줄 변경: {", ".join(found)}'
            else:
                why = f'{f} 변경'
            flagged.setdefault(r['path'], []).append((x['kind'], why, x['why']))
    if not flagged: print('연결망에서 영향 후보 없음 — 등록 밖 검색(대상명·값·조건 grep)은 따로 할 것'); return 0
    for p, items in flagged.items():
        print(f'■ {p}  ({m[p]["role"]})')
        for kind, why, reason in items:
            print(f'   - [{kind}] {why}' + (f' — {reason}' if reason else ''))
    print('\n→ 위 파일을 열어 실제로 어긋나는지 보고, 어긋나면 같은 작업에서 고친다(의존은 필수 확인, 참고는 읽어 볼 것).')
    return 0


def cmd_check(a):
    rows, topics = registry(); m = by_path(rows); errs, warns = [], []
    tracked = {nfc(x) for x in git('ls-files').splitlines() if x}
    for f in sorted(tracked - set(m)): errs.append(f'추적 파일이 문서 지도에 없음: {f}')
    for p in m:
        if not os.path.exists(os.path.join(ROOT, p)): errs.append(f'문서 지도의 파일이 없음: {p}')
        elif p not in tracked: warns.append(f'문서 지도의 파일이 git 미추적: {p}')
    for r in rows:
        for t in r['topics']:
            if t not in topics: errs.append(f"{r['path']}: 정의되지 않은 분류 '{t}'")
        for x in r['rels']:
            if x['to'] not in m: errs.append(f"{r['path']}: 연결 대상이 문서 지도에 없음 — {x['to']}")
            if x['kind'] == '상충': warns.append(f"{r['path']} ↔ {x['to']}: 미해결 상충 — {x['why']}")
    # 본문의 파일 참조(백틱 파일명·md 링크)가 실제로 있는지 — 이력 분류는 옛 이름을 일부러 적으므로 제외
    for r in rows:
        if not r['path'].endswith('.md') or '이력' in r['topics'] or not os.path.exists(os.path.join(ROOT, r['path'])): continue
        t = read(r['path'])
        for tok in set(FILE_TOKEN.findall(t)) | set(re.findall(r'\]\(((?!https?://)[^)#]+\.(?:md|txt|js|json|html|py))\)', t)):
            if not os.path.exists(os.path.join(ROOT, nfc(tok))): errs.append(f"{r['path']}: 존재하지 않는 파일을 가리킴 — {tok}")
        if re.search(r'\\u(A[C-F]|[BCD][0-9A-F])[0-9A-F]{2}', t): errs.append(f"{r['path']}: 한글이 \\uXXXX 로 저장됨")
    # 버전 3곳 + HANDOVER (없는 파일은 위에서 오류로 잡혔으므로 빈 내용으로 계속)
    def safe(p): return read(p) if os.path.exists(os.path.join(ROOT, p)) else ''
    app = safe('app.js'); idx = safe('index.html')
    v_app = re.search(r"var VERSION = '([^']+)'", app)
    v_json = re.search(r'"version"\s*:\s*"([^"]+)"', safe('version.json'))
    v_idx = re.search(r'class="vtag">v([^<]+)<', idx)
    v_ho = re.search(r'현재 버전 \*\*v([^*]+)\*\*', safe('HANDOVER.md'))
    vs = {'app.js': v_app, 'version.json': v_json, 'index.html 이력 최상단': v_idx, 'HANDOVER.md': v_ho}
    vals = {k: v.group(1) for k, v in vs.items() if v}
    for k in vs:
        if k not in vals: errs.append(f'{k}: 버전 표기를 못 찾음')
    if len(set(vals.values())) > 1: errs.append('버전 불일치: ' + ', '.join(f'{k}={v}' for k, v in vals.items()))
    # 래퍼 @version ↔ CLAUDE.md 표기
    us = re.search(r'@version\s+(\S+)', safe('pweb-parking-calc.user.js'))
    cl_us = re.search(r'`@version`\(현재 ([0-9.]+)', safe('CLAUDE.md'))
    if not us or not cl_us: errs.append('래퍼 @version 또는 CLAUDE.md 의 "`@version`(현재 x.y.z" 표기를 못 찾음')
    elif us.group(1) != cl_us.group(1): errs.append(f'래퍼 @version {us.group(1)} ≠ CLAUDE.md 표기 {cl_us.group(1)}')
    # 코드 값 ↔ 문서·설치 페이지 서술
    cl = safe('CLAUDE.md'); rd = safe('README.md')
    for name, pats in {'EXIT_BUFFER': [('CLAUDE.md', cl, '`EXIT_BUFFER` = {v}분'), ('index.html', idx, '경과시간 + {v}분'), ('README.md', rd, '출차 여유 {v}분')],
                       'BASE_FREE': [('CLAUDE.md', cl, '기본 무료 {v}분'), ('index.html', idx, '기본 무료시간</td><td>{v}분')]}.items():
        mv = re.search(r'var %s = (\d+)' % name, app)
        if not mv: errs.append(f'app.js 에서 {name} 값을 못 찾음'); continue
        for fname, text, pat in pats:
            if pat.format(v=mv.group(1)) not in text: errs.append(f'{fname}: {name}={mv.group(1)} 서술("{pat.format(v=mv.group(1))}")이 없음')
    # 로더 길이 서술
    src = re.search(r'<script type="text/plain" id="src">(.*?)</script>', idx, re.S)
    if src:
        raw = src.group(1).strip(); enc = len('javascript:' + urllib.parse.quote(raw, safe="-_.!~*'()"))
        ms = re.search(r'원문 (\d+)자 / `javascript:`\+인코딩 후 (\d+)자', cl)
        if not ms: errs.append('CLAUDE.md: 로더 길이 서술을 못 찾음')
        elif (int(ms.group(1)), int(ms.group(2))) != (len(raw), enc):
            errs.append(f'CLAUDE.md 로더 길이 {ms.group(1)}/{ms.group(2)} ≠ 실제 {len(raw)}/{enc}')
    else: errs.append('index.html: id="src" 로더를 못 찾음')
    ho = safe('HANDOVER.md')
    if not re.search(r'내용 기준일 \*\*\d{4}-\d{2}-\d{2}\*\* · 마지막 갱신 \*\*\d{4}-\d{2}-\d{2} \d{2}:\d{2} KST', ho):
        errs.append('HANDOVER.md: 머리말의 기준일·갱신 시각(KST) 형식이 다름')
    if ho.count('\n') > 40: warns.append(f'HANDOVER.md 가 {ho.count(chr(10))}줄 — 30줄 이내 규칙')
    for w in warns: print('△ ' + w)
    if errs: print('\n'.join('✗ ' + e for e in errs)); return 1
    print(f'✓ 문서 지도 {len(rows)}개 — 등록·연결·분류·파일 참조·버전({vals["app.js"]})·래퍼 @version·코드 값·로더 길이·HANDOVER 머리말 모두 맞음'
          + (f' (경고 {len(warns)}건)' if warns else ''))
    return 0


if __name__ == '__main__':
    a = sys.argv[1:] or ['check']
    cmds = {'list': cmd_list, 'topics': cmd_topics, 'links': cmd_links, 'backrefs': cmd_backrefs,
            'affected': cmd_affected, 'check': cmd_check}
    if a[0] not in cmds: print(__doc__); sys.exit(2)
    sys.exit(cmds[a[0]](a[1:]))
