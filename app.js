import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import connectDB from './src/config/database.js';
import gameSocket from './src/websocket/gameSocket.js';
import gameEngine from './src/services/game-engine.js';
import gameRoutes from './src/api/routes/game.route.js';

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/game', gameRoutes);

// Simple health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'Crypto Crash Game Backend',
        status: 'Running',
        websocket: 'ws://localhost:' + PORT,
        players: gameEngine.sessions.size,
        gameState: gameEngine.getCurrentGameState(),
        endpoints: {
            'Game State': 'GET /api/game/state',
            'Place Bet': 'POST /api/game/bet',
            'Cash Out': 'POST /api/game/cashout',
            'Crypto Prices': 'GET /api/game/prices'
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Something went wrong!' 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Route not found. Use WebSocket for game interactions.' 
    });
});

const server = http.createServer(app);
gameSocket.initialize(server);

server.listen(PORT, async () => {
    try {
        await connectDB();
        console.log(`🚀 Server running on port ${PORT}`);
        
        await gameEngine.initialize();
        console.log(`🎮 Game engine initialized successfully`);
        
        console.log(`🎮 Game WebSocket available at ws://localhost:${PORT}`);
        console.log(`🌐 Health check at: http://localhost:${PORT}`);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
});