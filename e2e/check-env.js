/**
 * Simple script to check if environment variables are loaded correctly
 * Run with: node e2e/check-env.js
 */

const { config } = require('dotenv');

// Load .env.test.local
config({ path: '.env.test.local' });

console.log('Environment Variables Check:');
console.log('---------------------------');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing');

const missing = [];
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (missing.length > 0) {
  console.log('\n❌ Missing required variables:', missing.join(', '));
  console.log('Please check your .env.test.local file');
  process.exit(1);
} else {
  console.log('\n✅ All required environment variables are set');
}