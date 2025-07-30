# Crypto Crash Game Backend

A real-time multiplayer crash game backend built with Node.js, Express, WebSocket, and MongoDB. Players bet on a multiplier that grows exponentially until it "crashes" at a provably fair random point.

## Features

- **Real-time Multiplayer**: WebSocket-based real-time gameplay with 100ms updates
- **Session-based Players**: No registration required - temporary sessions with virtual balance
- **Provably Fair Algorithm**: Cryptographically secure crash point generation
- **Cryptocurrency Integration**: BTC, ETH, BNB, and ADA price fetching via CoinGecko API
- **15-Second Game Rounds**: Fast-paced gameplay with 5-second betting window
- **Exponential Multiplier Growth**: Realistic crash game mechanics with exponential formula
- **RESTful API**: HTTP endpoints for game state, betting, and cashout operations
- **Auto-reconnection**: Robust WebSocket handling with automatic reconnection

## Technical Architecture

### Core Components

- **Game Engine** (`src/services/game-engine.js`): Core game logic and state management
- **WebSocket Handler** (`src/websocket/gameSocket.js`): Real-time communication with game loop
- **Crypto Service** (`src/services/crypto-service.js`): Multi-crypto price fetching and conversion
- **Game Round Model** (`src/api/models/game-round.model.js`): MongoDB data persistence
- **API Controllers** (`src/api/controllers/Game.controller.js`): HTTP endpoint handlers

### Game Flow

1. **Waiting Phase**: Game engine waits for next round (automatic transition)
2. **Betting Phase**: 5-second countdown window for players to place bets
3. **Active Phase**: Multiplier grows exponentially from 1.0x using `Math.pow(Math.E, 0.08 * elapsed)`
4. **Crash**: Game ends at predetermined crash point (1.01x to 120x range)
5. **Reset**: 3-second cooldown before transitioning back to waiting phase

### Provably Fair Algorithm

The crash point is generated using cryptographically secure randomness:
```javascript
const seed = crypto.randomBytes(32).toString('hex');
const seedWithRound = seed + roundNumber.toString();
const hash = crypto.createHash('sha256').update(seedWithRound).digest('hex');
const hashInt = parseInt(hash.substring(0, 13), 16);
const e = 2.718281828;
const crashPoint = Math.floor((100 * e - 100) / (Math.pow(hashInt / Math.pow(2, 52), 1/3))) / 100;
const finalCrashPoint = Math.max(1.01, Math.min(120, crashPoint));
```

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher) 
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Environment Variables
Create a `.env` file in the root directory:
```
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/cryptoCrash
PORT=8000
CRYPTO_API_URL=https://api.coingecko.com/api/v3
```

### Installation Steps
```bash
# Clone and install dependencies
npm install

# Start the server
npm start

# For development with auto-reload (requires nodemon)
npm run dev
```

## API Endpoints

### Health Check
```http
GET /
```
Returns server status, game state, and available endpoints.

### Game State
```http
GET /api/game/state
```
Returns current game state, round info, and multiplier.

### Place Bet
```http
POST /api/game/bet
Content-Type: application/json

{
  "sessionId": "unique-session-id",
  "usdAmount": 10,
  "cryptocurrency": "bitcoin",
  "playerName": "Player1"
}
```

### Cash Out
```http
POST /api/game/cashout
Content-Type: application/json

{
  "sessionId": "unique-session-id"
}
```

### Crypto Prices
```http
GET /api/game/prices
```
Returns current BTC, ETH, BNB, and ADA prices in USD.

## WebSocket Communication

Connect to: `ws://localhost:8000`

### Client Messages
```javascript
// Set player name (required first)
ws.send(JSON.stringify({
  type: 'set_player_name',
  data: { playerName: 'Player1' }
}));

// Place bet
ws.send(JSON.stringify({
  type: 'place_bet',
  data: {
    usdAmount: 10,
    cryptocurrency: 'bitcoin'
  }
}));

// Cash out
ws.send(JSON.stringify({
  type: 'cash_out',
  data: {}
}));

// Get session info
ws.send(JSON.stringify({
  type: 'get_session_info',
  data: {}
}));
```

### Server Messages
```javascript
// Connection established
{ 
  type: 'connected', 
  data: { 
    sessionId: 'uuid',
    balance: 1000,
    gameState: {...}
  }
}

// Player name set
{ 
  type: 'player_name_set', 
  data: { 
    playerName: 'Player1',
    balance: 1000
  }
}

// Game state updates (every 100ms during active phase)
{ 
  type: 'game_state_update', 
  data: { 
    phase: 'playing',
    multiplier: 1.45,
    timeLeft: 0,
    currentRound: 25
  }
}

// Bet placed confirmation
{ 
  type: 'bet_placed', 
  data: { 
    success: true,
    bet: {...},
    newBalance: 990
  }
}

// Cashout success
{ 
  type: 'cash_out_success', 
  data: { 
    multiplier: 2.45,
    winAmount: 24.50,
    newBalance: 1024.50
  }
}

// Error messages
{ 
  type: 'error', 
  message: 'Betting is not allowed at this time'
}
```

## Supported Cryptocurrencies

The system supports the following cryptocurrencies with automatic ID/symbol mapping:

