import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import cors from "cors";
import rateLimit from "express-rate-limit";
import promBundle from "express-prom-bundle";

import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { app: "iam-service" },
  promClient: {
    collectDefaultMetrics: {},
  },
});

app.use(metricsMiddleware);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(limiter);

app.use("/users", usersRouter);
app.use("/", authRouter);

app.use(errorHandler);

export default app;
