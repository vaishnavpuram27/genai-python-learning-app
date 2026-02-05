import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import { sendError } from "../utils/responses.js";

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return sendError(res, "Unauthorized", 401, "UNAUTHORIZED");
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return sendError(res, "Invalid token", 401, "INVALID_TOKEN");
  }
}
