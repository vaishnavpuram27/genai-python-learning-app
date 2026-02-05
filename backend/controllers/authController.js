import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import User from "../models/User.js";
import { sendError, sendSuccess } from "../utils/responses.js";

function createToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function signup(req, res) {
  const { name, password, role } = req.body || {};
  if (!name || !password || !role) {
    return sendError(res, "Missing required fields", 400, "VALIDATION_ERROR");
  }
  const existing = await User.findOne({ name }).lean();
  if (existing) {
    return sendError(res, "User already exists", 409, "USER_EXISTS");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, passwordHash, role });
  const token = createToken(user);
  return sendSuccess(
    res,
    { token, user: { name: user.name, role: user.role } },
    201
  );
}

export async function login(req, res) {
  const { name, password } = req.body || {};
  if (!name || !password) {
    return sendError(res, "Missing credentials", 400, "VALIDATION_ERROR");
  }
  const user = await User.findOne({ name });
  if (!user) {
    return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return sendError(res, "Invalid credentials", 401, "INVALID_CREDENTIALS");
  }
  const token = createToken(user);
  return sendSuccess(res, { token, user: { name: user.name, role: user.role } });
}

export async function me(req, res) {
  return sendSuccess(res, { user: req.user });
}
