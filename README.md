# JPC EnrollSmart — Complete Frontend + PWA

## Included
- Modern responsive landing page
- Student appointment booking
- Booking status checker
- Admin login and dashboard
- Schedule/date and slot-capacity management
- Booking status updates and CSV export
- Admin credential change
- React + Vite
- Bootstrap 5.3.8 local build (no CDN dependency)
- PWA manifest
- Service worker with offline app-shell caching
- localStorage persistence for demo/local use
- Mobile/tablet/desktop responsive layout

## Run
1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run:
   npm install
   npm run dev
4. Open the local address shown by Vite.

## Production build
npm run build
npm run preview

## Important
The current authentication and booking storage are frontend/localStorage only. This is appropriate for a prototype/offline demo, but NOT secure production authentication. For a real school deployment, connect the frontend to a secure backend/database and server-side authentication.

Default demo admin:
Username: admin
Password: admin123
