-- Run 3 hardening — record web-search request counts on model_usage
-- Run 2 folded web-search cost ($10/1k requests) into cost_usd, which is
-- right for totals but makes search spend inseparable afterwards. The
-- admin spend view needs it separate, so the count is now stored
-- alongside (cost_usd remains the all-in number). NULL means "no search
-- component" — Haiku/Sonnet text calls, and market_grounding rows
-- written before this column existed (the spend view labels those as
-- blended).

alter table model_usage
  add column web_search_requests integer
  check (web_search_requests is null or web_search_requests >= 0);
