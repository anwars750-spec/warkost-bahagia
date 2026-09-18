alter table public.payments
  add column if not exists transaction_reference text,
  add column if not exists customer_action text,
  add column if not exists instruction_payload jsonb,
  add column if not exists creation_idempotency_key text;

create unique index if not exists payments_creation_idempotency_key_uidx
  on public.payments(creation_idempotency_key)
  where creation_idempotency_key is not null;

comment on column public.payments.creation_idempotency_key is
'Stable server-generated key for payment creation retries; must be reused with the provider.';
