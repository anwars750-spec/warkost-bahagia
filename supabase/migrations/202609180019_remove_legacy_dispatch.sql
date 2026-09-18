-- V1 hardening: remove legacy dispatch overload so actor authorization cannot be bypassed.
drop function if exists private.assign_delivery(uuid,uuid,integer);