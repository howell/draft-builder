-- Market Value Column Migration
-- ESPN's draft-room sticker is its LIVE auction-market value (league-scoped
-- draftAuctionValue), which ESPN zeroes almost immediately after a draft
-- completes — the 2026 real draft's stickers were unrecoverable one day
-- later. Persist the ESPN-wide market average (ownership.auctionValueAverage)
-- on daily API snapshots so draft-day market state survives alongside the
-- editorial values. Caveat recorded in the comment: the visible ESPN-wide
-- average is dominated by 1-QB leagues, so it understates QBs for superflex.

ALTER TABLE platform_player_values
    ADD COLUMN market_value DOUBLE PRECISION;

COMMENT ON COLUMN platform_player_values.market_value IS 'ESPN-wide live auction-market average (ownership.auctionValueAverage) at snapshot time; NULL for kit rows and pre-2026-08 API snapshots. 1-QB-league-dominated: understates QBs for superflex formats';
