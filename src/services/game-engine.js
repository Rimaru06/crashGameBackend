import crypto from 'node:crypto';
import GameRound from '../api/models/game-round.model.js';
import cryptoPriceService from './crypto-service.js';

class GameEngineService {
    constructor() {
        this.currentRound = null;
        this.roundCounter = 1;
        this.multiplier = 1.0;
        this.gameState = 'waiting';
        this.roundInterval = null;
        this.multiplierInterval = null;
        this.startTime = null;
        this.initialized = false;
        this.sessions = new Map(); 
    }

    getSession(sessionId, playerName = null) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                sessionId,
                playerName: playerName || `Player_${sessionId.slice(-6)}`,
                balance: 1000,
                totalBets: 0,
                totalWins: 0,
                totalWinnings: 0,
                currentBet: null,
                joinedAt: new Date()
            });
        }
        
        if (playerName && this.sessions.has(sessionId)) {
            this.sessions.get(sessionId).playerName = playerName;
        }
        
        return this.sessions.get(sessionId);
    }

    async initialize() {
        if (this.initialized) return;

        try {
            const latestRound = await GameRound.findOne().sort({ roundNumber: -1 });
            
            if (latestRound) {
                this.roundCounter = latestRound.roundNumber + 1;
                

                const activeRound = await GameRound.findOne({ 
                    status: { $in: ['betting', 'active'] } 
                });
                
                if (activeRound) {
                    activeRound.status = 'completed';
                    await activeRound.save();
                }
            } else {
                this.roundCounter = 1;
            }
            
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize game engine:', error);
            this.roundCounter = 1;
            this.initialized = true;
        }
    }

    generateProvablyFairCrash() {

        const seed = crypto.randomBytes(32).toString('hex');
        
        const seedWithRound = seed + this.roundCounter.toString();
        const hash = crypto.createHash('sha256').update(seedWithRound).digest('hex');
        

        const hashInt = parseInt(hash.substring(0, 13), 16); 
        
        const e = 2.718281828;
        const crashPoint = Math.floor((100 * e - 100) / (Math.pow(hashInt / Math.pow(2, 52), 1/3))) / 100;
        

        const finalCrashPoint = Math.max(1.01, Math.min(120, crashPoint));

        return {
            seed,
            hash,
            crashPoint: Math.round(finalCrashPoint * 100) / 100,
            seedWithRound 
        };
    }

    async createNewRound() {
        await this.initialize();

        const { seed, hash, crashPoint } = this.generateProvablyFairCrash();
        
        try {
            this.currentRound = new GameRound({
                roundNumber: this.roundCounter++,
                seed,
                hash,
                crashPoint,
                status: 'betting'
            });

            this.gameState = 'betting';
            
            await this.currentRound.save();
            return this.currentRound;
        } catch (error) {
            if (error.code === 11000) {
                return await this.createNewRound();
            }
            throw error;
        }
    }

    async placeBet(sessionId, usdAmount, cryptocurrency, playerName = null) {
        await this.initialize();

        if (this.gameState !== 'betting' && this.gameState !== 'waiting') {
            throw new Error(`Betting is not allowed at this time. Current state: ${this.gameState}`);
        }

        if (!this.currentRound) {
            await this.createNewRound();
        }

        
        const session = this.getSession(sessionId, playerName);

      
        if (session.currentBet && session.currentBet.roundId === this.currentRound._id.toString()) {
            throw new Error('You already have a bet placed this round');
        }

       
        if (session.balance < usdAmount) {
            throw new Error(`Insufficient balance. You have $${session.balance.toFixed(2)}, need $${usdAmount}`);
        }

    
        const conversion = await cryptoPriceService.convertUsdToCrypto(usdAmount, cryptocurrency);

 
        this.currentRound.activeBets.push({
            sessionId,
            playerName: session.playerName,
            usdAmount,
            cryptoAmount: conversion.cryptoAmount,
            cryptocurrency,
            cashedOut: false
        });

     
        this.currentRound.totalBets += usdAmount;
        this.currentRound.totalPlayers = new Set(this.currentRound.activeBets.map(bet => bet.sessionId)).size;
        await this.currentRound.save();

        session.balance -= usdAmount;
        session.totalBets += 1;
        session.currentBet = {
            roundId: this.currentRound._id.toString(),
            usdAmount,
            cryptoAmount: conversion.cryptoAmount,
            cryptocurrency,
            priceAtBet: conversion.priceAtTime,
            isActive: true
        };

        return { 
            success: true,
            bet: session.currentBet,
            conversion,
            newBalance: session.balance
        };
    }

    async cashOut(sessionId) {
        if (this.gameState !== 'active') {
            throw new Error('Cannot cash out at this time');
        }

        const session = this.getSession(sessionId);
        
        if (!session.currentBet || !session.currentBet.isActive) {
            throw new Error('No active bet found');
        }

        const betIndex = this.currentRound.activeBets.findIndex(
            bet => bet.sessionId === sessionId && !bet.cashedOut
        );

        if (betIndex === -1) {
            throw new Error('No active bet found in current round');
        }

        const bet = this.currentRound.activeBets[betIndex];
        const winAmount = bet.cryptoAmount * this.multiplier;

        const conversion = await cryptoPriceService.convertCryptoToUsd(winAmount, bet.cryptocurrency);
        const profit = conversion.usdAmount - bet.usdAmount;

        
        this.currentRound.activeBets[betIndex].cashedOut = true;
        this.currentRound.activeBets[betIndex].cashoutMultiplier = this.multiplier;
        this.currentRound.activeBets[betIndex].cashoutTime = new Date();
        await this.currentRound.save();

        session.balance += conversion.usdAmount;
        session.totalWins += 1;
        session.totalWinnings += profit;
        session.currentBet.isActive = false;

        return { 
            success: true,
            multiplier: this.multiplier, 
            winAmount: conversion.usdAmount,
            profit,
            newBalance: session.balance
        };
    }

    async startRound() {
        if (!this.currentRound) {
            await this.createNewRound();
        }

        this.currentRound.status = 'active';
        this.currentRound.startTime = new Date();
        this.gameState = 'active';
        this.multiplier = 1.0;
        this.startTime = Date.now();

        await this.currentRound.save();

        this.multiplierInterval = setInterval(() => {
            this.updateMultiplier();
        }, 100);
    }

    updateMultiplier() {
        const elapsed = (Date.now() - this.startTime) / 1000;

        const growthRate = 0.08; 
        this.multiplier = Math.pow(Math.E, growthRate * elapsed);

        if (this.multiplier >= this.currentRound.crashPoint) {
            this.crashGame();
        }
    }

    async crashGame() {
        clearInterval(this.multiplierInterval);
        
        this.gameState = 'crashed';
        this.currentRound.status = 'crashed';
        this.currentRound.crashTime = new Date();
        
        await this.currentRound.save();
        
     
        this.processUncastedBets();
        
        setTimeout(() => {
            this.resetForNewRound();
        }, 2000);
    }

    processUncastedBets() {
        if (!this.currentRound || !this.currentRound.activeBets) {
            return;
        }

        const uncastedBets = this.currentRound.activeBets.filter(bet => !bet.cashedOut);
        
        for (const bet of uncastedBets) {
            const session = this.sessions.get(bet.sessionId);
            if (session && session.currentBet) {
                session.currentBet.isActive = false;
            }
        }
    }

    resetForNewRound() {
        this.currentRound = null;
        this.multiplier = 1.0;
        this.gameState = 'waiting';
    }

    getCurrentGameState() {
        return {
            roundNumber: this.currentRound?.roundNumber || 0,
            status: this.gameState,
            multiplier: this.multiplier,
            crashPoint: this.gameState === 'crashed' ? this.currentRound?.crashPoint : null,
            totalBets: this.currentRound?.totalBets || 0,
            totalPlayers: this.currentRound?.totalPlayers || 0,
            activeBets: this.currentRound?.activeBets || [],
            onlinePlayers: this.sessions.size
        };
    }

    getSessionInfo(sessionId) {
        return this.getSession(sessionId);
    }

    cleanupSessions() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.joinedAt < oneHourAgo && (!session.currentBet || !session.currentBet.isActive)) {
                this.sessions.delete(sessionId);
            }
        }
    }
}

export default new GameEngineService();
