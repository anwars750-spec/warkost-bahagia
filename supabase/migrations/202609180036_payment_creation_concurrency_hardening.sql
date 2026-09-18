alter table public.payments
  add column if not exists creation_started_at timestamptz;

create index if not exists payments_creation_started_idx
  on public.payments(order_id, creation_started_at);

comment on column public.payments.creation_started_at is
'Server-side payment creation lease timestamp used to prevent concurrent external payment creation for the same order.';
