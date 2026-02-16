const QUESTION_KEYWORDS = ["car", "cars", "how many", "quantity", "vehicle", "vehicles"];

function parsePositiveInt(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const n = Number.parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function keyLooksLikeCarsQuestion(key) {
  const k = String(key || "").toLowerCase();
  return QUESTION_KEYWORDS.some((needle) => k.includes(needle));
}

function fromKeyValueObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  for (const [key, value] of Object.entries(obj)) {
    if (!keyLooksLikeCarsQuestion(key)) continue;
    const parsed = parsePositiveInt(value);
    if (parsed) return parsed;
  }
  return null;
}

function fromQuestionsArray(arr) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const label =
      item.question ||
      item.label ||
      item.key ||
      item.name ||
      item.title ||
      "";
    if (!keyLooksLikeCarsQuestion(label)) continue;
    const answer = item.answer ?? item.value ?? item.response ?? item.text ?? null;
    const parsed = parsePositiveInt(answer);
    if (parsed) return parsed;
  }
  return null;
}

function extractFromPayloadNode(payload) {
  if (!payload || typeof payload !== "object") return null;

  const directObjects = [
    payload.responses,
    payload.bookingFieldsResponses,
    payload.metadata,
    payload.attendees?.[0]?.responses,
    payload.attendees?.[0]?.bookingFieldsResponses,
  ];
  for (const obj of directObjects) {
    const parsed = fromKeyValueObject(obj);
    if (parsed) return parsed;
  }

  const questionArrays = [
    payload.questionsAndAnswers,
    payload.customInputs,
    payload.answers,
    payload.questions,
    payload.attendees?.[0]?.questionsAndAnswers,
    payload.attendees?.[0]?.customInputs,
    payload.attendees?.[0]?.answers,
  ];
  for (const arr of questionArrays) {
    const parsed = fromQuestionsArray(arr);
    if (parsed) return parsed;
  }

  return null;
}

export function extractCarsCount(payload) {
  try {
    const candidates = [
      payload,
      payload?.booking,
      payload?.data,
      payload?.data?.booking,
      payload?.booking?.data,
      payload?.payload,
      payload?.payload?.booking,
    ];
    for (const candidate of candidates) {
      const parsed = extractFromPayloadNode(candidate);
      if (parsed) return parsed;
    }
    return 1;
  } catch {
    return 1;
  }
}
