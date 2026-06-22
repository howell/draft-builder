'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PlatformLeague, platformLogo } from '@/platforms/common';
import type { LeagueInfo } from '@/platforms/PlatformApi';
import { useLeagueInfoQuery } from '@/hooks/queries/useLeagueInfoQuery';
import {
  defaultPriceMultiplier,
  effectiveMultiplier,
  formatMultiplier,
  parseMultiplierInput,
} from '@/lib/leaguePriceMultiplier';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';

interface LeagueMultiplierRowProps {
  league: PlatformLeague;
  /** Stored override for this league, if any. */
  stored: number | undefined;
  saving: boolean;
  onSave: (multiplier: number) => void;
  onReset: () => void;
}

export default function LeagueMultiplierRow({
  league,
  stored,
  saving,
  onSave,
  onReset,
}: LeagueMultiplierRowProps) {
  const infoQuery = useLeagueInfoQuery(league.id);
  const info = infoQuery.data as LeagueInfo | undefined;

  const defaultValue = defaultPriceMultiplier(info);
  const effective = effectiveMultiplier(stored, info);

  const [draft, setDraft] = useState(formatMultiplier(effective));
  const [error, setError] = useState<string | null>(null);

  // Re-sync the input when the effective value changes from outside the input
  // (e.g. the league info finishes loading, or a save/reset resolves). Adjusting
  // state during render is React's recommended alternative to an effect here.
  const [lastEffective, setLastEffective] = useState(effective);
  if (effective !== lastEffective) {
    setLastEffective(effective);
    setDraft(formatMultiplier(effective));
    setError(null);
  }

  const leagueName = info?.name || league.id;
  const isOverridden = stored !== undefined;

  const handleSave = () => {
    const result = parseMultiplierInput(draft);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.value);
  };

  return (
    <div
      className="flex flex-col gap-3 py-4 border-b border-gray-200 dark:border-gray-700 sm:flex-row sm:items-end sm:justify-between"
      data-testid={`multiplier-row-${league.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 relative shrink-0">
          <Image src={platformLogo(league.platform)} alt={`${league.platform} logo`} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{leagueName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {league.platform.toUpperCase()} · {league.id}
            {info?.draft?.auctionBudget ? ` · $${info.draft.auctionBudget} budget` : ''}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Default: {formatMultiplier(defaultValue)}
            {isOverridden ? ' (overridden)' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-28">
          <Input
            label="Multiplier"
            type="number"
            step="0.001"
            min="0"
            value={draft}
            error={error ?? undefined}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            data-testid={`multiplier-input-${league.id}`}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={saving || formatMultiplier(Number(draft)) === formatMultiplier(effective)}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={saving || !isOverridden}
          title="Revert to the computed default"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
