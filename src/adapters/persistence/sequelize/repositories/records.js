const records = new WeakMap();

function toRecord(value) {
  if (Array.isArray(value)) return value.map(toRecord);
  if (!value || typeof value.get !== "function" || typeof value.update !== "function") return value;
  const record = Object.fromEntries(Object.entries(value.get()).map(([key, field]) => [key, toRecord(field)]));
  records.set(record, value);
  return record;
}

async function update(record, values, options) {
  const entity = records.get(record) || record;
  const updated = await entity.update(values, options);
  if (updated) Object.assign(record, toRecord(updated));
  else Object.assign(record, values);
  return record;
}

async function destroy(record, options) {
  return (records.get(record) || record).destroy(options);
}

module.exports = { toRecord, update, destroy };