import Redis from 'ioredis';

console.log("Connecting to redis url:", process.env.KV_URL);
const redis = new Redis(process.env.KV_URL!);
console.log("Redis status:", redis.status)

export default redis;