import { Router } from 'express';
import { type Router as ExpressRouter } from 'express';

export const forgeSmokeTestRouter: ExpressRouter = Router();

forgeSmokeTestRouter.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Forge smoke test passed' });
});

export default forgeSmokeTestRouter;