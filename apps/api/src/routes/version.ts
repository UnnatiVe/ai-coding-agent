import { Router } from "express";

export const versionRouter: Router = Router();

versionRouter.get("/version", (_req, res) => {
  res.json({ version: "1.0.0" });
});
