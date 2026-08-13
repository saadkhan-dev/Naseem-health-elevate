-- ============================================================
-- Health Elevate - Create tables + seed default content
-- Run this once in the Supabase SQL Editor (after rls-policies.sql).
-- It creates the conditions and reviews tables and inserts the
-- default content. You can then edit everything from the admin panel.
-- ============================================================

-- --- conditions table ---
create table if not exists public.conditions (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'homeopathic' check (category in ('homeopathic', 'physiotherapy')),
  title text not null,
  description text not null default '',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- --- reviews table ---
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating int not null default 5 check (rating between 1 and 5),
  text text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- --- Seed conditions ---
insert into public.conditions (category, title, description, sort_order, is_active)
select v.category, v.title, v.description, v.sort_order, v.is_active
from (
  values
    ('homeopathic', 'Digestive Problems', 'Supportive homeopathic care for common digestive complaints and related health concerns.', 1, true),
    ('homeopathic', 'Stress & Anxiety', 'Personalized consultation for stress, anxiety and related everyday health concerns.', 2, true),
    ('homeopathic', 'Respiratory Conditions', 'Individualized homeopathic guidance for common respiratory and seasonal complaints.', 3, true),
    ('homeopathic', 'Skin Conditions', 'Personalized assessment and homeopathic care for common skin-related concerns.', 4, true),
    ('homeopathic', 'Headache & Migraine', 'Care focused on understanding recurring headaches and migraine-related symptoms.', 5, true),
    ('homeopathic', 'General Health Concerns', 'Consultation and individualized guidance based on your overall health needs.', 6, true),
    ('physiotherapy', 'Back & Neck Pain', 'Physiotherapy support to improve mobility, manage discomfort and restore daily function.', 1, true),
    ('physiotherapy', 'Joint Pain', 'Targeted physiotherapy care for movement, flexibility and joint function.', 2, true),
    ('physiotherapy', 'Muscle & Sports Injuries', 'Rehabilitation support to help improve strength, movement and physical recovery.', 3, true),
    ('physiotherapy', 'Arthritis & Mobility', 'Exercise-based physiotherapy support for mobility, flexibility and everyday movement.', 4, true),
    ('physiotherapy', 'Post-Injury Rehabilitation', 'Structured rehabilitation to support a safe return to normal movement and activities.', 5, true),
    ('physiotherapy', 'Movement & Posture Problems', 'Professional guidance to improve posture, movement patterns and physical function.', 6, true)
) as v(category, title, description, sort_order, is_active)
where not exists (select 1 from public.conditions);

-- --- Seed reviews ---
insert into public.reviews (name, rating, text, is_active)
select v.name, v.rating, v.text, v.is_active
from (
  values
    ('Google Reviewer', 5, 'Professional and caring service with a comfortable and welcoming environment.', true),
    ('Google Reviewer', 5, 'Very good experience with the treatment and professional guidance.', true),
    ('Google Reviewer', 5, 'A positive experience with attentive care and proper guidance.', true)
) as v(name, rating, text, is_active)
where not exists (select 1 from public.reviews);
