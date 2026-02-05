import mongoose from "mongoose";
import app from "./app.js";
import { MONGODB_URI, PORT } from "./config.js";

async function startServer() {
  if (MONGODB_URI) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log("MongoDB connected");
    } catch (error) {
      console.error("MongoDB connection error:", error.message);
    }
  } else {
    console.warn("MONGODB_URI not set. Skipping MongoDB connection.");
  }

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

startServer();
