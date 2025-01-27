# VoIP Communication Platform

A robust web-based VoIP communication platform leveraging WebRTC technology to provide secure, real-time voice and video communication. The application focuses on delivering a seamless, user-friendly communication experience with advanced signaling and connection capabilities.

## Features

- 🎥 Video calling with adaptive quality
- 🔊 High-quality audio communication
- 👥 Group calls support
- 🖥️ Screen sharing capabilities
- 💬 In-call chat messaging
- 🔐 Comprehensive authentication system
- 👤 Contact management
- 📱 Responsive design
- 📊 Call history tracking

## Tech Stack

- **Frontend**:
  - React with TypeScript
  - Tailwind CSS + shadcn/ui
  - WebRTC for real-time communication
  - Socket.io client for signaling
  - TanStack Query for data fetching
  - Wouter for routing

- **Backend**:
  - Express.js
  - Socket.io for real-time signaling
  - PostgreSQL with Drizzle ORM
  - Passport.js for authentication

## Getting Started

### Prerequisites

- Node.js 20 or higher
- PostgreSQL database
- Modern web browser with WebRTC support

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
DATABASE_URL=postgresql://user:password@host:port/database
NODE_ENV=development
```

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Push the database schema:
   ```bash
   npm run db:push
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`.

## Usage

### Authentication

1. Register a new account or log in with existing credentials
2. The system will automatically handle your online/offline status

### Making Calls

1. Navigate to the contacts page
2. Select a contact to initiate a call
3. The recipient will receive a call notification
4. Once accepted, the WebRTC connection will be established

### Screen Sharing

1. During a call, click the screen share button
2. Select the content you want to share
3. All participants will see your shared screen

### Group Calls

1. Create a room or join an existing one
2. Multiple participants can join the same call
3. The video grid automatically adjusts based on participant count

## API Documentation

### Authentication Endpoints

- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/user` - Get current user

### Contacts API

- `GET /api/contacts` - Get user's contacts
- `POST /api/contacts` - Add new contact
- `GET /api/users/search` - Search users

### Calls API

- `GET /api/calls` - Get call history

## Development Guidelines

### Code Structure

- `client/src/` - Frontend React application
- `server/` - Backend Express server
- `db/` - Database schema and configurations

### Adding New Features

1. Create necessary database migrations using Drizzle
2. Implement backend routes in `server/routes.ts`
3. Add frontend components in `client/src/components`
4. Update Socket.io events if real-time features are needed

### Best Practices

- Follow TypeScript strict mode guidelines
- Use React Query for data fetching and caching
- Implement proper error handling
- Keep WebRTC connections secure
- Use proper signaling patterns
- Follow the existing project structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
