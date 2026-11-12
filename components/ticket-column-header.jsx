'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { ArrowDown, ArrowDownUp, ArrowUp, Filter, X } from 'lucide-react';
import { useLanguage } from './language-provider';
import './ticket-column-header.css';

const FILTER_EVENT = 'servicedesk:ticket-column-filter';

export function TicketColumnHeader({
  label,
  sortAsc,
  sortDesc,
  sort,
  onSort,
  filterLabel,
  filterActive = false,
  children,
}) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const panelId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const sortable = !!(sortAsc && sortDesc && onSort);
  const ascending = sortable && sort === sortAsc;
  const descending = sortable && sort === sortDesc;
  const nextSort = ascending ? sortDesc : sortAsc;
  const SortIcon = ascending ? ArrowUp : descending ? ArrowDown : ArrowDownUp;
  const column = t(label);
  const filterName = filterLabel ? t(filterLabel) : t('Фильтр: {column}', { column });
  const sortName = t(ascending ? 'Сортировать по убыванию: {column}' : 'Сортировать по возрастанию: {column}', { column });

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function toggleFilter() {
    if (open) {
      close(true);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const width = Math.min(288, viewportWidth - 24);
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, viewportWidth - width - 12)),
      top: rect.bottom + 8,
      maxHeight: Math.max(0, window.innerHeight - 24),
    });
    window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: panelId }));
    window.dispatchEvent(new CustomEvent('servicedesk:header-menu', { detail: 'ticket-filter' }));
    setOpen(true);
  }

  function changeSort() {
    close();
    window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: null }));
    onSort(nextSort);
  }

  useEffect(() => { setOpen(false); }, [pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition(event) {
      if (event?.target && panelRef.current?.contains(event.target)) return;
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      if (anchor.right < 0 || anchor.left > window.innerWidth || anchor.bottom < 0 || anchor.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      const margin = 12;
      const gap = 8;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.min(288, viewportWidth - margin * 2);
      const below = Math.max(0, window.innerHeight - anchor.bottom - gap - margin);
      const above = Math.max(0, anchor.top - gap - margin);
      const placeAbove = below < panel.scrollHeight && above > below;
      const available = placeAbove ? above : below;
      const height = Math.min(panel.scrollHeight, available);
      setPosition({
        width,
        left: Math.max(margin, Math.min(anchor.left, viewportWidth - width - margin)),
        top: Math.max(margin, placeAbove ? anchor.top - gap - height : anchor.bottom + gap),
        maxHeight: available,
      });
    }
    reposition();
    const firstField = panelRef.current?.querySelector('select, input, textarea, [data-filter-control]');
    (firstField || panelRef.current)?.focus({ preventScroll: true });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event) {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }
    function otherFilter(event) {
      if (event.detail !== panelId) setOpen(false);
    }
    function headerMenu() { setOpen(false); }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener(FILTER_EVENT, otherFilter);
    window.addEventListener('servicedesk:header-menu', headerMenu);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener(FILTER_EVENT, otherFilter);
      window.removeEventListener('servicedesk:header-menu', headerMenu);
    };
  }, [open, panelId]);

  return (
    <th scope="col" className="ticket-column-header" aria-sort={ascending ? 'ascending' : descending ? 'descending' : 'none'}>
      <span className="ticket-column-controls">
        {sortable ? (
          <button type="button" className={`ticket-column-sort${ascending || descending ? ' is-active' : ''}`} aria-label={sortName} title={sortName} onClick={changeSort}>
            <span>{column}</span>
            <SortIcon size={13} aria-hidden="true" />
          </button>
        ) : <span>{column}</span>}
        {children && (
          <button
            type="button"
            className={`ticket-column-filter${filterActive ? ' is-active' : ''}`}
            ref={triggerRef}
            aria-label={filterActive ? t('Фильтр активен: {column}', { column }) : filterName}
            title={filterName}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={toggleFilter}
          >
            <Filter size={13} aria-hidden="true" />
            {filterActive && <span className="ticket-column-filter-dot" aria-hidden="true" />}
          </button>
        )}
      </span>
      {open && position && createPortal(
        <div id={panelId} ref={panelRef} role="dialog" aria-label={filterName} tabIndex={-1} className="ticket-column-popover" style={position}>
          <div className="ticket-column-popover-heading">
            <strong>{filterName}</strong>
            <button type="button" className="ticket-column-popover-close" aria-label={t('Закрыть фильтр')} onClick={() => close(true)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="ticket-column-popover-fields">{children}</div>
        </div>,
        document.body,
      )}
    </th>
  );
}

export default TicketColumnHeader;
