# Fin-Set 핀셋

[공개 시연](https://id187.github.io/finset/) · [질문형 추천](https://id187.github.io/finset/?screen=guided) · [전체 상품·DB 검수 기록](https://id187.github.io/finset/?screen=inventory) · [웹/앱 미리보기](https://id187.github.io/finset/preview.html)

모바일 웹 412×917, PC 1280×800 기준이며 360px 화면도 지원합니다. 적용 기준은 `mvp/핀셋_MVP담당_최종갱신`의 **기획서 v1.6와 공통 확정 기준**입니다. 전달된 코어·규칙은 현재 버전과 해시가 같아 `2026-09-13-consistency-1` 원본을 유지합니다. [적용 기록](V16_APPLIED.md)을 확인하세요.

## 실행 방식

| 실행 환경 | 제공 범위 |
|---|---|
| 로컬 Python API + 웹 | 직접 입력한 금액·날짜와 실제 답변을 Python 코어로 계산 |
| 공개 GitHub Pages | 서버 없이 직접 입력한 금액·날짜·답변을 기존 Python 코어로 계산. 예시 14개도 같은 브라우저 코어로 재계산 |
| 선택적 추천 API 연결 | `VITE_FINSET_API_URL`을 지정하면 기존 HTTP 전송 방식 사용. 현재 시연에는 서버 불필요 |

GitHub Pages는 Pyodide 314.0.7과 Web Worker에서 Python 코어를 직접 실행합니다. 질문·금리·순위·계산 규칙은 변경하지 않습니다. 원본 DB는 보존하고, 검증한 별도 읽기 전용 자료와 원본 규칙을 압축 배포합니다. 추천 입력은 메모리에서만 처리하며 서버로 전송하지 않습니다. [구조와 검증 기록](BROWSER_RUNTIME.md)을 확인하세요.

## 질문과 결과

- **목표·기간 → 가용 금액 → 비교 범위 → 보유·유지 → 가입 조건**의 기본 5단계. 이후 필요한 코어 질문만 추가합니다.
- 답을 선택한 뒤 **다음**을 눌러 이동합니다. 은행 범위·우대 실천 의향·납입 방식을 미리 선택하지 않습니다.
- 주요 금액은 **만원 단위 정수**입니다. `30` 입력 → `30만원` 표시 → API `300000원`. 버튼은 교체하며 빈칸과 0원은 다릅니다. 보유 잔액·추가 상품 조건은 원래 단위를 유지합니다.
- 생활에 쓸 돈을 제외한 현재 목돈과 월 저축액을 같은 화면에서 받습니다. `budget_basis=available_after_expenses` 요청을 코어의 `cash`, `reserve=0`으로 변환해 이중 차감을 막습니다. 전체 자금과 가용 금액을 섞은 요청은 거절합니다.
- 목적은 선택, 기간은 1~120개월 또는 정확한 날짜입니다. 월 0원이면 수입 질문 생략, 변동 수입만 적은 달 여력을 확인합니다. 중간 사용·사업용·상환 우선·모두 0원은 조기 안내합니다.
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

## 서버 없이 로컬 확인

원본 DB가 없는 새 clone에서도 `npm ci`, `npm run build:pages`, `npm run preview:pages`로 실행합니다. 안내되는 `/finset/` 주소를 엽니다.

## 로컬 API 개발

Node 22 이상과 Python 3.11 이상을 사용합니다. 원본 패키지 기본 경로는 `../mvp/핀셋_MVP_팀원전달`입니다. 다른 위치는 `FINSET_DATA_DIR`로 지정합니다.

API를 개발하려면 전달 패키지의 원본 DB·규칙을 로컬에 준비합니다. 원본 규칙의 개별 파일은 Git에서 제외되어 있으며, Pages에는 검증한 브라우저 패키지가 포함됩니다. 이미 있는 파일의 해시가 다르면 덮어쓰지 않습니다.

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
python -X utf8 scripts/export-browser-core.py
npm run build:pages
npm run preview:pages -- --port 4175
```

- 전달 사례 14개는 카드뿐 아니라 **전체 Python 응답**을 기대값과 비교합니다.
- 납입 방식 `compare`, 우대 거절·미확인, 목표 부족, 후보 없음의 상태를 검사합니다.
- 기존 계산·조건·회복 회귀와 새 답변 의존성·정적 응답 검증을 유지합니다. 이전 JS 계산 테스트는 새 Python 코어의 계산 검증과 구분합니다.
- `node scripts/audit-v16.cjs`는 최신 기본 입력과 실제 코어 추천을 검사합니다. Pages는 `FINSET_URL`과 `FINSET_BROWSER=1`을 지정합니다. `scripts/browser-baselines.py` 실행 후 `scripts/audit-browser-core.cjs`는 기존 280개 응답과 자유 입력·오류 처리 13개를 브라우저 결과와 대조하고 API 요청이 없음을 검사합니다. Playwright 위치는 `PLAYWRIGHT_MODULE`로 지정합니다.
- `python -X utf8 tests/test_available_budget.py`로 가용 금액과 기존 코어 응답의 일치, 이중 차감 방지, 기간·변동 수입을 검증합니다.
- `scripts/check-browser-core.mjs`가 버전·출처·패키지 해시를 확인합니다. `scripts/strip-pages-rules.mjs`는 배포 폴더에서 과거 중복 자료·정적 응답을 제외하고, `scripts/copy-python-runtime.mjs`가 같은 사이트에서 제공할 Python 실행 파일을 복사합니다. 원본과 회귀 자료는 삭제하지 않습니다.
- main push 시 GitHub Actions가 테스트·빌드 후 Pages에 배포합니다.

## 주요 파일

- `core_vendor/`: 전달 Python 코어. manifest에 고정된 파일은 수정하지 않음
- `core_runtime.py`: 새 코어 호출·입력 검증·질문 표시 어댑터
- `server.py`: 기존 API 유지, `/api/v2` 추가
- `src/CoreFlow.tsx`, `coreState.ts`, `coreApi.ts`, `core.css`: 질문·답변 수정·실제 코어 결과 표시
- `public/browser-core/`: 검증한 실행 패키지, 작은 메타데이터, 출처·체크섬 기록
- `browser_source.py`, `browser_entry.py`, `src/core.worker.ts`, `src/browserCore.ts`: 읽기 전용 브라우저 자료 연결과 비동기 호출
- `public/demo/mvp2.json`: 기존 280개 응답의 회귀 테스트 기대값. 배포에서는 제외
- `src/Inventory.tsx`, `public/demo/inventory.json`: 전체 상품·원문·이전 검수 기록
- `catalogue_db.py`, `condition_db.py`, 이전 `src/interview.ts`: 기존 검수·회귀 자료
- `MVVP_APPLIED.md`: 적용 목록, 확인 결과, 남은 범위

실제 계좌 조회·가입·이체·최신 공시 갱신은 별도 단계입니다. 현재 질문형 추천 시연에는 추천 서버가 필요하지 않습니다.
