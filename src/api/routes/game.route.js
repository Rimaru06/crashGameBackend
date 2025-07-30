import express from 'express';
import { getGameState, placeBet, cashOut, getCryptoPrices } from '../controllers/Game.controller.js';

const router = express.Router();

router.get('/state', getGameState);
router.post('/bet', placeBet);
router.post('/cashout', cashOut);
router.get('/prices', getCryptoPrices);

export default router;