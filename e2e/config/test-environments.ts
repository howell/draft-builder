export interface TestEnvironment {
  name: string;
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  databaseUrl: string;
  mockApiServer?: string;
}

export const environments: Record<string, TestEnvironment> = {
  local: {
    name: 'Local Development',
    baseUrl: 'http://localhost:3000',
    // Use the same variables as the Next.js app
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    // Service key is only needed for admin operations (creating test users)
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    databaseUrl: 'postgresql://postgres:postgres@localhost:54322/postgres'
  },
  ci: {
    name: 'CI Environment',
    baseUrl: 'http://localhost:3000',
    supabaseUrl: process.env.SUPABASE_URL_CI || 'http://localhost:54321',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_CI || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY_CI || '',
    databaseUrl: process.env.DATABASE_URL_CI || ''
  }
};

export function getEnvironment(): TestEnvironment {
  const env = process.env.TEST_ENV || 'local';
  const environment = environments[env];
  
  if (!environment) {
    throw new Error(`Unknown test environment: ${env}`);
  }
  
  return environment;
}