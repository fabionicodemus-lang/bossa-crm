'use client';

import { useEffect, useState } from 'react';
import { AgendaCalendar } from '@/components/AgendaCalendar';

type Member = { user_id: string; full_name: string; email: string; role: string };

export function AgendaCalendarWithSync(props: { members: Member[]; currentUserId: string; canEdit: boolean }) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('bossa-agenda-synced', refresh);
    return () => window.removeEventListener('bossa-agenda-synced', refresh);
  }, []);
  return <AgendaCalendar key={revision} {...props} />;
}
