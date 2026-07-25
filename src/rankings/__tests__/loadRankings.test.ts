import { rankByPlatformPrice } from '../loadRankings';
import type { Player } from '@/platforms/PlatformApi';

function player(
  id: string,
  position: string,
  platformPrice?: number,
  platformRank?: number
): Player {
  return {
    fullName: `Player ${id}`,
    ids: { espn: id, sleeper: '', yahoo: '' },
    position,
    eligiblePositions: [position, 'BN'],
    platformPrice,
    platformRank,
  };
}

describe('rankByPlatformPrice', () => {
  it('orders by platform price, highest first', () => {
    const players = [
      player('a', 'WR', 10),
      player('b', 'WR', 40),
      player('c', 'WR', 25),
    ];

    const { overall } = rankByPlatformPrice('espn', players, 'ppr');

    expect(overall.get('b')).toBe(0);
    expect(overall.get('c')).toBe(1);
    expect(overall.get('a')).toBe(2);
  });

  it('breaks price ties with the platform rank', () => {
    // ESPN zeroes out the auction value for everyone outside the top few
    // hundred, so this tail is the common case, not an edge case.
    const players = [
      player('a', 'WR', 0, 300),
      player('b', 'WR', 0, 100),
      player('c', 'WR', 0, 200),
    ];

    const { overall } = rankByPlatformPrice('espn', players, 'ppr');

    expect(overall.get('b')).toBe(0);
    expect(overall.get('c')).toBe(1);
    expect(overall.get('a')).toBe(2);
  });

  it('keeps priced players ahead of better-ranked unpriced ones', () => {
    const players = [
      player('cheap', 'WR', 1, 500),
      player('elite-rank', 'WR', 0, 1),
    ];

    const { overall } = rankByPlatformPrice('espn', players, 'ppr');

    expect(overall.get('cheap')).toBe(0);
    expect(overall.get('elite-rank')).toBe(1);
  });

  it('sorts players with no platform rank last within a price tie', () => {
    const players = [
      player('unranked', 'WR', 0, undefined),
      player('ranked', 'WR', 0, 900),
    ];

    const { overall } = rankByPlatformPrice('espn', players, 'ppr');

    expect(overall.get('ranked')).toBe(0);
    expect(overall.get('unranked')).toBe(1);
  });

  it('numbers positional ranks independently per position', () => {
    const players = [
      player('wr1', 'WR', 50),
      player('rb1', 'RB', 45),
      player('wr2', 'WR', 40),
      player('rb2', 'RB', 30),
    ];

    const { positional } = rankByPlatformPrice('espn', players, 'ppr');

    expect(positional.get('WR')?.get('wr1')).toBe(0);
    expect(positional.get('WR')?.get('wr2')).toBe(1);
    expect(positional.get('RB')?.get('rb1')).toBe(0);
    expect(positional.get('RB')?.get('rb2')).toBe(1);
  });

  it('does not reorder the array it is given', () => {
    // The caller passes the array held in the React Query players cache, so
    // sorting in place would silently reorder it for every other consumer.
    const players = [
      player('a', 'WR', 10),
      player('b', 'WR', 40),
      player('c', 'WR', 25),
    ];
    const originalOrder = players.map(p => p.ids.espn);

    rankByPlatformPrice('espn', players, 'ppr');

    expect(players.map(p => p.ids.espn)).toEqual(originalOrder);
  });
});
