# SALT — Savannah Area Local Tours

**iOS App + Cloud Backend** for the independent, member-supported nonprofit that advocates for and supports downtown Savannah tourism businesses.

**Tagline:** Connect • Network • Grow

---

## Features

### iOS App
- **Secure Authentication** — Firebase Auth (email/password) + multi-step Membership Application
- **Community Feed** — Social posts, announcements, likes
- **Member Directory** — Searchable directory with categories & profiles
- **Direct Messaging** — 1-on-1 real-time chat between members
- **Events** — Calendar, RSVP, member pricing
- **Job Board** — Free postings for members, Quick Apply
- **Resources** — Licenses/permits, crime & safety, legislative updates
- **Profile & Membership** — Status, tier, dues renewal (Stripe-ready)
- **Board Admin View** — Approve / reject membership applications (board members only)

### Cloud Functions
- Welcome email + push when membership is approved
- Push to board on new applications
- Unread counts + push on new chat messages
- Stripe PaymentIntent creation + webhook for dues

---

## Design

- Minimal, professional UI
- Brand colors: **Purple** (primary) • **Red** (accent) • **Gold** (highlights)
- System light/dark mode support

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| iOS | SwiftUI, iOS 17+, MVVM |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Push | Firebase Cloud Messaging |
| Backend | Cloud Functions (TypeScript, Node 20) |
| Payments | Stripe (PaymentIntents + webhook) |
| Email | Nodemailer (Gmail / swap for SendGrid etc.) |

---

## Project Structure

```
SALT/
├── SALT/                          # iOS source
│   ├── App/
│   ├── Models/
│   ├── Views/
│   │   ├── Auth/
│   │   ├── Home/
│   │   ├── Directory/
│   │   ├── Events/
│   │   ├── Jobs/
│   │   ├── Resources/
│   │   ├── Profile/
│   │   ├── Messaging/             # Conversations + Chat
│   │   └── Board/                 # Admin approval
│   ├── Services/
│   ├── Firebase/                  # FirebaseManager, MessagingService, etc.
│   ├── Utilities/
│   └── Assets.xcassets
├── functions/                     # Cloud Functions
│   ├── src/index.ts
│   ├── package.json
│   └── README.md
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── SALT.xcodeproj
```

---

## Getting Started – iOS

1. Open `SALT.xcodeproj` in Xcode 15+
2. Add Firebase packages (SPM):
   - `https://github.com/firebase/firebase-ios-sdk`
   - Products: Auth, Firestore, Storage, Messaging, Analytics
3. Add your `GoogleService-Info.plist`
4. Drop in the Firebase / Messaging / Board Swift files from the scaffolding
5. Build & Run

**Demo (mock mode still works until Firebase is wired):**
```
Email:    demo@salt.savannah
Password: salt2025
```

---

## Getting Started – Cloud Functions

```bash
cd functions
npm install
firebase login
firebase use --add          # select your project

# Set secrets
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS

npm run build
firebase deploy --only functions,firestore
```

See `functions/README.md` for full details (Stripe webhook setup, email provider, etc.).

---

## Security Rules

Production-ready rules are in `firestore.rules`:
- Members can read directory & resources
- Only active members can post jobs / feed
- Only board members can approve applications & manage events
- Conversations restricted to participants
- Payments readable by owner or board

---

## Next / Optional

- [ ] Stripe PaymentSheet UI on iOS
- [ ] Cloud Function for welcome email via SendGrid
- [ ] Deep-link handling for push notifications
- [ ] App Icon (1024×1024) + App Store screenshots
- [ ] Privacy Policy & Terms
- [ ] Google Jobs integration

---

Built for the Savannah tourism community.  
© 2025–2026 SALT — Savannah Area Local Tours
