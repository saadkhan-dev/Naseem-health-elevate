-- ============================================================
-- Health Elevate - Seed services (optional)
-- Run this once so the homepage has default services.
-- It only inserts when the services table is empty.
-- You can then edit everything from Admin -> Services.
-- ============================================================

insert into public.services (name, description, duration_minutes, price, is_active)
select v.name, v.description, v.duration_minutes, v.price, v.is_active
from (
  values
    ('Homeopathic Treatment',
     'Personalized homeopathic care based on your individual health needs and condition.',
     30, 1500, true),
    ('Physiotherapy',
     'Professional physiotherapy care to support mobility, reduce pain and improve physical well-being.',
     45, 2000, true),
    ('Personalized Consultation',
     'One-to-one consultation focused on understanding your symptoms and healthcare needs.',
     30, 1500, true),
    ('Video Consultation',
     'Consult with Dr. Naseem Ahmed Khan from the comfort of your home through video consultation.',
     30, 1000, true),
    ('Appointment Booking',
     'Book your appointment easily and choose a convenient time for your consultation.',
     15, 500, true),
    ('Patient-Centered Care',
     'Care focused on patient comfort, proper assessment and personalized treatment guidance.',
     15, 500, true),
    ('Home Visit',
     'In-home consultation with Dr. Naseem Ahmed Khan. The fee is flexible and depends on time and distance.',
     60, 0, true)
) as v(name, description, duration_minutes, price, is_active)
where not exists (select 1 from public.services);

-- If you already had services in the database, this leaves them untouched.
