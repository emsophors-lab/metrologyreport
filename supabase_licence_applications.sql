-- Annex 2 licence applications — the stage before a licence exists.
--
-- Purely additive. This migration creates two new tables and touches nothing
-- that is already in the database: enterprise_licenses, the 16 live licences,
-- the company accounts and the existing "ចុះបញ្ជីថ្មី" path all keep working
-- exactly as they do today. An application only becomes a licence when an
-- officer approves it and the existing licence-creation path runs; until then
-- the two live side by side.
--
-- Run in the Supabase SQL editor. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.licence_applications (
  id uuid PRIMARY KEY,
  application_no text NOT NULL UNIQUE,

  -- DRAFT      an officer is still entering it
  -- SUBMITTED  handed in, waiting to be looked at
  -- UNDER_REVIEW / APPROVED / REJECTED  the Centre's decision
  -- ISSUED     a licence was created from it; issued_licence_id says which
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','ISSUED')),

  -- Promoted out of the payload so the list can be searched and sorted
  -- without reading every document.
  enterprise_name_kh text NOT NULL DEFAULT '',
  enterprise_name_en text NOT NULL DEFAULT '',
  owner_name_kh      text NOT NULL DEFAULT '',
  phone              text NOT NULL DEFAULT '',
  email              text NOT NULL DEFAULT '',
  subject            text NOT NULL DEFAULT '',
  request_types      text[] NOT NULL DEFAULT '{}',
  made_on            date,

  -- The whole Annex 2 form. It is a document with repeating sections whose
  -- shape follows the official form, so it is stored as one, rather than
  -- shredded across six child tables that only ever get read together.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_by text, reviewed_at timestamptz, decision_note text,

  -- Set only when an officer issues the licence. Deliberately a plain text
  -- reference rather than a foreign key: enterprise_licenses is the live
  -- table and this migration must not be able to lock or alter it.
  issued_licence_id text, issued_at timestamptz
);

CREATE INDEX IF NOT EXISTS licence_applications_status_idx ON public.licence_applications(status);
CREATE INDEX IF NOT EXISTS licence_applications_created_idx ON public.licence_applications(created_at DESC);

-- Attachments live beside the application, not inside it: the eight official
-- items are held as base64 the same way the existing licence form already
-- holds its photo and attached document, and keeping them in their own rows
-- stops the application row growing to megabytes.
CREATE TABLE IF NOT EXISTS public.licence_application_files (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.licence_applications(id) ON DELETE CASCADE,
  doc_index int NOT NULL,          -- 0-7, the official item ១–៨
  row_index int NOT NULL,          -- which ផលិត / ដំឡើង / ជួសជុល row
  verified boolean NOT NULL DEFAULT false,
  file_name text, mime_type text, byte_size int,
  content_base64 text,
  uploaded_by text, uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, doc_index, row_index)
);

CREATE INDEX IF NOT EXISTS licence_application_files_app_idx
  ON public.licence_application_files(application_id);

-- Every status change, so a decision can be accounted for later.
CREATE TABLE IF NOT EXISTS public.licence_application_events (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.licence_applications(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text, to_status text,
  actor text, actor_role text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS licence_application_events_app_idx
  ON public.licence_application_events(application_id, created_at DESC);

-- RLS on with no policy, matching the rest of this database: every read and
-- write goes through the server on the service role, and nothing is reachable
-- from a browser with the anon key.
ALTER TABLE public.licence_applications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licence_application_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licence_application_events ENABLE ROW LEVEL SECURITY;
