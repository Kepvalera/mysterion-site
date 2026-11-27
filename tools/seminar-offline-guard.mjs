// Test processes may only use the explicit fixture interceptors installed later.
globalThis.fetch=async()=>{throw Error('Unexpected network request in isolated tests')};
