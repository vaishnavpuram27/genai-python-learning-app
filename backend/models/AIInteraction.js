import mongoose from "mongoose";

const aiInteractionSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true },
    classId:     { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", default: null },
    itemId:      { type: mongoose.Schema.Types.ObjectId, ref: "TopicItem",  default: null },
    role:        { type: String, enum: ["teacher", "student"], required: true },
    userMessage: { type: String, default: "" },
    aiResponse:  { type: String, default: "" },
  },
  { timestamps: true }
);

aiInteractionSchema.index({ classId: 1, userId: 1 });
aiInteractionSchema.index({ classId: 1, createdAt: -1 });

export default mongoose.model("AIInteraction", aiInteractionSchema);
