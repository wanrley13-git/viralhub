import { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Generic Supabase Realtime subscription hook.
 *
 * Subscribes to postgres_changes on a given table filtered by workspace_id.
 * Ignores events triggered by the current user (to avoid duplicating
 * optimistic updates already applied locally).
 *
 * @param {object} opts
 * @param {string}   opts.table           — Postgres table name
 * @param {number}   opts.workspaceId     — active workspace id (filter)
 * @param {number}   opts.currentUserId   — numeric profile id of the current user
 * @param {boolean}  opts.isPersonal      — true if the workspace is personal (skips subscription)
 * @param {function} [opts.onInsert]      — called with the new row
 * @param {function} [opts.onUpdate]      — called with the updated row
 * @param {function} [opts.onDelete]      — called with the old row (usually only { id })
 * @param {function} [opts.filter]        — optional extra filter on the row (return false to ignore)
 */
export default function useRealtimeSync({
  table,
  workspaceId,
  currentUserId,
  isPersonal,
  onInsert,
  onUpdate,
  onDelete,
  filter,
}) {
  // Keep callbacks in refs so the channel doesn't re-subscribe on every render
  const cbRef = useRef({ onInsert, onUpdate, onDelete, filter, currentUserId });
  cbRef.current = { onInsert, onUpdate, onDelete, filter, currentUserId };

  useEffect(() => {
    // Skip: no workspace, personal workspace, or missing user ID
    if (!workspaceId || isPersonal || !cbRef.current.currentUserId) return;

    const channelName = `realtime:${table}:ws${workspaceId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const { eventType } = payload;
          const row = payload.new || payload.old;
          if (!row) return;

          console.log(`[Realtime] event received: ${eventType} on ${table}`, row);

          // Ignore events from the current user (use loose equality — payload
          // values may arrive as strings while currentUserId is a number)
          const rowUserId = (payload.new ?? payload.old)?.user_id;
          // eslint-disable-next-line eqeqeq
          if (rowUserId != null && rowUserId == cbRef.current.currentUserId) return;

          // Optional extra filter (e.g. idea_type)
          if (cbRef.current.filter && !cbRef.current.filter(row, eventType)) return;

          if (eventType === 'INSERT' && cbRef.current.onInsert) {
            cbRef.current.onInsert(payload.new);
          } else if (eventType === 'UPDATE' && cbRef.current.onUpdate) {
            cbRef.current.onUpdate(payload.new);
          } else if (eventType === 'DELETE' && cbRef.current.onDelete) {
            cbRef.current.onDelete(payload.old);
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] ✓ subscribed to ${table} for workspace ${workspaceId}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[Realtime] ✗ failed to subscribe to ${table}:`, status, err);
        } else {
          console.log(`[Realtime] status ${status} on ${table}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, workspaceId, isPersonal]);
}
