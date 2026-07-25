'use client';

import React, { useCallback, useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { EmptyState } from '../live-draft/components/common';
import type { CustomRankingItem, RankablePosition } from '@/types/customRankings';
import {
  itemKey,
  moveBy,
  moveItem,
  insertTierBefore,
  removeTier,
  renameTier,
  type PoolPlayer,
} from '@/lib/rankings/customRankings';
import PlayerRow from './PlayerRow';
import TierDividerRow from './TierDividerRow';
import SortableRow from './SortableRow';

export interface PositionBoardProps {
  position: RankablePosition;
  items: CustomRankingItem[];
  pool: PoolPlayer[];
  hidePlatformRank: boolean;
  referenceLabel: string;
  addedIds: string[];
  onChange: (items: CustomRankingItem[]) => void;
}

const PositionBoard: React.FC<PositionBoardProps> = ({
  position,
  items,
  pool,
  hidePlatformRank,
  referenceLabel,
  addedIds,
  onChange,
}) => {
  const playersById = useMemo(() => new Map(pool.map(p => [p.id, p])), [pool]);
  const addedSet = useMemo(() => new Set(addedIds), [addedIds]);

  // Players carry a board ordinal; tier markers do not consume a number, so the
  // numbering a user sees runs 1..n across the whole position. Only count
  // players that will actually render — an item with no pooled player is
  // skipped below, and counting it would leave visible gaps in the numbering.
  const ordinals = useMemo(() => {
    const result = new Map<string, number>();
    let n = 0;
    for (const item of items) {
      if (item.kind === 'player' && playersById.has(item.playerId)) {
        result.set(item.playerId, ++n);
      }
    }
    return result;
  }, [items, playersById]);

  const tierCounts = useMemo(() => {
    const result = new Map<string, number>();
    let currentTier: string | null = null;
    for (const item of items) {
      if (item.kind === 'tier') {
        currentTier = item.tierId;
        result.set(currentTier, 0);
      } else if (currentTier) {
        result.set(currentTier, (result.get(currentTier) ?? 0) + 1);
      }
    }
    return result;
  }, [items]);

  const handleMove = useCallback(
    (key: string, delta: 1 | -1) => onChange(moveBy(items, key, delta)),
    [items, onChange]
  );

  const sensors = useSensors(
    // A small distance threshold keeps the handle's click behaviour usable.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Without a hold delay, touch-dragging swallows page scroll and the board
    // becomes unscrollable on a phone.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      onChange(moveItem(items, String(active.id), String(over.id)));
    },
    [items, onChange]
  );

  const sortableIds = useMemo(() => items.map(itemKey), [items]);

  if (!pool.length) {
    return (
      <EmptyState
        title={`No ${position} players available`}
        message='This league has no ranked players at this position yet.'
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${describe(active.id, items, playersById)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${describe(active.id, items, playersById)} is over position ${positionOf(over.id, items)} of ${items.length}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${describe(active.id, items, playersById)} dropped at position ${positionOf(over.id, items)} of ${items.length}.`
              : `${describe(active.id, items, playersById)} dropped.`,
          onDragCancel: ({ active }) => `Reordering ${describe(active.id, items, playersById)} cancelled.`,
        },
      }}
    >
      <div
        role='list'
        aria-label={`${position} rankings`}
        data-testid={`ranking-board-${position}`}
        className='rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => {
            const key = itemKey(item);
            const canMoveUp = index > 0;
            const canMoveDown = index < items.length - 1;

            if (item.kind === 'tier') {
              // Stored label and derived name stay separate all the way down:
              // the derived one is positional, so collapsing them here is what
              // previously let a renumbered tier write a stale name back.
              const placeholder = defaultTierLabel(items, item.tierId);
              return (
                <SortableRow key={key} id={key} handleLabel={`Reorder ${item.label?.trim() || placeholder}`}>
                  {dragHandle => (
                    <TierDividerRow
                      tierId={item.tierId}
                      label={item.label}
                      placeholder={placeholder}
                      playerCount={tierCounts.get(item.tierId) ?? 0}
                      canMoveUp={canMoveUp}
                      canMoveDown={canMoveDown}
                      onMoveUp={() => handleMove(key, -1)}
                      onMoveDown={() => handleMove(key, 1)}
                      onRename={newLabel => onChange(renameTier(items, item.tierId, newLabel))}
                      onRemove={() => onChange(removeTier(items, item.tierId))}
                      dragHandle={dragHandle}
                    />
                  )}
                </SortableRow>
              );
            }

            const player = playersById.get(item.playerId);
            if (!player) {
              return null;
            }

            return (
              <SortableRow key={key} id={key} handleLabel={`Reorder ${player.name}`}>
                {dragHandle => (
                  <PlayerRow
                    player={player}
                    ordinal={ordinals.get(item.playerId) ?? 0}
                    hidePlatformRank={hidePlatformRank}
                    referenceLabel={referenceLabel}
                    isNew={addedSet.has(item.playerId)}
                    canMoveUp={canMoveUp}
                    canMoveDown={canMoveDown}
                    onMoveUp={() => handleMove(key, -1)}
                    onMoveDown={() => handleMove(key, 1)}
                    onInsertTierAbove={() => onChange(insertTierBefore(items, key))}
                    dragHandle={dragHandle}
                  />
                )}
              </SortableRow>
            );
          })}
        </SortableContext>
      </div>
    </DndContext>
  );
};

/** Human-readable name for a dnd-kit id, for screen-reader announcements. */
function describe(
  id: string | number,
  items: CustomRankingItem[],
  playersById: Map<string, PoolPlayer>
): string {
  const key = String(id);
  const item = items.find(i => itemKey(i) === key);
  if (!item) return 'item';
  if (item.kind === 'tier') {
    return item.label?.trim() || defaultTierLabel(items, item.tierId);
  }
  return playersById.get(item.playerId)?.name ?? 'player';
}

function positionOf(id: string | number, items: CustomRankingItem[]): number {
  return items.findIndex(i => itemKey(i) === String(id)) + 1;
}

function defaultTierLabel(items: CustomRankingItem[], tierId: string): string {
  let n = 0;
  for (const item of items) {
    if (item.kind !== 'tier') continue;
    n += 1;
    if (item.tierId === tierId) break;
  }
  return `Tier ${n}`;
}

export default PositionBoard;
