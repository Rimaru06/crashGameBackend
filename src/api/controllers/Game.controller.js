import gameEngine from '../../services/game-engine.js';
import cryptoPriceService from '../../services/crypto-service.js';

export const getGameState = async (req, res) => {
    try {
        const gameState = gameEngine.getCurrentGameState();
        res.json({ success: true, data: gameState });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const placeBet = async (req, res) => {
    try {
        const { sessionId, usdAmount, cryptocurrency, playerName } = req.body;
        
        if (!sessionId || !usdAmount || !cryptocurrency) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: sessionId, usdAmount, cryptocurrency' 
            });
        }

        if (usdAmount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Bet amount must be positive' 
            });
        }

        const supportedCryptos = ['BTC', 'ETH'];
        if (!supportedCryptos.includes(cryptocurrency.toUpperCase())) {
            return res.status(400).json({ 
                success: false, 
                error: `Cryptocurrency must be one of: ${supportedCryptos.join(', ')}` 
            });
        }

        const result = await gameEngine.placeBet(sessionId, usdAmount, cryptocurrency.toUpperCase(), playerName);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const cashOut = async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'sessionId is required' 
            });
        }

        const result = await gameEngine.cashOut(sessionId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const getCryptoPrices = async (req, res) => {
    try {
        const prices = await cryptoPriceService.getCurrentPrices();
        res.json({ success: true, data: prices });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};