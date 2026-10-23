const harness = () => globalThis.__agendaHarness;
export async function getCurrentContext() { return harness().context; }
export async function createClient() { harness().sessionClients++; return harness().db; }
export function createAdminClient() { throw new Error('Human agenda route must not bypass the session with admin access'); }
export async function findAgendaConflicts(input) {
  harness().availability.push(input);
  if (harness().availabilityError) throw new Error('availability unavailable');
  return harness().conflicts;
}
export async function pushMicrosoftEvent(event) {
  harness().pushes.push(event);
  if (harness().syncError) throw new Error('Outlook unavailable');
  return 'synced';
}
export async function deleteMicrosoftEvent(event) {
  harness().cancellations.push(event);
  if (harness().syncError) throw new Error('Outlook unavailable');
}
