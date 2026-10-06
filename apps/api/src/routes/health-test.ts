import { Router } from 'express';

export const router = Router();

router.get('/health-test', (req, res) => {
  res.json({ status: 'ok' });
});
