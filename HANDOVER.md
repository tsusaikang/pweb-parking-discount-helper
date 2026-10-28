# 인수인계 — 지금 상태

> 내용 기준일 **2026-10-29** · 마지막 갱신 **2026-10-29 00:10 KST(UTC+9)**.
> 세션이 끝날 때마다 이 파일을 **덮어쓴다**(경과를 덧붙이지 않는다). 규칙·현행 사양의 정본은 `CLAUDE.md`,
> 결정 경위·실측 사례는 `HISTORY.md`, 커밋별 상세는 git log. 30줄 이내.

## 1. 지금 상태

- 도구 현재 버전 **v1.4.0** (2026-08-08 — 출차 여유 15분 `EXIT_BUFFER` + "⏰ 곧 만료" 경고). 이후 도구 변경 없음.
- 배포: `github/master` = GitHub Pages(`https://tsusaikang.github.io/pweb-parking-discount-helper`). 작업 트리 깨끗.
- 운영 문서는 2026-10-25 에 역할별로 분리됐고(CLAUDE.md 규칙·현행 / HISTORY.md 경위 / HANDOVER.md 상태),
  2026-10-29 에 머리말 기준일·갱신 시각 표기와 기본 시간대(KST) 규칙을 맞췄다.
- 기록 페이지(records-pages)는 이 프로젝트에 **없다** — 세울지 여부는 아래 §3.

## 2. 다음 할 일

- **네이버 서치어드바이저 등록** — 호스트 단위(`https://tsusaikang.github.io`)라 루트 저장소
  `tsusaikang.github.io` 를 새로 만들어 확인 파일을 둬야 함. 미착수(CLAUDE.md "검색 등록").
- PAT 만료 시 `git remote set-url github` + `set-url --push` 둘 다 갱신(CLAUDE.md "Cowork 세션에서 push").

## 3. 사용자 입력 대기

- **기록 페이지를 세울지**: 이 저장소는 공개(GitHub Pages)라 로그인 잠금이 안 되고, 담을 내용(계산 규칙·결정
  경위)도 이미 공개 문서에 다 있다. 세운다면 공개 페이지로 이 저장소 `records/` 에 둘지, 아니면 두지 않을지.

## 4. 최근 방향 전환

- 2026-08-08: 추천·초과안내 조합이 "경과시간 + 15분"을 덮도록 바뀜(`EXIT_BUFFER`). 여유를 깎는 "500원 절약"
  안내는 더 이상 뜨지 않는다. 경위는 HISTORY.md.
