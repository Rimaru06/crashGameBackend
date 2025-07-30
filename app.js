import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import connectDB from './src/config/database.js';
import gameSocket from './src/websocket/gameSocket.js';
import gameEngine from './src/services/game-engine.js';
import gameRoutes from './src/api/routes/game.route.js';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const app = express();

// Security middleware for production
if (NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: false, // Allow WebSocket connections
        crossOriginEmbedderPolicy: false
    }));
}

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
    message: {
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
    origin: NODE_ENV === 'production' 
        ? [
            'https://your-frontend-domain.com',
            'https://crashgamefrontend.onrender.com'
          ]
        : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/game', gameRoutes);

// Simple health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'Crypto Crash Game Backend',
        status: 'Running',
        version: process.env.npm_package_version || '1.0.0',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        websocket: {
            url: NODE_ENV === 'production' 
                ? `wss://${req.get('host')}` 
                : `ws://localhost:${PORT}`,
            status: 'Available'
        },
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

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: NODE_ENV
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