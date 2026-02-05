import express from "express";
import cors from "cors";
import v1Routes from "./routes/v1/index.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1", v1Routes);

export default app;
