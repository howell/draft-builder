import Redis from 'ioredis';

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export default function connect() {
    if (isDevelopment) {
        console.log('[Redis] Connecting to:', process.env.KV_URL, 'in', process.env.NODE_ENV, 'mode');
        return new Redis(process.env.KV_URL!, {
            connectTimeout: 5000,       // 5 second connection timeout
            commandTimeout: 5000,       // 5 second command timeout
            maxRetriesPerRequest: 2,    // Limit retries
            lazyConnect: false         // Connect immediately to catch connection errors early
        });
    }
    return new Redis(process.env.KV_URL!, {
        tls: {
            rejectUnauthorized: true
        }
    });
}