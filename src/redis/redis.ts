import Redis from 'ioredis';

const redis = new Redis(process.env.KV_URL!, {
    tls: {
        rejectUnauthorized: true
    }
}

);

export default redis;