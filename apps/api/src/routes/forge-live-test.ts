import { Router } from 'express';

export const forgeLiveTestRouter: Router = Router();

forgeLiveTestRouter.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Forge live test passed'
  });
});
