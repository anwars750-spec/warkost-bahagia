insert into storage.buckets (id,name,public)
values ('delivery-proofs','delivery-proofs',false)
on conflict (id) do update set public=false;

drop policy if exists "driver_upload_delivery_proof" on storage.objects;
create policy "driver_upload_delivery_proof" on storage.objects for insert to authenticated
with check (
  bucket_id='delivery-proofs'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (select 1 from public.profiles where id=auth.uid() and role='driver' and is_active=true)
);

drop policy if exists "driver_read_delivery_proof" on storage.objects;
create policy "driver_read_delivery_proof" on storage.objects for select to authenticated
using (
  bucket_id='delivery-proofs'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (select 1 from public.profiles where id=auth.uid() and role='driver' and is_active=true)
);
