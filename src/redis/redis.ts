import Redis from 'ioredis';

const isDevelopment = process.env.NODE_ENV === 'development';

export default function connect() {
    if (isDevelopment) {
        return new Redis(process.env.KV_URL!);
    }
    return new Redis(process.env.KV_URL!, {
        tls: {
            rejectUnauthorized: true
        }
    });
}