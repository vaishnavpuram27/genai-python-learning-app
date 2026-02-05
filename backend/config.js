import "dotenv/config";

export const PORT = process.env.PORT || 5001;
export const MONGODB_URI = process.env.MONGODB_URI;
export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
