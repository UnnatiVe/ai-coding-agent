import { Router } from "express";

export const healthTestRouter: Router = Router();

healthTestRouter.get("/health", async (_req, res) => {
  res.json({ status: "ok", message: "Health test successful" });
});