import mongoose from "mongoose";

const classroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    joinCode: { type: String, required: true, unique: true, index: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Classroom", classroomSchema);
