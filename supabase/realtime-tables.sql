-- ============================================================
-- Health Elevate — Realtime publication additions
-- Adds the tables the auto-updating UI and analytics page subscribe
-- to via postgres_changes. RLS does the filtering per subscriber:
--
--   * Real-time event bus + analytics (new)  -> admin / own-row only.
--   * content (services, availability, products, ...) -> public read.
--   * admin/staff domain tables (orders, support_messages, reviews, ...)
--     -> RLS restricts them to admin + the owning patient; no guest
--       SELECT policy exists on orders, so anonymous subscribers receive
--       nothing.
--
-- NOT published on purpose (guest-data leak, see appointment-flow.sql):
--   * public.appointments       -> anon policy reads ALL guest rows.
--   * public.video_sessions     -> appointment-flow.sql guest policy.
--   * consultation_*            -> already streamed by its own realtime
--                                  setup for conversations/participants.
-- Their changes reach clients through public.realtime_events instead.
--
-- Re-runnable: idempotent do/exception blocks (no errors on re-run).
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table public.realtime_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.website_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.live_sessions;
exception when duplicate_object then null;
end $$;

-- Orders / order requests (admin + owning patient only via RLS)
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.order_requests;
exception when duplicate_object then null;
end $$;

-- Support / documents / reminders / test recommendations
do $$ begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.documents;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.reminders;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.test_recommendations;
exception when duplicate_object then null;
end $$;

-- Reviews / video offer usage
do $$ begin
  alter publication supabase_realtime add table public.reviews;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.product_reviews;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.video_offer_usage;
exception when duplicate_object then null;
end $$;

-- Public-facing content (readable by everyone already)
do $$ begin
  alter publication supabase_realtime add table public.services;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.availability;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.custom_availability;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.recurring_availability;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.store_settings;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.delivery_areas;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conditions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.videos;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.video_offers;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.faqs;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.payment_methods;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.doctor_profile;
exception when duplicate_object then null;
end $$;