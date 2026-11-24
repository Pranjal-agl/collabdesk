// ⌘K / Ctrl+K: jump to any project or issue, or run an action, from anywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { lockScroll } from '../lib/smoothScroll';
import type { Issue, Project } from '../lib/types';
import { cn, STATUS_LABEL } from '../lib/utils';
import { Kbd, PriorityMark } from './ui';

type Item =
  | { kind: 'action'; id: string; label: string; hint?: string; run: () => void }
  | { kind: 'project'; id: string; label: string; project: Project }
  | { kind: 'issue'; id: string; label: string; issue: Issue; projectName: string };

export const OPEN_PALETTE_EVENT = 'collabdesk:open-palette';
export const NEW_ISSUE_EVENT = 'collabdesk:new-issue';

export function CommandPalette() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<{ issue: Issue; projectName: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) close();
        else show();
      }
    };
    const onOpen = () => show();
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [open, show, close]);

  // Load fresh data every time it opens: the board changes under us.
  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    setQuery('');
    setActive(0);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (cancelled) return;
        setProjects(list);
        const pages = await Promise.all(list.map((project) => api.listIssues(project.id).then((page) => ({ project, page }))));
        if (cancelled) return;
        setIssues(pages.flatMap(({ project, page }) => page.content.map((issue) => ({ issue, projectName: project.name }))));
      } catch {
        /* palette still offers actions */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelled = true;
      lockScroll(false);
    };
  }, [open]);

  const onBoard = /^\/projects\/[^/]+$/.test(location.pathname);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      ...(onBoard ? [{ kind: 'action' as const, id: 'new-issue', label: 'Add an issue to this board', hint: 'N', run: () => window.dispatchEvent(new Event(NEW_ISSUE_EVENT)) }] : []),
      { kind: 'action', id: 'projects', label: 'Go to all projects', run: () => navigate('/projects') },
      ...(user?.role === 'ADMIN' ? [{ kind: 'action' as const, id: 'audit', label: 'Open the audit log', run: () => navigate('/audit') }] : []),
      { kind: 'action', id: 'logout', label: 'Sign out', run: () => void logout() },
    ];
    const projectItems: Item[] = projects.map((project) => ({ kind: 'project', id: project.id, label: project.name, project }));
    const issueItems: Item[] = issues.map(({ issue, projectName }) => ({ kind: 'issue', id: issue.id, label: issue.title, issue, projectName }));

    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [...actions, ...projectItems, ...issueItems.slice(0, 8)];

    const score = (item: Item) => {
      const haystack = `${item.label} ${item.kind === 'issue' ? item.projectName : ''}`.toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return -1;
      return (item.label.toLowerCase().startsWith(terms[0]) ? 10 : 0) + (item.kind === 'project' ? 3 : item.kind === 'issue' ? 2 : 1);
    };
    return [...actions, ...projectItems, ...issueItems]
      .map((item) => ({ item, rank: score(item) }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 30)
      .map(({ item }) => item);
  }, [query, projects, issues, onBoard, user?.role, navigate, logout]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    if (item.kind === 'action') item.run();
    else if (item.kind === 'project') navigate(`/projects/${item.project.id}`, { state: { project: item.project } });
    else navigate(`/projects/${item.issue.projectId}/issues/${item.issue.id}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search and commands"
            className="paper relative w-full max-w-xl overflow-hidden shadow-lifted"
            initial={{ opacity: 0, y: -14, scale: 0.97, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <div className="flex items-center gap-3 border-b border-rule/70 px-4">
              <Search className="h-4 w-4 shrink-0 text-graphite" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((index) => Math.min(items.length - 1, index + 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((index) => Math.max(0, index - 1));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    choose(items[active]);
                  } else if (event.key === 'Escape') {
                    close();
                  }
                }}
                placeholder="Find a project or issue, or type a command"
                aria-label="Search"
                aria-controls="palette-results"
                aria-activedescendant={items[active] ? `palette-${items[active].kind}-${items[active].id}` : undefined}
                className="h-14 flex-1 bg-transparent text-lg text-ink placeholder:text-graphite focus-visible:outline-none"
              />
              {loading && <span className="text-xs text-graphite">Loading…</span>}
            </div>

            <ul id="palette-results" ref={listRef} role="listbox" data-lenis-prevent className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 ? (
                <li className="px-3 py-6 text-center text-graphite">Nothing matches “{query}”.</li>
              ) : (
                items.map((item, index) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    id={`palette-${item.kind}-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(item)}
                    className={cn('relative flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5', index === active ? 'text-card' : 'text-ink')}
                  >
                    {index === active && (
                      <motion.span layoutId="palette-active" className="absolute inset-0 -z-0 rounded-md bg-ink" transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
                    )}
                    <span className="relative z-10 w-16 shrink-0 text-xs opacity-70">
                      {item.kind === 'action' ? 'Do' : item.kind === 'project' ? 'Project' : 'Issue'}
                    </span>
                    <span className="relative z-10 min-w-0 flex-1 truncate">
                      {item.kind === 'project' ? <span className="display text-lg">{item.label}</span> : item.label}
                    </span>
                    {item.kind === 'issue' && (
                      <span className="relative z-10 flex shrink-0 items-center gap-2 text-xs opacity-75">
                        <PriorityMark priority={item.issue.priority} showLabel={false} inverse={index === active} />
                        {STATUS_LABEL[item.issue.status]}
                      </span>
                    )}
                    {item.kind === 'action' && item.hint && <span className="relative z-10"><Kbd>{item.hint}</Kbd></span>}
                    {index === active && <CornerDownLeft className="relative z-10 h-3.5 w-3.5 opacity-70" aria-hidden="true" />}
                  </li>
                ))
              )}
            </ul>
            <p className="flex items-center gap-3 border-t border-rule/70 px-4 py-2 text-xs text-graphite">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
              <span className="flex items-center gap-1"><Kbd>Enter</Kbd> to open</span>
              <span className="flex items-center gap-1"><Kbd>Esc</Kbd> to close</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
