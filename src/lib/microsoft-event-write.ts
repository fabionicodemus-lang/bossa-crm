/** Graph's transactionId is stable for every CREATE, not only Teams meetings. */
export function microsoftEventCreateOptions(event: { id: string; meeting_mode: string; microsoft_event_id?: string | null }) {
  if (event.microsoft_event_id) return {};
  return {
    transactionId: event.id,
    ...(event.meeting_mode === 'video' ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}),
  };
}
