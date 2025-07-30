import mongoose from "mongoose";

const gameRoundSchema = new mongoose.Schema({
    roundNumber: {
        type: Number,
        required: true,
    },
    seed: {
        type: String,
        required: true
    },
    hash: {
        type: String,
        required: true
    },
    crashPoint: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['waiting', 'betting', 'active', 'crashed', 'completed'],
        default: 'waiting'
    },
    startTime: Date,
    crashTime: Date,
    bettingEndTime: Date,
    totalBets: {
        type: Number,
        default: 0
    },
    totalPlayers: {
        type: Number,
        default: 0
    },
    activeBets: [{
        sessionId: {
            type: String,
            required: true
        },
        playerName: {
            type: String,
            default: 'Anonymous'
        },
        usdAmount: Number,
        cryptoAmount: Number,
        cryptocurrency: String,
        cashedOut: {
            type: Boolean,
            default: false
        },
        cashoutMultiplier: Number,
        cashoutTime: Date,
        betTime: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});


export default mongoose.model('GameRound', gameRoundSchema);