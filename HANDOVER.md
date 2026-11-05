# 인수인계 — 지금 상태

> 내용 기준일 **2026-11-05** · 마지막 갱신 **2026-11-05 23:10 KST(UTC+9)**.
> 세션이 끝날 때마다 이 파일을 **덮어쓴다**(경과를 덧붙이지 않는다). 규칙·사양·문서 지도는 `CLAUDE.md`,
> 결정 경위는 `HISTORY.md`, 커밋별 상세는 git log. 30줄 안팎.

## 1. 지금 상태

- 도구 현재 버전 **v1.4.0** (2026-08-08 — 출차 여유 15분 `EXIT_BUFFER` + "⏰ 곧 만료" 경고). 이후 app.js 변경 없음.
- 배포: `github/master` = GitHub Pages(`https://tsusaikang.github.io/pweb-parking-discount-helper`).
- 2026-11-05 문서·공개 페이지 전면 점검(project-knowledge): CLAUDE.md 문서 지도·관리 규칙, `tools/docs-check.py` 신설,
  설치 페이지 §6·§7 현행화, version.json 의 숨은 의존(옛 북마클릿) 명시. 상세는 HISTORY.md 최상단.
- 최근 방향 전환: 2026-08-08 추천·초과안내 조합이 "경과시간 + 15분"을 덮도록(`EXIT_BUFFER`). 경위는 HISTORY.md.

## 2. 다음 할 일

- **네이버 서치어드바이저 등록** — 2026-07-21 "보류" 기록 이후 진행 없음. 호스트 단위라 루트 저장소
  `tsusaikang.github.io` 를 새로 만들어 확인 파일을 둬야 함(CLAUDE.md "검색 등록"). 할지 말지는 사용자 결정.
- PAT 만료 시 `git remote set-url github` + `set-url --push` 둘 다 갱신(CLAUDE.md "Cowork 세션에서 push").

## 3. 사용자 입력 대기

- **설치 페이지·README 문구만 고친 커밋의 버전 처리** — 규칙은 "소=버그·문구·UI"지만 버전은 app.js 에 붙는다.
  이번(2026-11-05 index.html §6·§7 정정)엔 올리지 않았다. 올려야 한다면 v1.4.1 로 3곳 + 이 문서의 현재 버전 갱신.
- **`_headers` 삭제 여부** — Cloudflare 용 잔재, GitHub Pages 에선 미사용. 두어도 해가 없다.

## 4. 미완료·미검증 (다음 세션이 이어서)

- 2026-11-05 배포 반영 확인됨(공개 index.html §7 에 "경과시간 + 15분" 표시).
- 설치 페이지의 휴대폰 가독성(글자 크기·가로 넘침)은 점검하지 않았다(스킬의 휴대폰 폭 확인 스크립트는 기록 페이지용이라 안 씀).
