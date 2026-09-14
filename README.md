# Fin-Set 핀셋

[공개 시연](https://id187.github.io/finset/) · [질문형 추천](https://id187.github.io/finset/?screen=guided) · [전체 상품·DB 검수 기록](https://id187.github.io/finset/?screen=inventory) · [웹/앱 미리보기](https://id187.github.io/finset/preview.html)

웹 1280×800, 앱 412×917 기준이며 360px 화면도 지원합니다. 적용 기준은 `mvp/mvvp/핀셋_MVP담당_전달자료_갱신버전`의 기획서 v1.5와 질문·결과 화면 기준입니다. 코어는 `2026-09-13-consistency-1` 원본을 그대로 사용합니다.

## 실행 방식

| 실행 환경 | 제공 범위 |
|---|---|
| 로컬 Python API + 웹 | 직접 입력한 금액·날짜와 실제 답변을 Python 코어로 계산 |
| 공개 GitHub Pages | 전달된 가상 사례 14개와 납입 방식·자동이체 의향 조합 280개의 Python 응답 재생 |
| 향후 추천 API 연결 | `VITE_FINSET_API_URL` 지정 후 Pages에서도 자유 입력 계산 가능. 현재 배포한 서버는 없음 |

공개 화면에서 임의 금액을 바꿔 계산한 것처럼 표시하지 않습니다. 전체 `rules.json`을 브라우저 계산기로 이식하지 않으며 원본 DB를 배포하지 않습니다. 기존 회복·납입·저장 경로와 시연 자료는 유지합니다.

## 질문과 결과

- **목표 → 저축 여력 → 조건 확인**. 코어의 `questions`와 `remaining_questions`를 연결합니다.
- 답을 선택한 뒤 **다음**을 눌러 이동합니다. 은행 범위·우대 실천 의향·납입 방식을 미리 선택하지 않습니다.
- 금액 버튼은 해당 값으로 **교체**합니다. 원 단위 직접 입력, 천 단위 구분, 0원 입력을 지원합니다.
- 현재 현금·남길 생활비·월 추가 저축액·적은 달 여력·중간 사용액·목표금액의 도움말은 코어에서 가져옵니다.
- 객관적 조건과 `bonus_intents`를 구분합니다. `true`, `false`, `null`, 미입력을 구별하며 `compare`를 정액 납입 동의로 처리하지 않습니다.
- 앞선 답변을 수정해도 관련 없는 답은 유지합니다. 기존 조건이 달라진 우대 의향과 기간 관련 답만 다시 확인합니다.
- 목표일을 상품 만기에 맞춰 줄이지 않습니다. 목표 부족 안내를 먼저 표시하고, 사용자가 선택해야 현재 예산의 상품을 펼칩니다.
- 결과는 내 계획, 목표 예상 금액, 추천과 최대 2개 대안, 조건·수정 진입점을 보여줍니다. 잠정 상태와 필수 우대 행동은 접힌 상세 안에 숨기지 않습니다.
- 예금·적금 조합은 구성별 원금·월 납입액을 구분합니다. 첫 상품 만기 이후의 재예치 금리는 확정하지 않습니다.
- 입력과 질문 결과는 현재 흐름의 메모리에만 유지합니다. 기존 브라우저 납입 기록은 변경하지 않습니다.

## 데이터와 보존

상품·금리는 **2026년 8월 수집 스냅샷**입니다. 현재 판매 여부·가입 승인·실제 우대 실적을 확인한 자료가 아닙니다.

| 구분 | 수량과 의미 |
|---|---|
| 기존 전수 구조 검사 | 상품 12,542개, 금리 옵션 44,678개, 조건 조각 54,396개 |
| 기존 월적금 검수 | 2,349개 상품 / 7,982개 기간 옵션. 이전 브라우저 추천 검수 기록 |
| 새 Python 코어 | 규칙 25,560개 중 디지털 채널 연결 상품 3,644개. 실제 후보는 입력 조건에 따라 달라짐 |

전체 구조 검사는 모든 약관의 의미 해석 완료를 뜻하지 않습니다. 전체 상품 조회는 이전 검수 상태와 원문을 유지하고 새 코어의 범위와 구분합니다. 원본 DB, `rules.json`, `liquid_rules.json`, 기존 `bonus_conditions_v1.sqlite3`를 보존합니다. 원본 DB SHA256:

`15597888b0965ef565783957abea501d38130c0585ba3c86cd6355d86b954ef7`

## 로컬 실행

Node 22 이상과 Python 3.11 이상을 사용합니다. 원본 패키지 기본 경로는 `../mvp/핀셋_MVP_팀원전달`입니다. 다른 위치는 `FINSET_DATA_DIR`로 지정합니다.

전달 패키지의 코어 규칙·fixture는 원본을 보존하기 위해 Git에 포함하지 않습니다. 새로 clone했다면 최신코어 경로로 한 번 준비합니다. 이미 있는 파일의 해시가 다르면 덮어쓰지 않습니다.

```powershell
npm ci
python -X utf8 scripts/setup-core.py --package '../mvp/mvvp/핀셋_MVP담당_전달자료_갱신버전/02_개발적용/최신코어'
./start.ps1
```

`http://127.0.0.1:5173/?screen=guided`를 엽니다. 별도 터미널 두 개에서 `python -X utf8 server.py`, `npm run dev`를 실행해도 됩니다. API는 기본 `127.0.0.1:8000`에 바인딩하며 기존 API와 `/api/v2/meta`, `/api/v2/recommend`를 함께 제공합니다.

코어 모듈은 기존 회복 코드와 섞이지 않도록 별도 프로세스에서 실행합니다. 추천·순위·이자·목표 부족액은 Python 코어 응답을 사용합니다. 어댑터는 요청 검증, 읽기 전용 데이터 위치 연결, 질문 문구와 화면용 출처를 담당합니다.

## 검증과 Pages 빌드

```powershell
python -X utf8 core_vendor/verify.py --db '../mvp/핀셋_MVP_팀원전달/service_data_collection/service_products.sqlite3'
python -X utf8 tests/test_core_transport.py
npm run test:model
npm run test:pages
python -X utf8 scripts/export-mvp2.py
npm run build:pages
npm run preview:pages -- --port 4175
```

- 전달 사례 14개는 카드뿐 아니라 **전체 Python 응답**을 기대값과 비교합니다.
- 납입 방식 `compare`, 우대 거절·미확인, 목표 부족, 후보 없음의 상태를 검사합니다.
- 기존 계산·조건·회복 회귀와 새 답변 의존성·정적 응답 검증을 유지합니다. 이전 JS 계산 테스트는 새 Python 코어의 계산 검증과 구분합니다.
- `node scripts/audit-mvvp.cjs`는 로컬 자유 입력 흐름과 화면을 검사합니다. `FINSET_URL`을 지정하고 `FINSET_REPLAY=1`을 설정하면 Pages 시연을 검사합니다. Playwright 위치는 `PLAYWRIGHT_MODULE`로 지정합니다.
- `scripts/strip-pages-rules.mjs`는 생성된 배포 폴더에서 이전 전체 추천 규칙 파일을 제외합니다. 원본과 회귀 자료는 삭제하지 않습니다.
- main push 시 GitHub Actions가 테스트·빌드 후 Pages에 배포합니다.

## 주요 파일

- `core_vendor/`: 전달 Python 코어. manifest에 고정된 파일은 수정하지 않음
- `core_runtime.py`: 새 코어 호출·입력 검증·질문 표시 어댑터
- `server.py`: 기존 API 유지, `/api/v2` 추가
- `src/CoreFlow.tsx`, `coreState.ts`, `coreApi.ts`, `core.css`: 질문·답변 수정·실제 코어 결과 표시
- `public/demo/mvp2.json`: 동일 버전 코어의 280개 정적 응답. 파일명은 기존 연결을 유지
- `src/Inventory.tsx`, `public/demo/inventory.json`: 전체 상품·원문·이전 검수 기록
- `catalogue_db.py`, `condition_db.py`, 이전 `src/interview.ts`: 기존 검수·회귀 자료
- `MVVP_APPLIED.md`: 적용 목록, 확인 결과, 남은 범위

실제 계좌 조회·가입·이체·최신 공시 갱신과 공개 추천 서버 운영은 별도 단계입니다.
