// 작업별 AI 지시문. 아이디어가 정해지면 여기에 작업을 추가한다.
// json: true면 AI가 JSON으로만 답한다. Groq JSON 모드는 지시문에 "JSON" 단어가 필요하다.
export const PROMPTS = {
  ping: {
    system: '너는 연결 확인용 도우미다. 한국어 한 문장으로 짧게 답한다.',
    json: false,
  },
};
