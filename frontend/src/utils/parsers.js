export const genCellId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `cell-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function stripMachineBlocks(content) {
  return content
    .replace(/```mcq-json[\s\S]*\n```/g, "")
    .replace(/```sa-json[\s\S]*\n```/g, "")
    .replace(/```practice-json[\s\S]*\n```/g, "")
    .replace(/```lesson-plan-json[\s\S]*\n```/g, "")
    .replace(/```learning-json[\s\S]*\n```/g, "")
    .trim();
}

export function parseMcqFromMessage(content) {
  const match = content.match(/```mcq-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const raw = match[1].trim();
    const parsed = JSON.parse(raw);
    if (!parsed.question || !Array.isArray(parsed.options) || !parsed.answer) return null;
    let questionText = parsed.question
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^\s*[A-Z]\)\s*.*$/gm, "")
      .replace(/^\s*[0-9]+\.\s*.*$/gm, "")
      .trim();
    const question = parsed.codeSnippet
      ? `${questionText}\n\`\`\`python\n${parsed.codeSnippet}\n\`\`\``
      : questionText;
    const options = parsed.options.map((o) =>
      typeof o === "string" ? o.replace(/^`([\s\S]*)`$/, "$1") : String(o)
    );
    return {
      title: parsed.title || "",
      question,
      options,
      answer: parsed.answer,
      explanation: parsed.explanation || "",
    };
  } catch {
    return null;
  }
}

function normalizeSaQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.question || !raw.answer) return null;
  return {
    title: raw.title || "",
    question: raw.question,
    answer: raw.answer,
    gradingCriteria: raw.gradingCriteria || "",
  };
}

export function parseSaFromMessage(content) {
  const match = content.match(/```sa-json\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeSaQuestion).filter(Boolean)
      : [normalizeSaQuestion(parsed)].filter(Boolean);
    if (!questions.length) return null;
    return { questions };
  } catch {
    return null;
  }
}

export function parsePracticeFromMessage(content) {
  const match = content.match(/```practice-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.title || !parsed.instructions) return null;
    return {
      title: parsed.title || "",
      body: parsed.body || "",
      instructions: parsed.instructions || "",
      hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      codeStarter: parsed.codeStarter || "",
      modelAnswer: parsed.modelAnswer || "",
      testMode: !!parsed.testMode,
      testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
    };
  } catch {
    return null;
  }
}

export function parseLessonPlanFromMessage(content) {
  const match = content.match(/```lesson-plan-json\s*\n([\s\S]*)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.planTitle || !Array.isArray(parsed.topics)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseLearningFromMessage(content) {
  const match = content.match(/```learning-json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.title) return null;
    return {
      title: parsed.title || "",
      body: parsed.body || "",
      instructions: parsed.instructions || "",
      hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      codeStarter: parsed.codeStarter || "",
    };
  } catch {
    return null;
  }
}

export function parseAllLearningFromMessage(content) {
  const regex = /```learning-json\s*\n([\s\S]*?)\n```/g;
  const items = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.title) {
        items.push({
          title: parsed.title || "",
          body: parsed.body || "",
          instructions: parsed.instructions || "",
          hints: Array.isArray(parsed.hints) ? parsed.hints : [],
          codeStarter: parsed.codeStarter || "",
        });
      }
    } catch { /* skip malformed blocks */ }
  }
  return items;
}

export function countFences(content, fenceType) {
  return (content.match(new RegExp("```" + fenceType, "g")) || []).length;
}

export function hasFence(content, fenceType) {
  return typeof content === "string" && content.includes("```" + fenceType);
}

export function parseBodyToCells(body = "", hints = []) {
  const cells = [];
  const lines = (body || "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(":::callout")) {
      const contentLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) {
        contentLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      cells.push({ id: genCellId(), type: "callout", content: contentLines.join("\n") });
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      cells.push({ id: genCellId(), type: "code", content: codeLines.join("\n") });
      continue;
    }
    if (line.startsWith("### ")) {
      cells.push({ id: genCellId(), type: "h3", content: line.slice(4) });
      i++; continue;
    }
    if (line.startsWith("## ")) {
      cells.push({ id: genCellId(), type: "h2", content: line.slice(3) });
      i++; continue;
    }
    if (line.startsWith("# ")) {
      cells.push({ id: genCellId(), type: "h1", content: line.slice(2) });
      i++; continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      cells.push({ id: genCellId(), type: "bullet", content: line.slice(2) });
      i++; continue;
    }
    if (line.trim() === "") { i++; continue; }
    const textLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith(":::") &&
      !lines[i].startsWith("- ") &&
      !lines[i].startsWith("* ")
    ) {
      textLines.push(lines[i]);
      i++;
    }
    if (textLines.length > 0)
      cells.push({ id: genCellId(), type: "text", content: textLines.join("\n") });
  }
  (hints || []).forEach((h) => {
    if (h) cells.push({ id: genCellId(), type: "hint", content: h });
  });
  if (cells.length === 0)
    cells.push({ id: genCellId(), type: "text", content: "" });
  return cells;
}

export function serializeCellsToBody(cells) {
  const bodyCells = cells.filter((c) => c.type !== "hint");
  const hintCells = cells.filter((c) => c.type === "hint");
  const parts = bodyCells.map((cell) => {
    switch (cell.type) {
      case "h1": return `# ${cell.content}`;
      case "h2": return `## ${cell.content}`;
      case "h3": return `### ${cell.content}`;
      case "bullet": return `- ${cell.content}`;
      case "code": return `\`\`\`python\n${cell.content}\n\`\`\``;
      case "callout": return `:::callout\n${cell.content}\n:::`;
      default: return cell.content;
    }
  });
  return {
    body: parts.filter((p) => p.trim()).join("\n\n"),
    hints: hintCells.map((c) => c.content).filter(Boolean),
  };
}
