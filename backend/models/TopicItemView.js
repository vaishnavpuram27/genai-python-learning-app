import mongoose from "mongoose";

const topicItemViewSchema = new mongoose.Schema(
  {
    userId:  { type: String, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    itemId:  { type: mongoose.Schema.Types.ObjectId, ref: "TopicItem",  required: true },
  },
  { timestamps: true }
);

topicItemViewSchema.index({ userId: 1, itemId: 1 }, { unique: true });
topicItemViewSchema.index({ classId: 1, userId: 1 });

export default mongoose.model("TopicItemView", topicItemViewSchema);
