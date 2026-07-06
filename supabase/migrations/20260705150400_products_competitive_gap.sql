-- Discovery platform Run 5 — positioning-gap analysis storage
-- The gap analysis (addendum endpoint 13) is a product-scoped standing
-- artifact synthesized by Sonnet 4.6 over the stored, source-cited
-- competitor profiles. Reports are session-scoped and a product may not
-- have one yet, so the artifact lives on the product row itself; the
-- report function folds it into every snapshot it compiles (which is how
-- the gap "writes into the product's report snapshot").
--
-- Tamper-proofing: products previously carried blanket table-level
-- INSERT/UPDATE grants for authenticated (Supabase defaults). Since
-- competitive_gap is a function-produced artifact, the grants are
-- tightened to exactly the columns users legitimately write — the same
-- column-grant defense documented for messages.feedback and
-- user_profiles.display_name. The products Edge Function only ever
-- writes user_id/name/description, so existing behavior is unchanged.

alter table products
  add column competitive_gap jsonb,
  add column gap_generated_at timestamptz;

revoke insert, update on products from authenticated;
grant insert (user_id, name, description) on products to authenticated;
grant update (name, description) on products to authenticated;
