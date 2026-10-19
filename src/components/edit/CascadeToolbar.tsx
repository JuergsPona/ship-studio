import type { RefObject } from 'react';
import {
  ContractVerticalIcon,
  ExpandVerticalIcon,
  SearchIcon,
  SortVerticalDownIcon,
  SortVerticalUpIcon,
} from '@/components/icons';
import { useCommands } from '../../commands/useCommands';
import { IconButton } from '../primitives/IconButton';
import type { CascadeDisplayOrder } from '../../lib/cascadePresentation';

interface Props {
  searchOpen: boolean;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  searchFieldId: string;
  onSearchOpen: () => void;
  onSearchToggle: () => void;
  order: CascadeDisplayOrder;
  onOrderChange: (order: CascadeDisplayOrder) => void;
  allCollapsed: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

/** Search, display-order, and all-card controls for the CSS cascade. */
export function CascadeToolbar({
  searchOpen,
  searchButtonRef,
  searchFieldId,
  onSearchOpen,
  onSearchToggle,
  order,
  onOrderChange,
  allCollapsed,
  onCollapseAll,
  onExpandAll,
}: Props) {
  const toggleOrder = () => onOrderChange(order === 'newest-top' ? 'newest-bottom' : 'newest-top');

  useCommands(
    () => [
      {
        id: 'cssCascade.focusSearch',
        title: 'Search CSS rules',
        icon: <SearchIcon size={14} />,
        category: 'action',
        when: 'project',
        keywords: ['selector', 'property', 'value', 'filter'],
        run: onSearchOpen,
      },
      {
        id: 'cssCascade.toggleOrder',
        title:
          order === 'newest-top'
            ? 'Show newest CSS rules at the bottom'
            : 'Show newest CSS rules at the top',
        category: 'action',
        when: 'project',
        keywords: ['reverse', 'sort', 'cascade', 'order'],
        run: toggleOrder,
      },
      {
        id: 'cssCascade.collapseAll',
        title: 'Collapse all CSS selector cards',
        category: 'action',
        when: 'project',
        keywords: ['rules', 'media query', 'minimize'],
        run: onCollapseAll,
      },
      {
        id: 'cssCascade.expandAll',
        title: 'Expand all CSS selector cards',
        category: 'action',
        when: 'project',
        keywords: ['rules', 'media query', 'show'],
        run: onExpandAll,
      },
    ],
    [order, onOrderChange, onCollapseAll, onExpandAll, onSearchOpen]
  );

  return (
    <div className="ss-cascade-toolbar" role="group" aria-label="CSS cascade controls">
      <IconButton
        ref={searchButtonRef}
        variant="ghost"
        size="compact"
        className="ss-cascade-toolbar__search-trigger"
        aria-label={searchOpen ? 'Close CSS search' : 'Search CSS rules'}
        aria-controls={searchOpen ? searchFieldId : undefined}
        aria-expanded={searchOpen}
        title={searchOpen ? 'Close CSS search' : 'Search CSS rules'}
        icon={<SearchIcon size={11} />}
        onClick={onSearchToggle}
      />

      <IconButton
        variant="ghost"
        size="compact"
        className="button--icon-only ss-cascade-toolbar__order"
        aria-label={
          order === 'newest-top'
            ? 'CSS rule order: newest at top. Change to newest at bottom'
            : 'CSS rule order: newest at bottom. Change to newest at top'
        }
        title={
          order === 'newest-top'
            ? 'Newest rules at top — change to newest at bottom'
            : 'Newest rules at bottom — change to newest at top'
        }
        icon={
          order === 'newest-top' ? (
            <SortVerticalUpIcon size={14} />
          ) : (
            <SortVerticalDownIcon size={14} />
          )
        }
        onClick={toggleOrder}
      />

      <IconButton
        variant="ghost"
        size="compact"
        className="button--icon-only ss-cascade-toolbar__collapse"
        aria-label={
          allCollapsed ? 'Expand all CSS selector cards' : 'Collapse all CSS selector cards'
        }
        title={allCollapsed ? 'Expand all selector cards' : 'Collapse all selector cards'}
        icon={allCollapsed ? <ExpandVerticalIcon size={14} /> : <ContractVerticalIcon size={14} />}
        onClick={allCollapsed ? onExpandAll : onCollapseAll}
      />
    </div>
  );
}
