import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';
import redis from '@/redis/redis';
import { after } from 'node:test';

afterAll(() => {
    redis.quit();
});
