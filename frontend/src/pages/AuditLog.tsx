// Admin audit trail, read as a ledger grouped by day. The server enforces the
// ADMIN role and tenant scoping; this page renders what it's allowed to see.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { AuditLog as AuditEntry } from '../lib/types';
import { describeAction, describePayload, firstName, formatClock, personInk, personName } from '../lib/utils';
import { Avatar, Button, EmptyState, Segmented, Skeleton } from '../components/ui';

const FILTERS = ['ALL', 'ISSUE', 'COMMENT', 'PROJECT'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { ALL: 'Everything', ISSUE: 'Issues', COMMENT: 'Comments', PROJECT: 'Projects' };

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const page = await api.listAuditLogs(0, 100);
      setLogs(page.content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t load the audit log');
      if (!silent) setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const groups = useMemo(() => {
    const visible = (logs ?? [])
      .filter((log) => filter === 'ALL' || log.resourceType === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const byDay = new Map<string, AuditEntry[]>();
    for (const log of visible) {
      const key = dayLabel(log.createdAt);
      byDay.set(key, [...(byDay.get(key) ?? []), log]);
    }
    return [...byDay.entries()];
  }, [logs, filter]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="display-tight text-3xl sm:text-4xl">Audit log</h1>
          <p className="mt-3 max-w-[60ch] text-lg text-ink-soft">
            Every change in this workspace, who made it and when. Only admins can see this page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} render={(value) => FILTER_LABEL[value]} />
          <Button variant="ghost" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
            Refresh
          </Button>
        </div>
      </header>

      {logs === null ? (
        <Skeleton className="h-96 w-full" />
      ) : groups.length === 0 ? (
        <EmptyState
          title={filter === 'ALL' ? 'Nothing recorded yet' : `No ${FILTER_LABEL[filter].toLowerCase()} changes yet`}
          hint="Create or move an issue and it shows up here within a few seconds."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([day, entries]) => (
            <section key={day} aria-label={day}>
              <h2 className="display mb-2 text-xl">{day}</h2>
              <ol className="paper divide-y divide-rule/60 overflow-hidden">
                <AnimatePresence initial={false}>
                {entries.map((log) => {
                  const who = personName(log.actorId);
                  const detail = describePayload(log.payload);
                  return (
                    <motion.li
                      key={log.id}
                      layout
                      initial={{ opacity: 0, height: 0, backgroundColor: 'rgba(228,240,74,0.8)' }}
                      animate={{ opacity: 1, height: 'auto', backgroundColor: 'rgba(228,240,74,0)' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 30, backgroundColor: { duration: 2.2 } }}
                      className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[5rem_minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline">
                      <time dateTime={log.createdAt} className="font-mono text-xs text-graphite">
                        {formatClock(log.createdAt)}
                      </time>
                      <p className="flex items-center gap-2">
                        <Avatar name={who} seed={log.actorId} size="xs" />
                        <span className="font-semibold" style={{ color: personInk(log.actorId) }}>
                          {firstName(who)}
                        </span>
                        <span className="text-ink-soft">{describeAction(log.action, log.resourceType)}</span>
                      </p>
                      <p className="col-start-2 truncate text-ink-soft sm:col-start-3" title={detail}>
                        {detail || <span className="text-graphite">No details</span>}
                      </p>
                    </motion.li>
                  );
                })}
                </AnimatePresence>
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
