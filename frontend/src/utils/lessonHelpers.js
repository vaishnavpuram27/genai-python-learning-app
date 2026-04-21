export const initialLesson = {
  unit: "Hello World",
  heading: "Comments",
  duration: "3 min",
  body:
    "Comments help you explain what your code does. Python ignores anything after a # on a line.",
  instructions:
    "Write a comment describing the first program you want to build.",
  question: "Explain in one sentence what your first Python project will do.",
  hints: [
    "Keep it short and clear.",
    "Mention the goal of your program.",
    "Use a # to start your comment.",
  ],
  codeStarter: "",
};

export function createTopicItemDraft(overrides = {}) {
  return {
    title: "",
    type: "learning",
    quizSubtype: "mcq",
    quizQuestion: "",
    quizOptions: [],
    quizOptionInput: "",
    quizOptionEditIndex: -1,
    quizAnswer: "",
    maxPoints: 0,
    ...overrides,
  };
}

export function upsertOption(options, index, value) {
  const next = [...(Array.isArray(options) ? options : [])];
  if (index >= 0 && index < next.length) {
    next[index] = value;
  } else {
    next.push(value);
  }
  return next.filter(Boolean);
}
