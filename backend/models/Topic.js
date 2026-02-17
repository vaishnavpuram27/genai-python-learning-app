import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    concepts: { type: [String], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Topic", topicSchema);
