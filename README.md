# Warkost Bahagia — Integrated Delivery System

## Baseline
- Baseline version: V0.8.6.2
- Baseline source: Warkost_Bahagia_V08.6.2_Order_Confirmation.zip
- Architecture: Flask + SQLite (legacy/offline baseline)
- Target architecture: Supabase Auth + PostgreSQL + RLS + server-side business rules

## Purpose
This repository is the source of truth for the Warkost Bahagia application.

## Baseline rule
The V0.8.6.2 baseline is preserved as the known-working starting point. Future changes must be made through branches and validated before merging.

## Next milestone
Migrate the application foundation from SQLite/local authentication to Supabase while preserving the working customer checkout and role-based operational flows.
