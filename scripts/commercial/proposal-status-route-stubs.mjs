export async function getCurrentContext(){return globalThis.proposalStatusRouteFixture.context;}
export async function createClient(){return globalThis.proposalStatusRouteFixture.db;}
export async function POST(){throw Error('Agenda should not be called for proposal status recovery');}
export function manualPilot(){return globalThis.proposalStatusRouteFixture.manualPilot===true;}
