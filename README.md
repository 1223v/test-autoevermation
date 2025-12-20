# Test-AutoEvermation

AI 기반 단위 테스트 자동 생성 VS Code 확장 프로그램입니다. Testing Automation ChatBot 서버와 연동하여 Spring Boot Java 소스 코드에 대한 JUnit 테스트를 자동으로 생성합니다.

**Publisher:** 1223v

---

## 주요 기능

- **테스트 시나리오 생성**: AI가 테스트 시나리오를 먼저 생성하여 사용자가 검토/수정 가능
- **단위 테스트 자동 생성**: 승인된 시나리오를 기반으로 테스트 코드 자동 생성
- **의존성 자동 분석**: import된 클래스를 분석하여 Mock 객체 자동 생성
- **테스트 실행**: 생성된 테스트를 바로 실행하고 결과 확인
- **Maven/Gradle 규칙 준수**: `src/main/java` → `src/test/java` 경로 자동 변환

---

## 사용법

### 사이드바 열기

VS Code 왼쪽 Activity Bar에서 **비커 아이콘**을 클릭하여 Test-AutoEvermation 사이드바를 엽니다.

---

## 사이드바 기능 상세

### 1. 연결 상태 (Connection Status)

사이드바 상단에 API 서버 연결 상태가 표시됩니다.

| 상태 | 설명 |
|------|------|
| **Connected** | 서버 연결 성공 (버전 정보 표시) |
| **Not connected** | 서버에 연결되지 않음 |
| **Not configured** | API URL이 설정되지 않음 |

---

### 2. 파일 선택 (Select Java File)

테스트를 생성할 Java 파일을 선택하는 영역입니다.

| 기능 | 설명 |
|------|------|
| **드래그 앤 드롭** | VS Code Explorer에서 Java 파일을 사이드바로 드래그하여 선택 |
| **클릭하여 찾아보기** | Drop Zone을 클릭하면 파일 선택 다이얼로그가 열림 |
| **선택된 파일 표시** | 파일 선택 후 파일명과 경로가 표시됨 |
| **X 버튼** | 선택된 파일을 제거하고 다른 파일 선택 가능 |

#### 테스트 생성 워크플로우

**Step 1: Generate Scenarios 버튼**
- 선택된 Java 파일을 분석하여 테스트 시나리오를 생성합니다
- AI가 어떤 테스트 케이스가 필요한지 먼저 제안합니다

**Step 2: Test Scenarios 편집기**
- 생성된 시나리오가 텍스트 에디터에 표시됩니다
- 시나리오를 검토하고 필요시 직접 수정할 수 있습니다
- 상태 표시: `Draft` (편집 중) / `Approved` (승인됨)

**Step 3: Approve / Regenerate 버튼**
| 버튼 | 기능 |
|------|------|
| **Approve** | 시나리오를 승인하고 Generate Test 버튼 활성화 |
| **Regenerate** | 시나리오를 다시 생성 |

**Step 4: Generate Test 버튼**
- 승인된 시나리오를 기반으로 실제 테스트 코드를 생성합니다
- 시나리오가 승인되지 않으면 비활성화

---

### 3. 테스트 실행 (Run Test)

생성된 테스트를 실행하고 결과를 확인합니다.

| 항목 | 설명 |
|------|------|
| **Test Class Name** | 실행할 테스트 클래스 이름 (예: `UserServiceTest`) |

| 버튼 | 기능 |
|------|------|
| **Run Test** | 입력한 테스트 클래스만 실행 |
| **Run All Tests** | 프로젝트의 모든 테스트 실행 |

#### 지원하는 빌드 도구
- **Maven**: `mvn test -Dtest=<TestClassName>` 실행
- **Gradle**: `gradlew test --tests "<TestClassName>"` 실행

#### 테스트 결과
- 성공 시: 초록색 체크마크와 함께 결과 표시
- 실패 시: 빨간색 X마크와 함께 오류 상세 내용 표시

---

### 4. 현재 에디터 (Current Editor)

VS Code에서 현재 열려있는 파일을 대상으로 작업합니다.

| 버튼 | 기능 | 단축키 |
|------|------|--------|
| **Generate from Current File** | 현재 에디터에 열린 Java 파일로 테스트 생성 | `Ctrl+Shift+T` |

---

### 5. 서버 설정 (Server Settings)

API 서버 연결 정보를 설정합니다.

| 항목 | 설명 | 예시 |
|------|------|------|
| **API Server URL** | 테스트 생성 서버 주소 | `http://localhost:8000/api/v1` |
| **API Key** | 인증 키 (선택사항) | `your-api-key` |

| 버튼 | 기능 |
|------|------|
| **Save Settings** | 입력한 API URL과 API Key를 저장 |
| **Test Connection** | 서버 연결 상태를 테스트하고 결과 표시 |

---

