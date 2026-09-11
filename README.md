# Naseem Health Elevate — Dr. Naseem Ahmed Khan

A modern, full-featured healthcare website for **Dr. Naseem Ahmed Khan's clinic**, designed to provide patients with online appointment booking, video consultation, home visits, appointment tracking, healthcare information, products, and an AI-powered assistant.

Built with **TanStack Start, React, TypeScript, Tailwind CSS v4, and Supabase**.

---

## Overview

**Naseem Health Elevate** is a complete clinic management and patient-facing healthcare platform.

Patients can:

- Browse clinic services
- Book appointments online
- Book as a guest without creating an account
- Select available dates and time slots
- Receive a unique Appointment ID
- Check appointment status
- Request a Home Visit
- Start a Video Consultation
- Browse healthcare products
- Contact the clinic through WhatsApp
- Watch educational healthcare videos
- Use the floating **Naseem AI Assistant**

Doctors/Admins can:

- Manage appointments
- Confirm, cancel, and complete appointments
- Manage clinic availability
- Manage services
- Manage products
- Manage videos
- Manage video consultation sessions
- Monitor AI chatbot usage

---

## Features

### Patient & Guest Booking

The booking system supports both authenticated patients and guest users.

Features include:

- Service selection
- Date selection
- Real-time availability
- Available time slots
- Guest booking
- Patient account booking
- Phone and/or email contact
- Booking notes
- Double-booking prevention
- Unique Appointment ID generation
- Appointment confirmation
- Appointment status tracking

### Appointment Status

Every appointment receives a unique Appointment ID.

Patients can use their appointment information to check the current status of their booking.

Supported statuses:

- `Pending`
- `Confirmed`
- `Completed`
- `Cancelled`

---

## Home Visit

The clinic supports a dedicated **Home Visit** service.

Unlike normal services, Home Visit does not use a fixed consultation price.

The displayed fee is:

> **Flexible – based on time and distance**

The service is available through the regular appointment booking flow while remaining separate from Video Consultation.

---

## Video Consultation

Video Consultation is handled separately from regular appointment services.

Features include:

- Dedicated Video Consultation flow
- Patient video consultation link
- Doctor/admin session management
- **Google Meet** integration (automatic meeting creation)
- Video session creation
- Patient join link
- Admin **Copy Link** functionality
- Notification support for video consultation links

### Google Meet meetings

Each video consultation appointment gets **one** Google Meet meeting. When an
admin starts a session, the server creates the meeting through the Google Meet
REST API and stores the join URL (`meet_url`) against the appointment's
`video_sessions` row. The same URL is reused for the patient's and the
doctor's **Join Video Call** buttons, so both users land in the same call and a
page refresh never creates a second meeting.

Google Meet handles the camera, microphone, video, captions and recording UI —
no iframe is embedded. Clicking **Join Video Call** opens `meet.google.com` in
a new browser tab.

#### Google Meet API — manual setup (required once)

The Google Meet REST API requires **OAuth 2.0** and a **Google Workspace
account** (personal `@gmail.com` accounts cannot be used to create meeting
spaces). Follow these steps:

