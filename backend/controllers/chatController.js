import {
  getChatCompletionStream,
  explainError,
  repairJsonContent,
  validateStudentResponse,
  rateContent,
} from "../services/chatService.js";
import { getMembership } from "../services/classService.js";
import { getLessonById } from "../services/lessonService.js";
import { logInteraction, updateInteractionResponse } from "../services/aiInteractionService.js";
import { sendError, sendSuccess } from "../utils/responses.js";

export async function explainErrorHandler(req, res) {
  const { errorMessage, code } = req.body || {};
  if (!errorMessage) {
    return sendError(res, "errorMessage is required", 400, "VALIDATION_ERROR");
  }
  try {
    const explanation = await explainError(errorMessage, code || "");
    return sendSuccess(res, { explanation });
  } catch (err) {
    return sendError(res, "Could not explain error", 500, "CHAT_ERROR");
  }
}

export async function streamChat(req, res) {
  const { messages, context: clientCtx = {} } = req.body || {};

  /* ── Validate messages ── */
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendError(res, "messages array is required", 400, "VALIDATION_ERROR");
  }

  for (const msg of messages) {
    if (
      !msg.role ||
      !msg.content ||
      !["user", "assistant"].includes(msg.role)
    ) {
      return sendError(
        res,
        "Each message must have role (user|assistant) and content",
        400,
        "VALIDATION_ERROR",
      );
    }
  }

  /* ── Build server-side context ── */
  const serverCtx = {};
  const { role } = req.user;

  // Verify class membership if classId provided
  if (clientCtx.classId) {
    const membership = await getMembership(req.user.id, clientCtx.classId);
    if (!membership) {
      return sendError(res, "Forbidden", 403, "FORBIDDEN");
    }
    serverCtx.className = clientCtx.className || "";
  }

  // Fetch lesson data from DB (trusted source)
  if (clientCtx.lessonId) {
    try {
      const lesson = await getLessonById(clientCtx.lessonId);
      if (lesson) {
        serverCtx.lessonHeading = lesson.heading;
        serverCtx.lessonBody = lesson.body;
        serverCtx.lessonInstructions = lesson.instructions;
        serverCtx.lessonQuestion = lesson.question;
        serverCtx.hints = lesson.hints?.join(", ");
        serverCtx.codeStarter = lesson.codeStarter;
      }
    } catch {
      // Lesson fetch failed — proceed without lesson context
    }
  }

  // Client-provided ephemeral state (only the frontend knows these)
  if (clientCtx.studentCode) serverCtx.studentCode = clientCtx.studentCode;
  if (clientCtx.codeOutput) serverCtx.codeOutput = clientCtx.codeOutput;
  if (clientCtx.studentAnswer) serverCtx.studentAnswer = clientCtx.studentAnswer;
  if (clientCtx.topics) serverCtx.topics = clientCtx.topics;
  if (Array.isArray(clientCtx.classTopics)) serverCtx.classTopics = clientCtx.classTopics;

  /* ── Log AI interaction for students ── */
  let interactionId = null;
  if (req.user.role === "student" && clientCtx.classId) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const interaction = await logInteraction({
      userId: req.user.id,
      classId: clientCtx.classId,
      itemId: clientCtx.itemId || null,
      role: "student",
      userMessage: lastUserMsg?.content || "",
    }).catch(() => null);
    if (interaction) interactionId = interaction._id;
  }

  /* ── Stream response via SSE ── */
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const stream = await getChatCompletionStream(role, serverCtx, messages);
    let aiResponse = "";

    for await (const content of stream) {
      if (content) {
        aiResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    if (interactionId && aiResponse) {
      updateInteractionResponse(interactionId, aiResponse).catch(() => {});
    }
  } catch (err) {
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: err.message || "Chat service error" })}\n\n`,
      );
      res.end();
    } else {
      return sendError(
        res,
        "Chat service error: " + (err.message || "Unknown error"),
        500,
        "CHAT_ERROR",
      );
    }
  }
}

// 1A — Repair broken JSON fence block
export async function repairJsonHandler(req, res) {
  const { brokenContent, contentType } = req.body || {};
  if (!brokenContent || !contentType) {
    return sendError(res, "brokenContent and contentType are required", 400, "VALIDATION_ERROR");
  }
  try {
    const fixed = await repairJsonContent(brokenContent, contentType);
    return sendSuccess(res, { fixed });
  } catch {
    return sendError(res, "Could not repair JSON", 500, "REPAIR_ERROR");
  }
}

// 1B — Validate student response stays on topic
export async function validateStudentResponseHandler(req, res) {
  const { response, lessonContext } = req.body || {};
  if (!response) {
    return sendError(res, "response is required", 400, "VALIDATION_ERROR");
  }
  try {
    const result = await validateStudentResponse(response, lessonContext || "");
    return sendSuccess(res, result);
  } catch {
    return sendError(res, "Validation failed", 500, "VALIDATION_ERROR");
  }
}

// 1C — Rate AI-generated content quality
export async function rateContentHandler(req, res) {
  const { contentBlock } = req.body || {};
  if (!contentBlock) {
    return sendError(res, "contentBlock is required", 400, "VALIDATION_ERROR");
  }
  try {
    const result = await rateContent(contentBlock);
    return sendSuccess(res, result);
  } catch {
    return sendError(res, "Rating failed", 500, "RATING_ERROR");
  }
}
