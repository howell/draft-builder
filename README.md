# Draft Builder

A powerful fantasy football draft preparation tool that helps casual players excel in auction drafts. Connect your ESPN or Sleeper leagues, get real-time player valuations, and plan your auction strategy with confidence.

## 🚀 Features

### Core Functionality
- **Multi-Platform Support**: Connect ESPN and Sleeper fantasy leagues
- **Auction Draft Analysis**: Player valuations, budget planning, and spending optimization
- **Real-time Data**: Latest ADP (Average Draft Position) and player rankings
- **Mock Draft Engine**: Practice auction scenarios with your actual league settings
- **Value Analytics**: Identify auction bargains and avoid overpaying

### User Account System ✨ NEW
- **Seamless Signup**: Create accounts with automatic data migration
- **Cloud Sync**: Access your leagues and drafts across all devices
- **Data Migration**: Automatically transfer existing data when creating an account
- **Enhanced Storage**: Improved performance with IndexedDB fallback for offline use
- **Account Dashboard**: View your leagues, drafts, and fantasy data summary

### Storage & Performance
- **Smart Storage**: Anonymous users get high-performance IndexedDB storage
- **Authenticated Storage**: Supabase cloud storage with offline fallback
- **Data Resilience**: Automatic fallback to local storage during network issues
- **Fast Loading**: Redis caching for optimal performance

## 🎯 Quick Start

### For New Users
1. Visit the app at your deployed URL
2. **Optional**: Create a free account for cloud sync and enhanced features
3. Connect your ESPN or Sleeper league
4. Start analyzing your draft and building your strategy

### For Existing Users
- Your existing data is automatically detected and can be migrated to a new account
- Continue using the app without an account - all features remain available
- Upgrade to an account anytime for cloud sync across devices

## 🛠️ Development Setup

### Prerequisites
- Node.js 20.x or later
- npm or yarn
- Redis instance (local or cloud)
- Supabase project (for user accounts)

### Environment Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd draft-builder

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start local Redis (using Docker)
docker run -d -p 6379:6379 redis:alpine

# Start Supabase locally (optional)
npm run dev:db

# Start development server
npm run dev
```

### Environment Variables
```bash
# Required for basic functionality
REDIS_URL=redis://localhost:6379

# Required for user accounts
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional for enhanced functionality
VERCEL_ANALYTICS_ID=your-vercel-analytics-id
```

## 📖 Documentation

### User Guide
- **Getting Started**: Connect your first league and explore features
- **Account Benefits**: Learn about cloud sync and data migration
- **Draft Analysis**: Use player valuations and auction tools
- **Mock Drafts**: Practice with realistic auction scenarios

### Technical Documentation
- [Project Overview](design-docs/overview/project-overview.md) - Architecture and system design
- [User Accounts Implementation](design-docs/features/user-accounts/README.md) - Detailed implementation guide
- [Deployment Guide](design-docs/assistants/deployment-guide.md) - Production deployment instructions
- [Development Setup](design-docs/assistants/development-setup.md) - Local development guide

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Next.js 15.3.3 with React 19.1.0
- **Styling**: Tailwind CSS 3.4.1
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Caching**: Redis with ioredis client
- **Authentication**: Supabase Auth with email/password
- **Storage**: Multi-adapter pattern (Supabase, IndexedDB, localStorage, memory)
- **Platform APIs**: ESPN Fantasy and Sleeper integrations

### Key Features
- **Storage Abstraction**: Seamless switching between storage backends
- **Data Migration**: Automatic migration from localStorage to cloud storage
- **Progressive Enhancement**: Works great without accounts, even better with accounts
- **Performance Optimization**: Smart caching and efficient data loading
- **Error Resilience**: Graceful fallbacks and recovery mechanisms

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Check test coverage
npm run test:coverage
```

### Test Categories
- **Unit Tests**: Component and utility function testing
- **Integration Tests**: Storage adapters and API integrations
- **E2E Tests**: Complete user workflows and migration scenarios
- **Performance Tests**: Migration speed and memory usage validation

## 🚀 Deployment

### Production Deployment (Vercel)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Set environment variables
vercel env add REDIS_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
```

### Database Setup
```bash
# Run Supabase migrations
supabase db push

# Verify database schema
supabase db diff
```

### Key Configuration
- **Supabase**: User authentication and cloud storage
- **Redis**: Application caching and performance optimization
- **Vercel**: Hosting platform with automatic deployments
- **Environment Variables**: Secure configuration management

## 📊 Performance

### Optimization Features
- **Smart Caching**: Multi-layer caching strategy with Redis
- **Bundle Optimization**: Code splitting and tree shaking
- **Image Optimization**: Automatic format conversion and lazy loading
- **Database Optimization**: Efficient queries and connection pooling
- **Storage Performance**: IndexedDB for anonymous users, Supabase for authenticated users

### Performance Targets
- **Page Load**: < 2 seconds for initial load
- **Data Migration**: < 30 seconds for typical datasets
- **API Responses**: < 500ms for cached data
- **Cache Hit Rate**: > 85% for frequently accessed data

## 🔒 Security

### Data Protection
- **Encryption**: ESPN credentials encrypted before storage
- **Row Level Security**: Supabase RLS policies enforce data isolation
- **Authentication**: Secure email/password with session management
- **Data Privacy**: User data isolated and protected

### Best Practices
- **Environment Security**: All secrets stored as environment variables
- **API Security**: Rate limiting and input validation
- **Content Security**: CSP headers and secure defaults
- **Error Handling**: Graceful error handling without data exposure

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Quality
- **TypeScript**: Strict typing for better reliability
- **ESLint**: Code linting with Next.js configuration
- **Testing**: Comprehensive test coverage required
- **Documentation**: Update docs for any new features

## 📈 Roadmap

### Current Features ✅
- Multi-platform league connection (ESPN, Sleeper)
- User account system with data migration
- Cloud storage with offline fallback
- Auction draft analysis and planning
- Comprehensive test coverage

### Planned Features
- **Yahoo Fantasy**: Support for Yahoo fantasy leagues
- **Advanced Analytics**: Historical trend analysis and predictions
- **Mobile App**: React Native mobile application
- **Team Collaboration**: Share drafts and strategies with league mates
- **Custom Rankings**: Import and use custom player rankings

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Supabase**: For providing excellent authentication and database services
- **Vercel**: For seamless deployment and hosting
- **Fantasy Sports APIs**: ESPN and Sleeper for providing fantasy data
- **Community**: All contributors and users who help improve the application

---

**Draft Builder** - Making auction drafts accessible and enjoyable for everyone! 🏈