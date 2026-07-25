#!/usr/bin/env ts-node
/**
 * Regenerate ONLY the ESPN players fixture, from public league 80193.
 *
 * Run with:
 *   npx ts-node --project scripts/tsconfig.json scripts/generate-espn-players-fixture.ts
 *
 * Why this is separate from generate-espn-fixtures.ts
 * ---------------------------------------------------
 * The ESPN fixtures are not all the same shape, and that is deliberate:
 * FixtureBasedPlatformApi returns the players fixture *verbatim* as `Player[]`,
 * but pipes the league and history fixtures through `importEspnLeagueInfo` /
 * `importEspnLeagueHistory`, so those two hold raw ESPN payloads. Regenerating
 * everything through the mapped PlatformApi methods would write mapped data over
 * the raw-shaped files and break league loading. This script touches one file.
 *
 * Season
 * ------
 * 2024 is the only season league 80193 still serves without credentials — 2025
 * and 2026 both return 401. Keeping regeneration credential-free is worth more
 * than fixture freshness here: anyone can re-run this, and the data is only ever
 * used to exercise code paths, never asserted on by player name.
 */

import fs from 'fs';
import path from 'path';
import { EspnApi } from '../src/platforms/espn/EspnApi';
import type { EspnLeague } from '../src/platforms/common';
import type { Player } from '../src/platforms/PlatformApi';

const SOURCE_LEAGUE_ID = '80193';
const SEASON = '2024';
const OUTPUT_PATH = path.join(__dirname, '..', 'e2e', 'fixtures', 'espn', 'fetch-players-espn.json');

/** Guards against silently committing a fixture that would make tests vacuous. */
const MIN_PLAYERS = 500;
const MIN_RANKED = 400;

async function main() {
  const league: EspnLeague = { id: SOURCE_LEAGUE_ID, platform: 'espn', auth: undefined };
  const api = new EspnApi(league);

  console.log(`Fetching players from public ESPN league ${SOURCE_LEAGUE_ID}, season ${SEASON}...`);
  const players = await api.fetchPlayers(SEASON);

  if (typeof players === 'number') {
    throw new Error(
      `ESPN returned status ${players}. If this is 401, the league is no longer publicly ` +
      `readable for ${SEASON} and this script needs a new source league or season.`
    );
  }

  const withRank = players.filter(p => p.platformRank !== undefined).length;
  const withPrice = players.filter(p => (p.platformPrice ?? 0) > 0).length;

  console.log(`  ${players.length} players`);
  console.log(`  ${withPrice} with a nonzero auction value`);
  console.log(`  ${withRank} with a published draft rank`);

  if (players.length < MIN_PLAYERS) {
    throw new Error(`Only ${players.length} players (expected >= ${MIN_PLAYERS}); refusing to write.`);
  }
  if (withRank < MIN_RANKED) {
    // The whole point of this fixture is exercising the rank tie-break that
    // orders the ~80% of players ESPN gives no auction value.
    throw new Error(`Only ${withRank} ranked players (expected >= ${MIN_RANKED}); refusing to write.`);
  }

  writeFixture(players);
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

function writeFixture(players: Player[]) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ status: 'ok', data: players }, null, 2) + '\n');
}

main().catch(error => {
  console.error('\nFailed to regenerate the ESPN players fixture:', error);
  process.exit(1);
});
