# 출처

대회 규칙 2 「참고 코드 출처 명시」 대응 문서. 코드나 자료를 참고할 때마다 즉시 추가.

| 구분 | 이름 | 사용 내용 | 링크 |
|---|---|---|---|
| 개발 도구 | Claude Code | 코드 작성 보조 | https://claude.com/claude-code |
| 서비스 내 AI | Gemini API | 앱 안의 AI 호출 (주력 후보) | https://ai.google.dev/gemini-api/docs |
| 서비스 내 AI | Groq API | 앱 안의 AI 호출 (예비, 모델 openai/gpt-oss-120b) | https://console.groq.com/docs |

| 자체 교훈 | 옛 시간표편성기 (2026-08, 관리자 개인 도구) | 코드는 가져오지 않고 교훈 3개만 재사용: 요일 생략 시 직전 요일 상속, 식별 단위 = 과목번호+학과, 조합 실패 시 원인과 대안 제시 | 작업로그 2026-08 |
| 자료 | 인천대 2026-2 종합강의시간표, 교양 최초 정원 공지 | 분반·시간·강의실·학점·정원 (교수 이름은 파싱 단계에서 제외) | 학교 공지 원본 xlsx |

| 글꼴 | Black Han Sans, Nanum Gothic, Nanum Myeongjo (Google Fonts, SIL OFL) | 도장, 본문, 통지서 제목 | https://fonts.google.com |
| 라이브러리 | Firebase JS SDK 12.6.0 (gstatic CDN) | 구글 로그인 팝업만 사용. 익명 로그인과 토큰 갱신은 REST 직접 호출 | https://firebase.google.com/docs/web/setup |
| 서비스 | Firebase Authentication, Cloud Firestore REST API | 로그인, 대표 시간표 저장 | https://firebase.google.com/docs/firestore/use-rest-api |
| 시험 도구 | playwright-core (로컬 기존 설치본) | 헤드리스 화면 시험과 스크린샷. 배포물에는 포함하지 않음 | https://playwright.dev |

| 화면 참고 | 「인천대 수강신청 시뮬레이션」 YouTube 영상 0:55 이후 장바구니 화면 (관리자 제공) | 분반별 시간·강의실 행과 담은 과목 목록이라는 구조만 참고. 화면 디자인과 학교 로고는 쓰지 않음 | https://www.youtube.com/watch?v=0koYFq3D1gQ |

| 라이브러리 | qrcodejs 1.0.0 (MIT, cdnjs) | 참여 QR 화면에서만 불러와 QR 그림 생성 | https://github.com/davidshimjs/qrcodejs |

외부 코드 복사: 없음. 시간표 계산, 점수, 랭킹 코드는 이번 대회 중 새로 작성.
