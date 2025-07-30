import { WebSocketServer } from 'ws';
import gameEngine from '../services/game-engine.js';
import crypto from 'node:crypto';

class GameWebSocket {
    constructor() {
        this.wss = null;
        this.clients = new Map(); 
    }

    initialize(server) {
        this.wss = new WebSocketServer({ 
            server,
            // Render-specific optimizations
            perMessageDeflate: false, // Disable compression for better performance on Render
            maxPayload: 1024 * 1024 // 1MB max payload
        });

        this.wss.on('connection', (ws, req) => {
            console.log('New WebSocket connection from:', req.socket.remoteAddress);

            const sessionId = crypto.randomUUID();

            this.clients.set(ws, { sessionId, connectedAt: new Date() });

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleMessage(ws, data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: 'Invalid message format' 
                    }));
                }
            });

            ws.on('close', () => {
                const clientInfo = this.clients.get(ws);
                if (clientInfo) {
                    this.clients.delete(ws);
                }
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
            const gameState = gameEngine.getCurrentGameState();
            ws.send(JSON.stringify({
                type: 'connected',
                data: {
                    sessionId,
                    gameState,
                    balance: 1000 
                }
            }));
        });

        this.startGameLoop();
        this.startCleanup();
    }

    async handleMessage(ws, message) {
        const { type, data } = message;
        const clientInfo = this.clients.get(ws);
        
        if (!clientInfo) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            return;
        }

        const { sessionId } = clientInfo;

        switch (type) {
            case 'set_player_name':
                try {
                    const { playerName } = data;
                    const session = gameEngine.getSession(sessionId, playerName);
                    
                    ws.send(JSON.stringify({
                        type: 'player_name_set',
                        data: {
                            sessionId,
                            playerName: session.playerName,
                            balance: session.balance
                        }
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
                break;

            case 'place_bet':
                try {
                    const result = await gameEngine.placeBet(
                        sessionId,
                        data.usdAmount,
                        data.cryptocurrency,
                        data.playerName
                    );
                    
                    ws.send(JSON.stringify({
                        type: 'bet_placed',
                        data: result
                    }));

                    this.broadcast({
                        type: 'player_bet',
                        data: {
                            playerName: gameEngine.getSession(sessionId).playerName,
                            usdAmount: data.usdAmount,
                            cryptocurrency: data.cryptocurrency,
                            totalBets: gameEngine.getCurrentGameState().totalBets
                        }
                    }, ws);
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
                break;

            case 'cash_out':
                try {
                    const result = await gameEngine.cashOut(sessionId);
                    
                    ws.send(JSON.stringify({
                        type: 'cash_out_success',
                        data: result
                    }));

                    this.broadcast({
                        type: 'player_cashout',
                        data: {
                            playerName: gameEngine.getSession(sessionId).playerName,
                            multiplier: result.multiplier,
                            winAmount: result.winAmount
                        }
                    }, ws);
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
                break;

            case 'get_session_info':
                try {
                    const sessionInfo = gameEngine.getSessionInfo(sessionId);
                    ws.send(JSON.stringify({
                        type: 'session_info',
                        data: sessionInfo
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
                break;

            case 'get_game_state':
                try {
                    const gameState = gameEngine.getCurrentGameState();
                    ws.send(JSON.stringify({
                        type: 'game_state',
                        data: gameState
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message
                    }));
                }
                break;
        }
    }

    broadcast(message, excludeWs = null) {
        this.wss.clients.forEach(client => {
            if (client !== excludeWs && client.readyState === 1) { 
                client.send(JSON.stringify(message));
            }
        });
    }

    startGameLoop() {
        console.log('🎮 Starting game loop...');
        
        setTimeout(async () => {
            try {
                await gameEngine.createNewRound();
                console.log('✅ First round created');
                this.broadcastGameState();
            } catch (error) {
                console.error('❌ Failed to create first round:', error);
            }
        }, 2000);

        setInterval(async () => {
            try {
                const currentState = gameEngine.gameState;
                console.log(`🎯 Game loop tick - Current state: ${currentState}`);

                if (currentState === 'waiting' || currentState === 'betting') {
                    if (!gameEngine.currentRound || currentState === 'waiting') {
                        await gameEngine.createNewRound();
                        console.log('🆕 New round created, betting phase started');
                    }
                    
                    this.broadcast({
                        type: 'game_state_update',
                        data: {
                            phase: 'waiting',
                            multiplier: 1.00,
                            timeLeft: 5,
                            currentRound: gameEngine.currentRound.roundNumber
                        }
                    });

                    // Start countdown for betting phase (5 seconds)
                    let timeLeft = 5;
                    const countdownInterval = setInterval(() => {
                        timeLeft--;
                        this.broadcast({
                            type: 'game_state_update',
                            data: {
                                phase: 'waiting',
                                multiplier: 1.00,
                                timeLeft: timeLeft,
                                currentRound: gameEngine.currentRound.roundNumber
                            }
                        });
                        
                        if (timeLeft <= 0) {
                            clearInterval(countdownInterval);
                        }
                    }, 1000);

                    // After 5 seconds, start the round
                    setTimeout(async () => {
                        if (gameEngine.gameState === 'betting') {
                            console.log('🚀 Starting round');
                            await gameEngine.startRound();
                            
                            this.broadcast({
                                type: 'game_state_update',
                                data: {
                                    phase: 'playing',
                                    multiplier: gameEngine.multiplier,
                                    timeLeft: 0,
                                    currentRound: gameEngine.currentRound.roundNumber
                                }
                            });
                        }
                    }, 5000);
                }
            } catch (error) {
                console.error('❌ Game loop error:', error);
            }
        }, 15000); // 15 second total cycle

        // Broadcast multiplier updates every 100ms during active phase
        setInterval(() => {
            if (gameEngine.gameState === 'active') {
                this.broadcast({
                    type: 'game_state_update',
                    data: {
                        phase: 'playing',
                        multiplier: gameEngine.multiplier,
                        timeLeft: 0,
                        currentRound: gameEngine.currentRound?.roundNumber || 0
                    }
                });
            }
        }, 100);

        // Handle game crash detection and broadcast
        setInterval(() => {
            if (gameEngine.gameState === 'crashed') {
                console.log(`💥 Game crashed at ${gameEngine.multiplier.toFixed(2)}x`);
                
                this.broadcast({
                    type: 'game_state_update',
                    data: {
                        phase: 'crashed',
                        multiplier: gameEngine.multiplier,
                        timeLeft: 0,
                        currentRound: gameEngine.currentRound?.roundNumber || 0
                    }
                });
                
                // Reset to waiting state after 3 seconds
                setTimeout(() => {
                    if (gameEngine.gameState === 'crashed') {
                        gameEngine.resetForNewRound();
                        console.log('🔄 Game reset to waiting state');
                    }
                }, 3000);
            }
        }, 500);
    }

    broadcastGameState() {
        const gameState = gameEngine.getCurrentGameState();
        let phase = 'waiting';
        
        switch (gameState.status) {
            case 'betting':
                phase = 'waiting';
                break;
            case 'active':
                phase = 'playing';
                break;
            case 'crashed':
                phase = 'crashed';
                break;
            default:
                phase = 'waiting';
        }
        
        this.broadcast({
            type: 'game_state_update',
            data: {
                phase: phase,
                multiplier: gameEngine.multiplier,
                timeLeft: phase === 'waiting' ? 5 : 0,
                currentRound: gameState.roundNumber
            }
        });
    }

    startCleanup() {
        // Clean up old sessions every 30 minutes
        setInterval(() => {
            gameEngine.cleanupSessions();
        }, 30 * 60 * 1000);
    }
}

export default new GameWebSocket();