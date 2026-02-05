import mongoose from "mongoose";
import { sendError } from "../utils/responses.js";

export default function ensureDb(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return sendError(res, "Database not connected", 503, "DB_NOT_CONNECTED");
  }
  return next();
}
