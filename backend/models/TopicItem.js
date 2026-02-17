import mongoose from "mongoose";

const topicItemSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    type: {
      type: String,
      enum: ["learning", "quiz", "practice"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    quizSubtype: {
      type: String,
      enum: ["mcq", "short_answer", null],
      default: null,
    },
    quizQuestion: { type: String, default: "", trim: true },
    quizOptions: { type: [String], default: [] },
    quizAnswer: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("TopicItem", topicItemSchema);
