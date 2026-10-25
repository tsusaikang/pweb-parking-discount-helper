# 인수인계 — 지금 상태

> 세션이 끝날 때마다 이 파일을 **덮어쓴다**(경과를 덧붙이지 않는다). 규칙·현행 사양의 정본은 `CLAUDE.md`,
> 결정 경위·실측 사례는 `HISTORY.md`, 커밋별 상세는 git log. 30줄 이내.

## 1. 지금 상태 (2026-10-25)

- 도구 현재 버전 **v1.4.0** (2026-08-08 — 출차 여유 15분 `EXIT_BUFFER` + "⏰ 곧 만료" 경고). 이후 도구 변경 없음.
- 배포: `github/master` = GitHub Pages(`https://tsusaikang.github.io/pweb-parking-discount-helper`). 작업 트리 깨끗.
- 2026-10-25 운영 문서 정리: CLAUDE.md 는 규칙·현행만, 결정 경위는 HISTORY.md 로 분리, HANDOVER.md 신설,
  README.md·소개글.txt 의 낡은 서술(삭제된 bookmarklet-source.js·하단 시트) 현행화.

## 2. 다음 할 일

- **네이버 서치어드바이저 등록** — 호스트 단위(`https://tsusaikang.github.io`)라 루트 저장소
  `tsusaikang.github.io` 를 새로 만들어 확인 파일을 둬야 함. 미착수(CLAUDE.md "검색 등록").
- PAT 만료 시 `git remote set-url github` + `set-url --push` 둘 다 갱신(CLAUDE.md "Cowork 세션에서 push").

## 3. 사용자 입력 대기

- 없음.

## 4. 최근 방향 전환

- 2026-08-08: 추천·초과안내 조합이 "경과시간 + 15분"을 덮도록 바뀜(`EXIT_BUFFER`). 여유를 깎는 "500원 절약"
  안내는 더 이상 뜨지 않는다. 경위는 HISTORY.md.
