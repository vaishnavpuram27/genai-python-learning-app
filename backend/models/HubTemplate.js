import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema({
  label: { type: String, default: "" },
  input: { type: String, default: "" },
  expectedOutput: { type: String, default: "" },
}, { _id: false });

const snapshotItemSchema = new mongoose.Schema({
  type: { type: String, enum: ["learning", "quiz", "practice"], required: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  quizSubtype: { type: String, enum: ["mcq", "short_answer", null], default: null },
  quizQuestion: { type: String, default: "" },
  quizOptions: { type: [String], default: [] },
  quizAnswer: { type: String, default: "" },
  practiceBody: { type: String, default: "" },
  practiceInstructions: { type: String, default: "" },
  practiceQuestion: { type: String, default: "" },
  practiceHints: { type: [String], default: [] },
  practiceCodeStarter: { type: String, default: "" },
  practiceModelAnswer: { type: String, default: "" },
  maxPoints: { type: Number, default: 0 },
  practiceTestMode: { type: Boolean, default: false },
  practiceTestCases: { type: [testCaseSchema], default: [] },
  // learning item fields
  body: { type: String, default: "" },
  practiceBodyCells: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const snapshotTopicSchema = new mongoose.Schema({
  title: { type: String, required: true },
  concepts: { type: [String], default: [] },
  order: { type: Number, default: 0 },
  items: { type: [snapshotItemSchema], default: [] },
}, { _id: false });

const hubTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  authorId: { type: String, required: true },
  authorName: { type: String, required: true },
  sourceClassId: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom" },
  tags: { type: [String], default: [] },
  isPublished: { type: Boolean, default: true },
  importCount: { type: Number, default: 0 },
  snapshot: {
    topics: { type: [snapshotTopicSchema], default: [] },
    topicCount: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 },
  },
}, { timestamps: true });

hubTemplateSchema.index(
  { title: "text", description: "text", tags: "text", authorName: "text" },
  { weights: { title: 10, tags: 5, authorName: 3, description: 1 } }
);

export default mongoose.model("HubTemplate", hubTemplateSchema);
