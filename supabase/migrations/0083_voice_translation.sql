-- ============================================================================
-- Health Elevate - Real-time voice translation (interpreter) for video
-- consultations.
--
-- Per-consultation interpreter state lives on the `video_sessions` row so a
-- patient joining mid-call (or reconnecting) picks up the active interpreter
-- without needing live data-channel history. Only doctors/admins can turn it
-- on: the server function behind the write uses `adminMiddleware`.
--
--   translation_enabled  interpreter ON/OFF for this consultation
--   patient_language     the language the patient speaks (doctor's choice).
--                        Defaults to Urdu ("ur-PK") = natural bypass (a
--                        patient who speaks Urdu needs no interpreter).
--
-- Idempotent / safe to re-run. No double quotes.
-- ============================================================================

alter table public.video_sessions
  add column if not exists translation_enabled boolean not null default false;

alter table public.video_sessions
  add column if not exists patient_language text;