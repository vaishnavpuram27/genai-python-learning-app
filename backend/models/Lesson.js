import mongoose from "mongoose";

const lessonSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    unit: { type: String, required: true },
    heading: { type: String, required: true },
    duration: { type: String, required: true },
    body: { type: String, required: true },
    instructions: { type: String, required: true },
    question: { type: String, required: true },
    hints: { type: [String], default: [] },
    codeStarter: { type: String, default: "" },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Lesson", lessonSchema);
