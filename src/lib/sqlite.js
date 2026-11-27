// Loads SQLite (sql.js, WebAssembly) only when someone imports from EasyWorship, so start-up stays fast.
let ready = null;
export async function sqlite() {
  if (!ready) {
    ready = (async () => {
      const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
        import('sql.js/dist/sql-wasm-browser.js'),
        import('sql.js/dist/sql-wasm-browser.wasm?url')
      ]);
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      return (bytes) => new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    })();
  }
  return ready;
}
