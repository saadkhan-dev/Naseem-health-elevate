# Naseem Health Elevate — Dr. Naseem Ahmed Khan

A full-featured healthcare website for Dr. Naseem Ahmed Khan's clinic, built with **TanStack Start**, **React**, **Tailwind CSS v4**, and **Supabase**.

## Project Review

### What's Built ✅

| Feature                                                         | Status       | Details                                                                           |
| --------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| Landing Page (Hero, About, Services, Products, Videos, Contact) | **Complete** | Fully responsive, modern UI with gradients, glassmorphism, floating cards         |
| Online Booking System                                           | **Complete** | Service selection, date picker, real-time slot availability, booking confirmation |
| User Authentication                                             | **Complete** | Sign up, sign in, logout via Supabase Auth with email confirmation                |
| Role-Based Access                                               | **Complete** | Patient & Doctor roles; admin panel restricted to `doctor` role                   |
| Admin Dashboard                                                 | **Complete** | Stats cards, today's appointments list                                            |
| Admin — Appointments Management                                 | **Complete** | View all, filter by status, confirm/cancel/complete appointments                  |
| Admin — Availability Management                                 | **Complete** | Set working hours per day of week                                                 |
| Admin — Services CRUD                                           | **Complete** | Add, edit, delete services with duration & price                                  |
| Admin — Products CRUD                                           | **Complete** | Add, edit, delete products with image & price                                     |
| Admin — Videos CRUD                                             | **Complete** | Add, edit, delete videos with thumbnail & YouTube URL                             |
| Video Consultation                                              | **Complete** | Jitsi Meet integration for doctor-patient video calls                             |
| WhatsApp Integration                                            | **Complete** | Floating WhatsApp button, product order via WhatsApp, consultation via WhatsApp   |
| Google Maps Embed                                               | **Complete** | Clinic location with interactive map                                              |

### Issues & Improvements Needed 🔧

| Priority   | Issue                                                                                                                                                | Location                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **HIGH**   | **RLS (Row Level Security) is disabled** — anyone with the anon key can read/write all data. Must be enabled with proper policies before going live. | Supabase dashboard                             |
| **MEDIUM** | Meta tags still reference "Lovable App" and "@Lovable" — should be updated to Dr. Naseem Ahmed Khan branding                                         | `src/routes/__root.tsx`                        |
| **MEDIUM** | Social media links in footer (Facebook, Instagram, YouTube, WhatsApp) all point to `#` — no actual URLs set                                          | `src/components/site/SiteFooter.tsx`           |
| **MEDIUM** | Quick Links & Our Services footer columns also point to `#` instead of proper anchor links                                                           | `src/components/site/SiteFooter.tsx`           |
| **LOW**    | Product carousel left/right arrow buttons have no onClick handler (visual only)                                                                      | `src/components/site/ConsultationProducts.tsx` |
| **LOW**    | No responsive hamburger menu for mobile nav                                                                                                          | `src/components/site/Nav.tsx`                  |
| **LOW**    | No dedicated "Services" section on the homepage (only Video Consultation + Products)                                                                 | `src/components/site/ConsultationProducts.tsx` |
| **LOW**    | Profile setup guide notes are mixed with chatbot deployment instructions — should be cleaned up                                                      | `profile setup guide.txt`                      |

## Tech Stack

