import mongoose from "mongoose";

const lessonProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },
    lastCode: { type: String, default: "" },
    lastAnswer: { type: String, default: "" },
    attempts: { type: Number, default: 0 },
    lastRunAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

lessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

export default mongoose.model("LessonProgress", lessonProgressSchema);
