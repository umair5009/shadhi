/**
 * Makes a financial document append-only: once created, only `allowedPaths` may change and it can never be deleted.
 * Guards both `doc.save()` and query updates so no code path can silently rewrite money history.
 */
function immutablePlugin(schema, { allowedPaths = [], label = 'This record' } = {}) {
  const allowed = new Set([...allowedPaths, 'updatedAt', 'updatedBy']);
  const isAllowed = (path) => [...allowed].some((root) => path === root || path.startsWith(`${root}.`));

  schema.pre('save', function guardSave() {
    if (this.isNew) return;
    const changed = this.modifiedPaths({ includeChildren: false }).filter((path) => !isAllowed(path));
    if (changed.length) throw new Error(`${label} cannot be changed (${changed.join(', ')})`);
  });

  const guardUpdate = function guardUpdate() {
    const update = this.getUpdate() ?? {};
    if (Array.isArray(update)) throw new Error(`${label} cannot be changed with pipeline updates`);
    const paths = [];
    for (const [key, value] of Object.entries(update)) {
      if (key.startsWith('$')) paths.push(...Object.keys(value ?? {}));
      else paths.push(key);
    }
    const blocked = paths.filter((path) => !isAllowed(path));
    if (blocked.length) throw new Error(`${label} cannot be changed (${blocked.join(', ')})`);
  };

  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], guardUpdate);
  schema.pre(['replaceOne', 'findOneAndReplace'], function blockReplace() {
    throw new Error(`${label} cannot be replaced`);
  });
  schema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { document: false, query: true }, function blockDelete() {
    throw new Error(`${label} cannot be deleted — void it instead`);
  });
  schema.pre('deleteOne', { document: true, query: false }, function blockDocDelete() {
    throw new Error(`${label} cannot be deleted — void it instead`);
  });
}

module.exports = immutablePlugin;