| ID | Symbol | Name |
|---|---|---|
| bitcoin | BTC | Bitcoin |
| ethereum | ETH | Ethereum |
| binancecoin | BNB | Binance Coin |
| cardano | ADA | Cardano |

## Game Mechanics

### Session Management
- Each player gets a temporary session with $1000 virtual balance
- No registration or authentication required
- Sessions persist during WebSocket connection

### Betting Rules
- Minimum bet: $0.01
- Maximum bet: Limited by session balance
- Betting allowed only during 5-second betting phase
- One active bet per session per round

### Multiplier Formula
```javascript
// Exponential growth starting from 1.0x
const growthRate = 0.08;
const elapsed = (Date.now() - startTime) / 1000;
const multiplier = Math.pow(Math.E, growthRate * elapsed);
```

### Crash Point Distribution
- Range: 1.01x to 120.0x
- Higher multipliers are exponentially less frequent
- Provably fair using cryptographic hashing with seed + round number
- Average crash point: ~2.0x with long tail distribution

## Database Schema

### GameRound Model
```javascript
{
  roundNumber: { type: Number, unique: true, required: true },
  seed: String,           // Random seed for provably fair
  hash: String,           // SHA256 hash for verification  
  crashPoint: Number,     // Predetermined crash multiplier
  status: String,         // 'betting', 'active', 'crashed', 'completed'
  startTime: Date,
  crashTime: Date,
  activeBets: [{
    sessionId: String,
    playerName: String,
    usdAmount: Number,
    cryptoAmount: Number,
    cryptocurrency: String,
    cashedOut: { type: Boolean, default: false },
    cashoutMultiplier: Number,
    cashoutTime: Date
  }],
  totalBets: { type: Number, default: 0 },
  totalPlayers: { type: Number, default: 0 }
}
```

## Game Loop Implementation

The game runs on a continuous loop with the following timing:

1. **15-second total cycle**
2. **5-second betting phase** with countdown
3. **Variable active phase** until crash point reached
4. **3-second crash display** before reset
5. **Automatic state transitions**

```javascript
// Main game loop in gameSocket.js
setInterval(async () => {
  if (gameState === 'waiting' || gameState === 'betting') {
    // Start new round and betting countdown
    // Transition to active phase after 5 seconds
  }
}, 15000);

// Multiplier updates during active phase
setInterval(() => {
  if (gameState === 'active') {
    // Broadcast multiplier every 100ms
    // Check for crash condition
  }
}, 100);
```

## Development

### Project Structure
```
├── app.js                          # Main server file
├── package.json                    # Dependencies and scripts
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   │   └── Game.controller.js  # HTTP endpoint handlers
│   │   ├── models/
│   │   │   └── game-round.model.js # MongoDB schema
│   │   └── routes/
│   │       └── game.route.js       # API route definitions
│   ├── config/
│   │   └── database.js             # MongoDB connection
│   ├── services/
│   │   ├── crypto-service.js       # Price fetching service
│   │   └── game-engine.js          # Core game logic
│   └── websocket/
│       └── gameSocket.js           # WebSocket handling
```

### Key Design Decisions

1. **Session-based Architecture**: Simplified user management without registration
2. **WebSocket + REST Hybrid**: Real-time updates with HTTP fallback
3. **Provably Fair Algorithm**: Transparent and verifiable randomness
4. **Exponential Growth**: Realistic crash game mechanics
5. **MongoDB Storage**: Persistent game history and round data

## Performance Considerations

- **Memory Management**: Session data stored in-memory Map for O(1) access
- **Database Optimization**: Indexed queries on roundNumber with unique constraints
- **WebSocket Efficiency**: Optimized message payloads, 100ms multiplier updates
- **Price Caching**: 10-second cache for cryptocurrency prices with fallback
- **Error Handling**: Graceful degradation and automatic game state recovery
- **Connection Management**: Automatic WebSocket reconnection and cleanup

## Security Features

- **Input Validation**: All user inputs validated and sanitized
- **Session Isolation**: Player data isolated by UUID sessionId
- **Provably Fair**: Cryptographic verification of game outcomes using SHA256
- **Rate Limiting**: Implicit through game timing constraints (15s cycles)
- **Error Sanitization**: No sensitive data exposed in error messages
- **Balance Validation**: Server-side balance checking prevents negative amounts

## Testing

A test HTML file is provided at `/test.html` for manual testing:

```bash
# Open in browser after starting backend
open file:///path/to/project/test.html
```

Features tested:
- WebSocket connection and reconnection
- Player name setting
- Bet placement with different cryptocurrencies
- Cash out functionality
- Real-time game state updates
- Error handling and validation

## Troubleshooting

### Common Issues

1. **MongoDB Connection**: Ensure DATABASE_URL is correct and MongoDB is accessible
2. **Port Conflicts**: Default port 8000, change PORT in .env if needed
3. **Crypto API Limits**: CoinGecko API has rate limits, service includes fallback prices
4. **WebSocket Disconnections**: Client should implement reconnection logic

### Debug Logging

The server provides detailed console logging:
- 🎮 Game loop status updates
- 🚀 Game state transitions  
- 💥 Crash events with multipliers
- ❌ Error conditions and recovery
- 🔄 WebSocket connection events

## License

MIT License - Free for educational and commercial use.

---

## Frontend Integration

This backend is designed to work with the included React frontend. See `/frontend/README.md` for setup instructions.