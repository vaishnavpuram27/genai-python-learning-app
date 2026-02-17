import mongoose from "mongoose";

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TopicItem",
      required: true,
    },
    responseText: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["submitted", "graded"],
      default: "submitted",
    },
    gradingStatus: {
      type: String,
      enum: ["pending", "auto_graded", "manual_graded"],
      default: "pending",
    },
    isCorrect: { type: Boolean, default: null },
    score: { type: Number, default: null },
    feedback: { type: String, default: "", trim: true },
    attempts: { type: Number, default: 0 },
    submittedAt: { type: Date, default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ userId: 1, itemId: 1 }, { unique: true });
quizAttemptSchema.index({ classId: 1, userId: 1, updatedAt: -1 });

export default mongoose.model("QuizAttempt", quizAttemptSchema);
