import { Router } from 'express';

export const router = Router();

router.get('/repair-test', (req, res) => {
  res.json({ message: 'repair test' });
});
