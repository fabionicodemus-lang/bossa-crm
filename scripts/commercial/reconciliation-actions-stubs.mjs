export const revalidatePath = path => globalThis.reconciliationActionFixture.revalidated.push(path);
export const redirect = url => { throw Object.assign(new Error('REDIRECT'), { url }); };
export const getCurrentContext = async () => globalThis.reconciliationActionFixture.context;
export const createClient = async () => globalThis.reconciliationActionFixture.db ?? ({
  rpc: async (name, params) => {
    const fixture = globalThis.reconciliationActionFixture;
    fixture.calls.push({ name, params });
    return { data: fixture.result, error: fixture.error };
  },
});
