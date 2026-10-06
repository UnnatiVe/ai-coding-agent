import { Router } from 'express';

export const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Worker check successful' });
});

export default router;