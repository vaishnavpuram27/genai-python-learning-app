import mongoose from "mongoose";
import { sendSuccess } from "../utils/responses.js";

export function health(req, res) {
  const dbState = mongoose.connection.readyState;
  return sendSuccess(res, {
    status: "ok",
    db: dbState === 1 ? "connected" : "disconnected",
  });
}
