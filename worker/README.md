# Cafe 701 OCR Worker

Cafe 701 CCTV 화면에서 번호판 영역을 캡처하고 OCR로 현재 번호를 읽어 Vercel API에 전송하는 별도 Worker입니다.

## 설치

```powershell
cd C:\worktime_v2
python -m venv worker\.venv
worker\.venv\Scripts\python -m pip install --timeout 120 setuptools wheel -i https://pypi.org/simple
worker\.venv\Scripts\python -m pip install --timeout 120 -e "worker[test]" -i https://pypi.org/simple
worker\.venv\Scripts\python -m playwright install chromium
```

RapidOCR를 기본 엔진으로 사용합니다. Tesseract는 보조 엔진으로만 두었고, 실제 사용 전 Windows에 Tesseract 실행 파일을 별도로 설치해야 합니다.

## 설정

```powershell
Copy-Item worker\.env.example worker\.env
```

`worker\.env`에서 최소 아래 값을 설정합니다.

```dotenv
BACKEND_URL=https://your-site.vercel.app
OCR_WORKER_TOKEN=Vercel에 설정한 OCR_WORKER_TOKEN과 같은 값
OCR_ENGINE=rapidocr
CAPTURE_MODE=click
```

`OCR_PANEL_ROI_*`는 CCTV 이미지 안에서 번호판 전체 영역을 자르는 값입니다. `OCR_MAIN_ROI_*`와 `OCR_LIST_ROI_*`는 잘린 번호판 이미지 안에서 각각 큰 번호와 목록 번호 영역을 자르는 값입니다. 모든 값은 0부터 1까지의 비율입니다.

`CAPTURE_MODE=direct_image`와 `DIRECT_IMAGE_URL`을 함께 설정하면 Playwright 페이지 reload 없이 snapshot 이미지 URL을 직접 받아 OCR합니다. 실제 snapshot URL을 찾기 전에는 `click` 또는 `reload`를 유지합니다.

Worker는 번호판 ROI 이미지가 직전 캡처와 거의 같으면 OCR을 생략합니다. `FORCE_OCR_INTERVAL_SECONDS`마다 한 번은 강제로 OCR을 돌려 변화 감지 누락을 보정합니다.

백엔드 전송은 캡처 루프와 분리된 큐에서 처리합니다. 새 번호를 큐에 넣은 뒤 worker는 API 응답을 기다리지 않고 다음 캡처로 넘어갑니다.

## 실행

한 번만 캡처해서 확인:

```powershell
worker\.venv\Scripts\python -m cafe_ocr_worker.main --once
```

계속 감시:

```powershell
worker\.venv\Scripts\python -m cafe_ocr_worker.main
```

처음 번호, 큰 점프, 리셋처럼 오탐 가능성이 큰 값은 `OCR_CONFIRMATION_REPEATS` 횟수만큼 같은 번호가 반복되어야 전송됩니다. 큰 번호가 OCR에서 안 잡히면 목록 번호 중 가장 큰 번호를 현재 번호로 보냅니다.

## 이미지 파일로 테스트

실제 CCTV 접속 없이 캡처 이미지로 OCR만 검증할 수 있습니다.

```dotenv
CAPTURE_MODE=fixture
FIXTURE_IMAGE_PATH=C:\path\to\cafe-capture.png
BACKEND_URL=
OCR_WORKER_TOKEN=
```

백엔드 값이 비어 있으면 OCR과 검증 로그만 찍고 API 전송은 건너뜁니다.
