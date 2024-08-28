import Redis from 'ioredis';

const isDevelopment = process.env.NODE_ENV === 'development';

const redis = isDevelopment ?
    new Redis(process.env.KV_URL!)
    : new Redis(process.env.KV_URL!, {
        tls: {
            rejectUnauthorized: true
        }
    }
    );

export default redis;