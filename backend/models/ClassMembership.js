import mongoose from "mongoose";

const classMembershipSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    userId: { type: String, required: true },
    role: { type: String, enum: ["teacher", "student"], required: true },
  },
  { timestamps: true }
);

classMembershipSchema.index({ classId: 1, userId: 1 }, { unique: true });

export default mongoose.model("ClassMembership", classMembershipSchema);
