import mongoose from "mongoose";

const topicNoteSchema = new mongoose.Schema(
  { topicId: { type: String, required: true }, notes: { type: String, default: "" } },
  { _id: false }
);

const aiConfigSchema = new mongoose.Schema(
  {
    enabled:                { type: Boolean, default: true },
    personaName:            { type: String,  default: "" },
    tone:                   { type: String,  enum: ["friendly", "formal", "socratic", "encouraging"], default: "friendly" },
    instructions:           { type: String,  default: "" },
    assessmentInstructions: { type: String,  default: "" },
    topicNotes:             { type: [topicNoteSchema], default: [] },
  },
  { _id: false }
);

const classroomSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    joinCode:  { type: String, required: true, unique: true, index: true },
    createdBy: { type: String, required: true },
    aiConfig:  { type: aiConfigSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export default mongoose.model("Classroom", classroomSchema);