1. **Google Cloud project** — go to the [Google Cloud Console](https://console.cloud.google.com)
   and create a project (or reuse an existing one).
2. **Enable the Google Meet API** — Console → APIs & Services → Library →
   search **"Google Meet API"** → Enable.
3. **OAuth consent screen** — Console → APIs & Services → OAuth consent screen.
   Set the app as **External** and add the Workspace account (`doctor@clinic…`)
   as a test user.
4. **OAuth Client ID** — Console → APIs & Services → Credentials → Create
   credentials → **OAuth client ID** → **Web application**.
   - Authorized JavaScript origins: `https://your-domain.com` (and
     `http://localhost:5173` for local dev).
   - Authorized redirect URIs: `http://localhost:5173/oauth-code` (loopback
     trick used only for the one-time consent).
   - Copy the **Client ID** and **Client secret**.
5. **One-time consent (offline)** — the refresh token must be obtained from a
   browser once. Open the consent URL (scope
   `https://www.googleapis.com/auth/meetings.space.created`):

   ```
   https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=<CLIENT_ID>
     &redirect_uri=http://localhost:5173/oauth-code
     &response_type=code
     &scope=https://www.googleapis.com/auth/meetings.space.created
     &access_type=offline
     &prompt=consent
   ```

   Approve the prompt as the Workspace account. The redirect lands on
   `http://localhost:5173/oauth-code?code=<AUTH_CODE>&scope=…`. Copy
   `<AUTH_CODE>`.

6. **Exchange the code for a refresh token**:

   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "code=<AUTH_CODE>" \
     -d "client_id=<CLIENT_ID>" \
     -d "client_secret=<CLIENT_SECRET>" \
     -d "redirect_uri=http://localhost:5173/oauth-code" \
     -d "grant_type=authorization_code"
   ```

   The JSON response contains `refresh_token` (only returned when
   `access_type=offline`). Store it in `GOOGLE_MEET_REFRESH_TOKEN`.

7. **Add the three server secrets** to your production environment
   (Cloudflare: secret bindings; Node: `.env`):

   ```env
   GOOGLE_MEET_CLIENT_ID=...
   GOOGLE_MEET_CLIENT_SECRET=...
   GOOGLE_MEET_REFRESH_TOKEN=...
   ```

These three values are read on the server only and are used to mint short-lived
access tokens for `POST https://meet.googleapis.com/v2/spaces`. They are never
exposed as `VITE_*` variables.

> If the variables are missing, starting a video session still creates the
> session row, but the admin dialog shows a clear **Google Meet is not
> configured** error and lets you retry after fixing the configuration.

Video Consultation is intentionally **not shown as a normal service inside the regular Book Appointment dropdown**.

---

## Doctor / Admin Dashboard

Authorized doctor and admin users can access the administration panel.

### Dashboard

Includes:

- Appointment statistics
- Today's appointments
- Appointment status information
- AI chatbot usage statistics

### Appointment Management

Admins can:

- View appointments
- Filter appointments
- Confirm appointments
- Cancel appointments
- Complete appointments
- View patient information

### Availability Management

Doctors can configure weekly clinic availability, including:

- Day of week
- Start time
- End time
- Availability status

Current clinic availability can be configured from the admin panel.

### Services Management

Admins can:

- Add services
- Edit services
- Delete services
- Set descriptions
- Set duration
- Set pricing
- Activate/deactivate services

Special handling is included for:

- Home Visit
- Video Consultation

### Products Management

Admins can:

- Add products
- Edit products
- Delete products
- Add product images
- Set prices
- Manage stock availability

### Videos Management

Admins can:

- Add videos
- Edit videos
- Delete videos
- Add YouTube URLs
- Add thumbnails
- Add descriptions
- Publish/unpublish videos

---

## AI Chatbot — Naseem AI Assistant

The website includes a floating **Naseem AI Assistant**.

The chatbot uses a TanStack Start server function to securely communicate with Google's Gemini API.

### Technology

- Google Gemini
- Gemini 2.5 Flash
- TanStack Start server functions
- Supabase usage tracking

The Gemini API key remains server-side and is never exposed to the browser.

### Usage Limits

The application supports server-side chatbot rate limiting.

Default limits:

| User Type      | Hourly Limit |  Daily Limit |
| -------------- | -----------: | -----------: |
| Guest          |  10 messages |  50 messages |
| Logged-in User |  20 messages | 100 messages |

Chatbot requests are recorded in the `chat_usage` table.

The admin dashboard provides usage information including:

- Today's usage
- Last 7 days
- Last 30 days
- All-time usage
- Daily breakdown
- Recent activity

---

## Notifications

The application supports server-side appointment notifications.

Supported channels:

| Channel  | Provider |
| -------- | -------- |
| Email    | Resend   |
| SMS      | Twilio   |
| WhatsApp | Twilio   |

Notifications can be used for:

- Appointment ID
- Appointment updates
- Video consultation links
- Appointment status changes

Phone-based notifications can prefer WhatsApp when WhatsApp configuration is available and fall back to SMS.

Notification providers are optional. The booking system can still create appointments when a notification provider has not been configured.

---

## Authentication & Authorization

Authentication is handled through **Supabase Auth**.

Supported functionality includes:

- Patient registration
- Patient login
- Logout
- Email confirmation
- Role-based access

Supported roles:

- `patient`
- `doctor`
- `admin`

Administrative functionality is protected through role checks.

Server-side operations use a dedicated Supabase service-role client where required.

---

## Security

The application uses:

- Supabase Row Level Security
- Server-side authorization
- Server-only environment variables
- Supabase authentication
- Role-based access control
- Server-side booking validation
- Server-side chatbot rate limiting

### Important

Never expose these values through `VITE_` variables:

```env
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
GEMINI_API_KEY
GOOGLE_MEET_CLIENT_SECRET
GOOGLE_MEET_REFRESH_TOKEN
```

The Supabase service-role key provides elevated database access and must be treated like a password.

---

## Database

The project uses **Supabase PostgreSQL**.

Main tables/features include:

- `profiles`
- `appointments`
- `services`
- `availability`
- `products`
- `videos`
- `video_sessions`
- `chat_usage`
- Orders and order items

Database migrations and SQL files are available inside:

```text
supabase/
```

Important migrations include functionality for:

- Appointment flow
- Guest booking
- Home Visit
- Video sessions
- RLS policies
- Chatbot usage tracking
- Seed services/content

---

## Tech Stack

### Frontend

- React
- TypeScript
- TanStack Start
- TanStack Router
- React Query
- Tailwind CSS v4
- Lucide React

### Backend

- TanStack Start Server Functions
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage

### Integrations

- Google Meet — Video Consultation
- Google Gemini — AI Assistant
- Resend — Email notifications
- Twilio — SMS/WhatsApp notifications
- WhatsApp — Clinic communication
- Google Maps — Clinic location

### Deployment

The application is designed to support deployment using:

- Cloudflare Workers / Pages
- Other compatible production hosting platforms

---

## Project Structure

A simplified project structure:

```text
naseem-health-elevate/
│
├── src/
│   ├── components/
│   │   ├── chat/
│   │   └── site/
│   │
│   ├── lib/
│   │   ├── server/
│   │   ├── actions.functions.ts
│   │   ├── bookings.ts
│   │   └── chat.functions.ts
│   │
│   ├── routes/
│   │   ├── admin/
│   │   └── ...
│   │
│   └── ...
│
├── supabase/
│   ├── appointment-flow.sql
│   ├── home-visit-service.sql
│   ├── fix-video-sessions.sql
│   ├── rls-policies.sql
│   ├── chat-usage.sql
│   └── ...
│
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Getting Started

### Prerequisites

Install:

- Node.js 18+
- npm

Check your versions:

```bash
node --version
npm --version
```

---

## Installation

Clone the repository:

```bash
git clone https://github.com/saadkhan-dev/Naseem-health-elevate.git
```

Enter the project directory:

```bash
cd Naseem-health-elevate
```

Install dependencies:

```bash
npm install
```

---

## Environment Variables

Create a `.env` file in the project root.

### Supabase

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### AI Chatbot

```env
GEMINI_API_KEY=your_gemini_api_key
CHATBOT_MODEL=gemini-2.5-flash
```

### Email Notifications

```env
RESEND_API_KEY=your_resend_api_key
NOTIFICATION_FROM_EMAIL=your_verified_sender
```

### Twilio SMS

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_SMS_FROM=your_twilio_number
```

### Twilio WhatsApp

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+your_number
```

### Public Website URL

For production notification links and video consultation links:

```env
SITE_URL=https://your-domain.com
```

### Google Meet Video Consultation

Required for automatic Google Meet meeting creation (see
[Google Meet meetings](#google-meet-meetings)); all three values are server-only:

```env
GOOGLE_MEET_CLIENT_ID=your_oauth_client_id
GOOGLE_MEET_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_MEET_REFRESH_TOKEN=your_offline_refresh_token
```

If these are not configured, video sessions can still be created but no meeting
is generated and the admin panel shows a configuration error.

**Do not commit your real `.env` file or secret values to GitHub.**

---

## Run the Project Locally

Start the development server:

```bash
npm run dev
```

The terminal will display the local development URL.

Open that URL in your browser.

---

## Database Setup

The project contains SQL migrations inside:

```text
supabase/
```

Run the required SQL migrations through:

**Supabase Dashboard → SQL Editor**

The migrations handle the application's database structure and additional functionality.

Before production deployment, make sure:

- Required tables exist
- Required migrations have been applied
- RLS policies are enabled
- Doctor/admin accounts are configured
- Required environment variables are configured

---

## Create a Doctor/Admin Account

The application uses role-based authorization.

A newly registered account normally starts as:

```text
patient
```

The appropriate profile role can be promoted through the Supabase database by an authorized administrator.

Supported roles:

```text
patient
doctor
admin
```

The admin panel is available at:

```text
/admin
```

---

## Build for Production

Create a production build:

```bash
npm run build
```

Before deployment, verify that the production build completes successfully.

---

## Deployment

For Cloudflare deployment, configure the required environment variables/secrets and deploy using the project's configured Cloudflare setup.

Example:

```bash
npx wrangler deploy
```

For production, make sure all server-only secrets are configured through the hosting provider's secure environment/secret management system.

---

## Important Production Checklist

Before making the website publicly available:

- [ ] Configure Supabase production project
- [ ] Apply all required SQL migrations
- [ ] Enable and verify RLS policies
- [ ] Configure authentication
- [ ] Create the doctor/admin account
- [ ] Configure clinic availability
- [ ] Add clinic services
- [ ] Configure Home Visit service
- [ ] Add products
- [ ] Add educational videos
- [ ] Configure Video Consultation (Google Meet)
- [ ] Configure Gemini API
- [ ] Configure appointment notifications if required
- [ ] Configure `SITE_URL`
- [ ] Verify appointment ID generation
- [ ] Test guest booking
- [ ] Test authenticated booking
- [ ] Test double-booking prevention
- [ ] Test appointment status tracking
- [ ] Test admin appointment management
- [ ] Test video consultation links
- [ ] Test chatbot rate limits
- [ ] Test mobile responsiveness
- [ ] Run the production build
- [ ] Verify all secrets are excluded from Git

---

## Useful Commands

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Create production build:

```bash
npm run build
```

Run TypeScript checking:

```bash
npx tsc --noEmit
```

Git status:

```bash
git status
```

Push changes:

```bash
git add .
git commit -m "Update project"
git push origin main
```

---

## Repository

The current project repository is:

**GitHub:**
https://github.com/saadkhan-dev/Naseem-health-elevate

---

## Project Goals

Naseem Health Elevate aims to provide a simple digital healthcare experience where patients can:

1. Discover healthcare services.
2. Book appointments easily.
3. Choose available time slots.
4. Request Home Visits.
5. Access Video Consultation.
6. Track appointment status.
7. Communicate with the clinic.
8. Access healthcare products and educational content.
9. Get assistance from an AI-powered healthcare assistant.

The platform also gives clinic staff a centralized system for managing appointments, services, availability, products, videos, and digital consultations.

---

## License

This project is developed for **Naseem Health Elevate / Dr. Naseem Ahmed Khan's clinic**.

Unless otherwise specified by the project owner, the source code, content, branding, images, and clinic-specific materials should not be reused or redistributed without permission.
