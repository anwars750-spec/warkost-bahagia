-- Remove legacy delivery lifecycle overloads so actor binding cannot be bypassed.
drop function if exists private.mark_delivery_picked_up(uuid);
drop function if exists private.complete_delivery(uuid,text,text);