-- Provider-neutral payment webhook event inbox.
-- One provider event_id can only be accepted once.
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  provider_reference text,
  transaction_reference text,
  order_reference text,
  payment_status payment_status,
  amount numeric,
  currency text,
  event_time timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','rejected','duplicate','error')),
  rejection_reason text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique(provider, event_id)
);

create index if not exists payment_webhook_events_provider_ref_idx
  on public.payment_webhook_events(provider, provider_reference);
create index if not exists payment_webhook_events_order_ref_idx
  on public.payment_webhook_events(order_reference);

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated;
grant select, insert, update on public.payment_webhook_events to service_role;
