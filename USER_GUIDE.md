# Dr. Naseem Alam — User Guide

## 1. First-Time Setup

### 1.1 Create the Doctor Account

1. Start the dev server: `npm run dev`
2. Open http://localhost:5173
3. Click **"Sign in"** in the top-right
4. Click **"Sign up"** at the bottom
5. Fill in:
   - Full Name: `Dr. Naseem Alam`
   - Email: `[your-email]`
   - Phone: `+92 315 2968384`
   - Password: `[choose-a-password]`
6. Click **"Create account"**
7. Check your email inbox for a confirmation link from Supabase — click it

### 1.2 Promote Your Account to Doctor Role

1. Go to your Supabase dashboard → **SQL Editor**
2. Run this query (replace `YOUR_EMAIL`):
```sql
UPDATE profiles
SET role = 'doctor'
WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL');
```
3. Or if you don't know the email, run:
```sql
SELECT p.id, p.full_name, p.role, u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id;
```
Then:
```sql
UPDATE profiles SET role = 'doctor' WHERE id = 'THE-ID-FROM-ABOVE';
```

4. Now log out and log back in — you'll have access to `/admin`

### 1.3 (Optional) Seed Sample Data

Run these in Supabase SQL Editor to add sample products and videos:

```sql
-- Products
INSERT INTO products (name, description, price, in_stock) VALUES
  ('Arnica Montana', '30 CH (Globules)', 450, true),
  ('Rhus Toxicodendron', '30 CH (Drops)', 450, true),
  ('Natural Pain Relief Oil', '100ml', 850, true);

-- Videos
INSERT INTO videos (title, description, duration, is_published) VALUES
  ('Joint Pain Relief — Natural Homeopathic Treatment', 'Learn about natural remedies for joint pain', '06:45', true),
  ('Cervical Pain: Causes, Symptoms & Treatment', 'Understanding cervical pain and solutions', '09:12', true),
  ('Benefits of Homeopathy in Daily Life', 'How homeopathy can improve your daily health', '05:03', true),
  ('Simple Exercises for Back Pain Relief', 'Easy exercises recommended by Dr. Naseem', '05:32', true);
```

---

## 2. Patient User Guide

### 2.1 Registering
- Click **"Sign in"** → **"Sign up"**
- Enter name, email, phone, password
- Check email for confirmation link

### 2.2 Booking an Appointment
1. Scroll to the **"Book Your Appointment"** section on the home page
2. Select a **Service** (e.g., Physiotherapy Session)
3. Pick a **Date** (future dates only)
4. Pick an available **Time** slot
5. Click **"Book Appointment"**
6. You'll see a confirmation with your booking details

### 2.3 Joining a Video Call
- The doctor will share a link with you
- Open the link in a browser
- Enter your name
- Click **"Join Video Call"**
- Grant camera/microphone permissions

---

## 3. Doctor Admin Guide

**Access:** Navigate to `http://localhost:5173/admin` after logging in.

### 3.1 Dashboard
Shows:
- Total appointments count
- Pending appointments (need your confirmation)
- Today's appointments
- Total patient count

### 3.2 Managing Appointments
1. Go to **Appointments** in the sidebar
2. Filter by status (All, Pending, Confirmed, etc.)
3. For **Pending** appointments:
   - ✅ Green check → Confirm the booking
   - ❌ Red X → Cancel the booking
4. For **Confirmed** appointments:
   - **"Complete"** → Mark as done
   - **"Video Call"** → Start a video consultation

### 3.3 Starting a Video Call
1. Find a **Confirmed** appointment
2. Click **"Video Call"** button
3. A dialog appears with:
   - **Patient join link** — Copy and share this with the patient
   - **"Join as Doctor"** — Click to enter the video room
4. Both doctor and patient join the same Jitsi Meet room

### 3.4 Customizing Availability
1. Go to **Availability** in the sidebar
2. Toggle each day **On/Off** (closed vs open)
3. Edit start/end times for each day
4. Click **"Save"** to apply changes
5. Patients will only see available time slots based on this schedule

### 3.5 Managing Services
1. Go to **Services** in the sidebar
2. Click **"Add Service"** to create a new one
3. Edit existing services (name, description, duration, price)
4. Delete services no longer offered

### 3.6 Managing Products
1. Go to **Products** in the sidebar
2. Add products with name, description, price, image URL
3. Products appear automatically on the home page

### 3.7 Managing Videos
1. Go to **Videos** in the sidebar
2. Add videos with title, thumbnail URL, YouTube URL, duration
3. Published videos appear automatically on the home page

---

## 4. Customization Options

### Changing Clinic Info
Edit `src/lib/contact.ts`:
```ts
export const PHONE = "+92 315 2968384";
export const WHATSAPP_NUMBER = "923152968384";
export const EMAIL = "info@drnaseemalam.com";
```

### Changing Brand Colors
Edit `src/styles.css` — look for CSS variables starting with `--primary`.

---

## 5. Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Cloudflare Workers
```bash
npx wrangler deploy
```

### Or Any Static Host
The `dist/` folder contains the built files.

---

## 6. Common Issues

**"No slots available"** — Check your availability settings in Admin → Availability

**Video call not working** — Make sure both parties have camera/microphone permissions. Try a different browser (Chrome recommended).

**User can't register** — Check Supabase Auth settings → make sure email confirmations are enabled.

**Admin page shows loading** — Your account role is still "patient". Run the SQL from section 1.2 to change it to "doctor".
