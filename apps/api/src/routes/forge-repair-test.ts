import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Forge repair successful' });
});

export default router;