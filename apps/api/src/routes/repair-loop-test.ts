import { Router } from 'express';

export const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'repair loop test' });
});
