'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface SortableRowProps {
  id: string;
  /** Announced on the drag handle, e.g. "Reorder Josh Allen". */
  handleLabel: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

/**
 * Wraps one board row in dnd-kit sortable behaviour and hands the row a drag
 * handle to place itself. Keeping this separate lets the row components stay
 * free of dnd-kit, so they render (and are testable) without a DndContext.
 */
const SortableRow: React.FC<SortableRowProps> = ({ id, handleLabel, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const handle = (
    <button
      type='button'
      aria-label={handleLabel}
      title={handleLabel}
      data-testid={`ranking-drag-handle-${id}`}
      className='shrink-0 w-5 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 touch-none'
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Above the fixed sidebar (z-50) so a dragged row is never hidden behind it.
        zIndex: isDragging ? 60 : undefined,
        position: isDragging ? 'relative' : undefined,
        opacity: isDragging ? 0.9 : undefined,
      }}
    >
      {children(handle)}
    </div>
  );
};

export default SortableRow;
