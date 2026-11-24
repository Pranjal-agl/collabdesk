// Admin audit trail. Server enforces ADMIN role + tenant scoping; this page
// just renders what it's allowed to see.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { AuditLog } from '../lib/types';
import { timeAgo } from '../lib/utils';
import { Button, EmptyState, Eyebrow, Skeleton } from '../components/ui';

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const page = await api.listAuditLogs(0, 100);
      setLogs(page.content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audit log');
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Admin</Eyebrow>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Audit log</h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-500">
            Every mutation, attributed and timestamped. Row-scoped to your tenant and visible only to admins — enforced twice, in the role check and in the query.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
          Refresh
        </Button>
      </header>

      {logs === null ? (
        <Skeleton className="h-96 w-full" />
      ) : logs.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-8 w-8" aria-hidden="true" />} title="Nothing logged yet" hint="Create or move an issue and it will show up here." />
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <th scope="col" className="px-5 py-3 font-medium">When</th>
                <th scope="col" className="px-5 py-3 font-medium">Actor</th>
                <th scope="col" className="px-5 py-3 font-medium">Action</th>
                <th scope="col" className="hidden px-5 py-3 font-medium md:table-cell">Resource</th>
                <th scope="col" className="hidden px-5 py-3 font-medium lg:table-cell">Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <motion.tr
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.03, 0.4) }}
                  className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-slate-400">{timeAgo(log.createdAt)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-300">{shortId(log.actorId)}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3 font-mono text-xs text-slate-500 md:table-cell">
                    {log.resourceType} {log.resourceId ? shortId(log.resourceId) : ''}
                  </td>
                  <td className="hidden max-w-[280px] truncate px-5 py-3 font-mono text-xs text-slate-500 lg:table-cell">{log.payload ?? '—'}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function shortId(id: string): string {
  return id ? `${id.slice(0, 8)}…` : '—';
}