- [TanStack Start](https://tanstack.com/start) (React + Vite)
- [TanStack Router](https://tanstack.com/router)
- [Tailwind CSS v4](https://tailwindcss.com) + [tw-animate-css](https://github.com/tailwindlabs/tailwindcss-animate)
- [Supabase](https://supabase.com) — Auth, Database, Storage
- [Cloudflare Pages / Workers](https://pages.cloudflare.com/) — Deployment
- [Jitsi Meet](https://jitsi.org/) — Video calls
- [Lucide](https://lucide.dev) — Icons
- [React Query](https://tanstack.com/query) — Server state management

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm or bun

### 1. Clone & Install

```bash
git clone https://github.com/MansoorAhmed009/naseem-health-elevate.git
cd naseem-health-elevate
npm install
```

### 2. Environment Variables

A `.env` file is already provided with the Supabase project keys.  
If starting fresh, create it with:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Server-only variable (required for admin/booking writes)

All write operations (admin CRUD, appointment status changes, guest bookings, video
sessions) run through **TanStack Start server functions** (`src/lib/actions.functions.ts`)
using a **service-role** Supabase client (`src/lib/server/supabase-admin.ts`). The
service-role key bypasses RLS, so every server function authorizes the caller itself by
validating their JWT and checking the profile role.

Set `SUPABASE_SERVICE_ROLE_KEY` in your **server** environment only — never expose it to
the browser (it is not `VITE_`-prefixed and never bundled client-side):

- **Local dev / Node**: add `SUPABASE_SERVICE_ROLE_KEY=your_service_role_key` to your
  `.env` file (or export it in your shell).
- **Cloudflare Workers**: add it as a secret binding:
  ```bash
  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
  ```
  For local `wrangler dev`, put it in `wrangler.jsonc` `vars` or `--var`.

> ⚠️ Guard this key like a password — it grants full access to your database.
> Find it in Supabase Dashboard → Settings → API → `service_role` secret.

### 3. Sending the Appointment ID (email + SMS/WhatsApp)

After a guest books, the server sends the Appointment ID to the contact the
patient provided (email, phone, or both). Delivery is a **real provider call**
(`src/lib/server/notifications.ts`) — it is never faked. Configure one or more
of the following server-only env vars to enable a channel; until then the app
still books and shows the ID, and reports the channel as "not configured".

| Channel  | Provider | Env vars required                                                         |
| -------- | -------- | ------------------------------------------------------------------------- |
| Email    | Resend   | `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` (a verified sender on Resend) |
| SMS      | Twilio   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`              |
| WhatsApp | Twilio   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`         |

- Phone bookings prefer WhatsApp when `TWILIO_WHATSAPP_FROM` is set, otherwise
  they fall back to SMS.
- `TWILIO_WHATSAPP_FROM` must be a `whatsapp:+…` number (e.g.
  `whatsapp:+14155238886`) that is verified/approved for the destination country.
- Add `SITE_URL=https://your-domain.com` so message links point at the real
  status page (e.g. `/appointment-status`). The same URL is the base for the
  online video consultation patient join link
  (`https://your-domain.com/video/VC-XXXXXX`) that is used by both the
  "video ready" notification and the admin "Copy Link" button — WhatsApp/SMS
  links are only clickable when `SITE_URL` is set to an absolute public URL.

Set them like `SUPABASE_SERVICE_ROLE_KEY` (`.env` locally, Wrangler secret on
Cloudflare) — none are `VITE_`-prefixed, so they never reach the browser.

### 4. Create Database Tables

Run the following SQL in your Supabase dashboard → **SQL Editor** to create all required tables:

```sql
-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 30,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Availability (weekly schedule)
CREATE TABLE availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true
);

-- Appointments
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  service_id UUID REFERENCES services(id) NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos
CREATE TABLE videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  duration TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Enable Row Level Security (RLS)

**⚠️ Required before going live.** Run these policies in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own, doctors can read all
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id OR auth.jwt() ->> 'role' IN ('doctor', 'admin'));

-- Appointments: patients see own, doctors see all
CREATE POLICY "Patients can view own appointments" ON appointments
  FOR SELECT USING (auth.uid() = patient_id OR auth.jwt() ->> 'role' IN ('doctor', 'admin'));
CREATE POLICY "Patients can create own appointments" ON appointments
  FOR INSERT WITH CHECK (auth.uid() = patient_id);

-- Services: anyone can read active, only doctors can write
CREATE POLICY "Anyone can view active services" ON services
  FOR SELECT USING (is_active = true OR auth.jwt() ->> 'role' IN ('doctor', 'admin'));
CREATE POLICY "Doctors can manage services" ON services
  FOR ALL USING (auth.jwt() ->> 'role' IN ('doctor', 'admin'));

-- Products: anyone can read, only doctors can write
CREATE POLICY "Anyone can view products" ON products
  FOR SELECT USING (true);
CREATE POLICY "Doctors can manage products" ON products
  FOR ALL USING (auth.jwt() ->> 'role' IN ('doctor', 'admin'));

-- Videos: anyone can read published, only doctors can write
CREATE POLICY "Anyone can view published videos" ON videos
  FOR SELECT USING (is_published = true OR auth.jwt() ->> 'role' IN ('doctor', 'admin'));
CREATE POLICY "Doctors can manage videos" ON videos
  FOR ALL USING (auth.jwt() ->> 'role' IN ('doctor', 'admin'));

-- Availability: anyone can read, only doctors can write
CREATE POLICY "Anyone can view availability" ON availability
  FOR SELECT USING (true);
CREATE POLICY "Doctors can manage availability" ON availability
  FOR ALL USING (auth.jwt() ->> 'role' IN ('doctor', 'admin'));
```

### AI Chatbot (floating "Naseem AI Assistant")

The chatbot is a TanStack Start **server function** (`src/lib/chat.functions.ts`)
that proxies to Google Gemini. It needs two things:

1. **Gemini API key — server-only.** Get one from <https://aistudio.google.com>
   and add it to your `.env` (Node) or Wrangler secret (Cloudflare) — never to a
   `VITE_` variable:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   CHATBOT_MODEL=gemini-2.5-flash   # optional override (defaults to a flash model)
   ```

   The key is read only inside the server handler and is never shipped to the browser.

2. **Usage-tracking table.** Run [`supabase/chat-usage.sql`](./supabase/chat-usage.sql)
   in the Supabase SQL Editor. It creates the `chat_usage` table (one row per
   request: success / failed / rate_limited / spam), the `is_admin()` helper,
   indexes, and an RLS policy so only admins can read the rows.

**Rate limits are enforced server-side** in `src/lib/server/chat-usage.ts`:

- Guests: **10 messages/hour, 50/day**
- Logged-in users: **20 messages/hour, 100/day**

Every request is recorded in `chat_usage` and surfaced in the admin dashboard
(**Admin → AI Chatbot Usage**), which shows today/7d/30d/all-time stats, a daily
breakdown, recent activity, and auto-refreshes every 30 s.

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 6. Set Up Your Doctor Account

Follow the detailed instructions in [`USER_GUIDE.md`](./USER_GUIDE.md) (Section 1) to:

1. Sign up as a patient
2. Run a SQL query in Supabase to promote your account to `doctor`
3. Log in and access the admin panel at `/admin`

## Deployment

### Build for Production

```bash
npm run build
```

### Deploy to Cloudflare Workers

```bash
npx wrangler deploy
```

Or serve the `dist/` folder from any static host (Netlify, Vercel, etc.).

## Next Steps (Checklist)

- [ ] **Set up Supabase tables** — Run the SQL from section 3 above
- [ ] **Enable RLS** — Run the security policies from section 4
- [ ] **Create doctor account** — Register and promote to `doctor` role via SQL
- [ ] **Update branding** — Replace "Lovable" references in `src/routes/__root.tsx` with Dr. Naseem Ahmed Khan
- [ ] **Set up social links** — Add real Facebook, Instagram, YouTube URLs in `src/components/site/SiteFooter.tsx`
- [ ] **Fix footer anchor links** — Point Quick Links & Services columns to proper section IDs
- [ ] **Add services section** — Create a dedicated services display on the homepage
- [ ] **Add mobile hamburger menu** — Make nav responsive for mobile devices
- [ ] **Configure availability** — Set working hours in Admin → Availability
- [ ] **Add products & videos** — Populate content via admin dashboard
- [ ] **Clean up** — Remove/ignore `profile setup guide.txt` (developer notes)
- [ ] **AI Chatbot** — Add `GEMINI_API_KEY` to your server env and run `supabase/chat-usage.sql` (see the AI Chatbot section above)
- [ ] **Deploy** — Run `npm run build` and deploy to preferred host

## Full User Guide

See [`USER_GUIDE.md`](./USER_GUIDE.md) for detailed instructions on registration, booking, admin management, and troubleshooting.