### 6. 생성 옵션 (Generation Options)

테스트 생성 시 사용할 옵션을 설정합니다.

| 옵션 | 설명 | 선택 가능 값 |
|------|------|-------------|
| **Test Framework** | 테스트 프레임워크 선택 | JUnit 5 (기본), JUnit 4 |
| **Mocking Framework** | 모킹 프레임워크 선택 | Mockito (기본), EasyMock |

| 버튼 | 기능 |
|------|------|
| **Open Full Settings** | VS Code 설정 페이지에서 추가 옵션 설정 (커버리지 목표, 엣지 케이스 포함 여부 등) |

---

## 전체 설정 항목

VS Code 설정(`Ctrl+,`)에서 `Test-AutoEvermation`을 검색하여 설정할 수 있습니다.

| 설정 | 설명 | 기본값 |
|------|------|--------|
| `javaTestGenerator.apiUrl` | API 서버 URL | `http://localhost:8000/api/v1` |
| `javaTestGenerator.apiKey` | API 인증 키 (선택) | - |
| `javaTestGenerator.testFramework` | 테스트 프레임워크 | `junit5` |
| `javaTestGenerator.mockingFramework` | 모킹 프레임워크 | `mockito` |
| `javaTestGenerator.coverageTarget` | 목표 커버리지 (%) | `80` |
| `javaTestGenerator.includeEdgeCases` | 엣지 케이스 포함 | `true` |
| `javaTestGenerator.autoSave` | 생성된 파일 자동 저장 | `true` |
| `javaTestGenerator.openAfterGeneration` | 생성 후 파일 열기 | `true` |
| `javaTestGenerator.includeDependencies` | 의존성 클래스 포함 | `true` |
| `javaTestGenerator.timeout` | 요청 타임아웃 (ms) | `120000` |

---

## 테스트 생성 및 실행 흐름

```
1. 사이드바에서 Java 파일 선택 (드래그 앤 드롭 또는 클릭)
   ↓
2. "Generate Scenarios" 버튼 클릭
   ↓
3. AI가 테스트 시나리오 생성 및 표시
   ↓
4. 시나리오 검토/수정 후 "Approve" 클릭
   ↓
5. "Generate Test" 버튼 클릭
   ↓
6. API 서버에 요청 전송 (소스 코드 + 시나리오 + 의존성 + 옵션)
   ↓
7. AI가 승인된 시나리오 기반으로 테스트 코드 생성
   ↓
8. src/test/java/... 경로에 테스트 파일 저장
   ↓
9. 생성된 테스트 파일이 에디터에 열림
   ↓
10. "Run Test" 버튼으로 테스트 실행
   ↓
11. 테스트 결과 확인 (성공/실패)
```

---

## API 서버 요구사항

이 확장 프로그램을 사용하려면 다음 엔드포인트를 구현한 API 서버가 필요합니다.

### GET /api/v1/health
서버 상태 확인

```json
Response 200:
{
  "status": "healthy",
  "version": "1.0.0",
  "features": ["test-generation", "ast-analysis"]
}
```

### POST /api/v1/generate-scenarios
테스트 시나리오 생성

```json
Headers:
  X-API-Key: <api_key> (선택)
  Content-Type: application/json

Request:
{
  "sourceFile": {
    "fileName": "UserService.java",
    "packageName": "com.example.service",
    "content": "public class UserService { ... }"
  },
  "options": {
    "testFramework": "junit5",
    "mockingFramework": "mockito",
    "coverageTarget": 80,
    "includeEdgeCases": true
  }
}

Response 200:
{
  "success": true,
  "scenarios": "1. 정상적인 사용자 조회\n2. 존재하지 않는 사용자 조회 시 예외\n..."
}
```

### POST /api/v1/generate-test
테스트 코드 생성

```json
Headers:
  X-API-Key: <api_key> (선택)
  Content-Type: application/json

Request:
{
  "sourceFile": {
    "fileName": "UserService.java",
    "packageName": "com.example.service",
    "content": "public class UserService { ... }"
  },
  "dependencies": [...],
  "options": {
    "testFramework": "junit5",
    "mockingFramework": "mockito",
    "coverageTarget": 80,
    "includeEdgeCases": true
  },
  "scenarios": "1. 정상적인 사용자 조회\n2. 존재하지 않는 사용자 조회 시 예외\n..."
}

Response 200:
{
  "success": true,
  "testFile": {
    "fileName": "UserServiceTest.java",
    "packageName": "com.example.service",
    "content": "// Generated test code...",
    "suggestedPath": "src/test/java/com/example/service/UserServiceTest.java"
  },
  "analysis": {
    "astSummary": {...},
    "mockingSuggestions": [...],
    "argumentCaptorAdvice": [...]
  }
}
```

### POST /api/v1/analyze (선택)
코드 분석

---

## 라이선스

MIT
