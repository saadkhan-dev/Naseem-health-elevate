# Dr. Naseem Ahmed Khan — Clinic Landing Page

A single high-conversion landing page on `/` matching the uploaded mockup: clean white + soft teal/blue aesthetic, premium healthcare feel, fully responsive.

## Sections (top to bottom)

1. **Sticky Nav** — Logo, links (Home, About, Services, Treatments, Products, Videos, Contact), phone CTA button (+92 315 2968384, click-to-call).
2. **Hero** — Headline "Expert Homeopathic & Physiotherapy Care", supporting copy, two CTAs (Book Appointment → scroll to booking; Video Consultation → WhatsApp link), 3 trust badges, doctor portrait right with 3 floating glass cards (Homeopathy, Physiotherapy, Karachi Based).
3. **Booking Panel** — Card with Service dropdown, Date picker, Time picker, "Check Availability" button. Below: 4 mini feature pills (Easy Booking, Flexible Timing, Secure, Doctor-managed). Frontend-only; submit opens WhatsApp prefilled with selections.
4. **Video Consultation + Products** — Two-column row. Left: consultation card with phone mockup illustration, bullet list, "Consult Now" button → WhatsApp video call link. Right: product carousel (3 sample homeopathic products: name, strength, PKR price, Add to Cart — visual only).
5. **Health Awareness Videos** — 4 thumbnail cards with play icon overlays (YouTube-style placeholders).
6. **Location + About** — Two-column. Left: clinic address card, embedded Google Maps iframe (Clifton, Karachi), WhatsApp + Call Now buttons. Right: About Dr. Naseem Ahmed Khan — bio, qualifications list (DHMS, Physiotherapy Specialist, Pain Management, Holistic Care), portrait.
7. **Footer (dark teal)** — Brand blurb, Quick Links, Services, Clinic Timings (Mon-Sat 10am-8pm, Sun 10am-2pm, Fri closed), Contact (phone, WhatsApp, email, address), social icons.

## Functional behavior

- **WhatsApp button**: opens `https://wa.me/923152968384?text=...` with context-aware prefilled message (booking summary, consultation request, etc.).
- **Phone/Call Now**: `tel:+923152968384`.
- **Video Consultation CTA**: WhatsApp link with "I'd like to book a video consultation" prefilled.
- **Booking form**: client-side state only; on submit, formats selections into WhatsApp message and opens chat. No backend.
- All other interactive elements (products Add to Cart, video play, admin scheduling) are visual-only in this v1.

## Design system

- Update `src/styles.css` with oklch tokens: background white, primary soft teal (~oklch(0.65 0.10 195)), accent light blue, muted soft gray-blue, dark teal for footer. Soft shadows, rounded-2xl cards, subtle gradients.
- Typography: Plus Jakarta Sans (body) + a refined display for headlines, loaded via Google Fonts in `__root.tsx` head.
- Tokens used semantically throughout — no raw color classes.

## Images

Generate via imagegen, save to `src/assets/`:

- `doctor-portrait.jpg` — South Asian male doctor, 40s, glasses, beard, white coat, arms crossed, clinic background (hero).
- `doctor-about.jpg` — same doctor, different pose for About section.
- `product-1/2/3.jpg` — homeopathic medicine bottles on white.
- `video-thumb-1..4.jpg` — health topic thumbnails.
- `consultation-illustration.jpg` — phone showing video call.

## File structure

- `src/routes/index.tsx` — replace placeholder; compose sections.
- `src/components/site/` — `Nav.tsx`, `Hero.tsx`, `BookingPanel.tsx`, `ConsultationProducts.tsx`, `VideoGallery.tsx`, `LocationAbout.tsx`, `SiteFooter.tsx`.
- `src/lib/contact.ts` — WhatsApp URL builder, phone constant.
- `src/styles.css` — updated tokens.
- `src/routes/__root.tsx` — add Google Fonts links + page meta (title, description, og).

## Out of scope (v1)

Real backend for bookings/products/admin scheduling, real video player, real cart/checkout. All marked as visual/demo; WhatsApp is the single live conversion channel.
