import mongoose from "mongoose";
import { sendError } from "../utils/responses.js";

export default function validateObjectId(paramName) {
  return function ensureValidObjectId(req, res, next) {
    const value = req.params[paramName];
    if (!mongoose.isValidObjectId(value)) {
      return sendError(res, "Invalid id", 400, "INVALID_ID");
    }
    return next();
  };
}
