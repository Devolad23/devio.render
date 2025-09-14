const config = require('../config/config.json');

class RateLimiter {
    constructor() {
        this.requests = new Map();
    }

    isRateLimited(userId, type) {
        const now = Date.now();
        const userKey = `${userId}-${type}`;
        
        if (!this.requests.has(userKey)) {
            this.requests.set(userKey, []);
        }
        
        const userRequests = this.requests.get(userKey);
        const limits = config.rateLimits[type];
        
        if (!limits) return false;
        
        // Remove old requests outside the window
        const validRequests = userRequests.filter(
            timestamp => now - timestamp < limits.windowMs
        );
        
        this.requests.set(userKey, validRequests);
        
        // Check if user exceeds the limit
        if (validRequests.length >= limits.maxRequests) {
            return {
                limited: true,
                message: limits.message,
                resetTime: Math.ceil((validRequests[0] + limits.windowMs - now) / 1000)
            };
        }
        
        // Add current request
        validRequests.push(now);
        this.requests.set(userKey, validRequests);
        
        return { limited: false };
    }

    getRemainingRequests(userId, type) {
        const userKey = `${userId}-${type}`;
        const limits = config.rateLimits[type];
        
        if (!limits || !this.requests.has(userKey)) {
            return limits ? limits.maxRequests : 0;
        }
        
        const now = Date.now();
        const userRequests = this.requests.get(userKey);
        const validRequests = userRequests.filter(
            timestamp => now - timestamp < limits.windowMs
        );
        
        return Math.max(0, limits.maxRequests - validRequests.length);
    }

    clearUserLimits(userId) {
        const keysToDelete = [];
        for (const key of this.requests.keys()) {
            if (key.startsWith(userId + '-')) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.requests.delete(key));
    }
}

module.exports = new RateLimiter();
