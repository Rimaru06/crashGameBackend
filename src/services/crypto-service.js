import axios from 'axios';

class CryptoPriceService {
    constructor() {
        this.baseURL = process.env.CRYPTO_API_URL;
        this.cache = new Map();
        this.cacheExpiry = 10000; // 10 seconds
        
        // Mapping between crypto IDs and symbols
        this.cryptoMapping = {
            'bitcoin': 'BTC',
            'ethereum': 'ETH',
            'binancecoin': 'BNB',
            'cardano': 'ADA',
            'BTC': 'BTC',
            'ETH': 'ETH',
            'BNB': 'BNB',
            'ADA': 'ADA'
        };
    }

    async getCurrentPrices() {
        const cacheKey = 'crypto_prices';
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const response = await axios.get(
                `${this.baseURL}/simple/price?ids=bitcoin,ethereum,binancecoin,cardano&vs_currencies=usd`,
                { timeout: 5000 }
            );

            const prices = {
                BTC: response.data.bitcoin?.usd || 45000,
                ETH: response.data.ethereum?.usd || 2500,
                BNB: response.data.binancecoin?.usd || 300,
                ADA: response.data.cardano?.usd || 0.5,
                timestamp: Date.now()
            };

            this.cache.set(cacheKey, {
                data: prices,
                timestamp: Date.now()
            });

            return prices;
        } catch (error) {
            console.error('Failed to fetch crypto prices:', error.message);
            
            // Return cached data if available, otherwise default prices
            if (cached) {
                return cached.data;
            }
            
            // Fallback prices
            return {
                BTC: 45000,
                ETH: 2500,
                BNB: 300,
                ADA: 0.5,
                timestamp: Date.now()
            };
        }
    }

    async convertUsdToCrypto(usdAmount, cryptocurrency) {
        const prices = await this.getCurrentPrices();
        
        // Convert crypto ID to symbol if needed
        const cryptoSymbol = this.cryptoMapping[cryptocurrency] || cryptocurrency.toUpperCase();
        const cryptoPrice = prices[cryptoSymbol];
        
        if (!cryptoPrice) {
            throw new Error(`Price not available for ${cryptocurrency}. Available: ${Object.keys(prices).join(', ')}`);
        }

        return {
            cryptoAmount: usdAmount / cryptoPrice,
            priceAtTime: cryptoPrice,
            timestamp: prices.timestamp
        };
    }

    async convertCryptoToUsd(cryptoAmount, cryptocurrency) {
        const prices = await this.getCurrentPrices();
        
        // Convert crypto ID to symbol if needed
        const cryptoSymbol = this.cryptoMapping[cryptocurrency] || cryptocurrency.toUpperCase();
        const cryptoPrice = prices[cryptoSymbol];
        
        if (!cryptoPrice) {
            throw new Error(`Price not available for ${cryptocurrency}. Available: ${Object.keys(prices).join(', ')}`);
        }

        return {
            usdAmount: cryptoAmount * cryptoPrice,
            priceAtTime: cryptoPrice,
            timestamp: prices.timestamp
        };
    }
}

export default new CryptoPriceService();