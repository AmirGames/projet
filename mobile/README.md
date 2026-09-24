# Zupone Mobile Apps

Three React Native apps for the Zupone platform:
- **Merchant App** - Manage orders and catalogs
- **Customer App** - Browse and order from stores
- **Delivery App** - Accept and manage deliveries

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: React Navigation (stack + bottom tabs)
- **State Management**: Zustand
- **API**: Axios + Socket.IO for real-time updates
- **Language**: TypeScript
- **Shared Library**: Monorepo workspace

## Project Structure

```
mobile/
├── shared/              # Shared utilities, API clients, types
│   └── src/
│       ├── api/         # API services
│       ├── socket/      # Socket.IO management
│       ├── types/       # TypeScript interfaces
│       └── constants/   # API endpoints
├── apps/
│   ├── merchant/        # Merchant app (Priority 1)
│   ├── customer/        # Customer app (Priority 2)
│   └── delivery/        # Delivery app (Priority 3)
└── package.json         # Workspace root
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- An Android/iOS device or emulator

### Setup

1. **Install dependencies**:
```bash
cd mobile
npm install
```

2. **Configure API URL** (per app):
```bash
cd apps/merchant
cp .env.example .env.local
# Edit .env.local with your API URL
```

3. **Start the app**:
```bash
# Merchant app
npm run start:merchant

# Customer app
npm run start:customer

# Delivery app
npm run start:delivery
```

4. **Connect your device**:
   - Scan the QR code with Expo Go app
   - Or press `a` for Android, `i` for iOS

## Features Implemented

### Merchant App ✅
- [x] Authentication (login with JWT)
- [x] Orders list with filtering
- [x] Order details view
- [x] Status management (pending → accepted → preparing → ready → delivering → delivered)
- [x] Profile management
- [x] Real-time notifications via Socket.IO
- [x] Responsive UI

### Customer App 🚧
- [ ] Browse stores by proximity
- [ ] View store catalogs
- [ ] Search functionality
- [ ] Shopping cart
- [ ] Order checkout
- [ ] Order tracking with map

### Delivery App 🚧
- [ ] Login and document verification
- [ ] Available orders list
- [ ] Accept/refuse orders
- [ ] GPS tracking
- [ ] Real-time delivery updates

## API Integration

The apps connect to your Zupone backend at:
- Default: `http://localhost:3001`
- Configure in `.env.local` per app

**Note**: Update the IP address when using a real device:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.100:3001
```

## Development Tips

### Hot Reload
Changes to code are automatically reflected in the app.

### Debugging
- Use `console.log()` - output appears in terminal
- React Native Debugger: `https://github.com/jhen0409/react-native-debugger`

### Testing API Calls
- The shared `@zupone/shared` library provides pre-configured API clients
- All requests include auth tokens automatically
- 401 responses trigger automatic token refresh

## Next Steps

1. **Week 1**: Complete Merchant app (done)
2. **Week 1**: Build Customer app
3. **Week 2**: Build Delivery app
4. **Week 2**: Full integration testing
5. **Post-deadline**: Migrate to Kotlin if performance issues

## Troubleshooting

### "Cannot find module '@zupone/shared'"
```bash
cd mobile && npm install
```

### Expo connection issues
```bash
# Clear cache
expo start --clear

# Use tunneling instead of LAN
expo start --tunnel
```

### Port already in use
```bash
expo start --port 8081
```

## License

Private - All rights reserved
