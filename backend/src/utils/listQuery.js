const { z } = require('zod');

const MAX_LIMIT = 100;

/** Zod shape for the common list parameters; modules extend it with their own filters. */
const listQueryShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
  sort: z.string().trim().max(50).optional(),
  q: z.string().trim().max(100).optional(),
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" match across several fields. */
function searchFilter(q, fields) {
  if (!q) return {};
  const pattern = new RegExp(escapeRegex(q), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

/**
 * Turns "?sort=-eventDate" into a Mongo sort, allowing only whitelisted fields.
 * @param {string|undefined} sort
 * @param {Record<string,string>} allowed map of public sort key → document path
 * @param {Record<string,1|-1>} fallback
 */
function buildSort(sort, allowed, fallback) {
  if (!sort) return fallback;
  const descending = sort.startsWith('-');
  const key = descending ? sort.slice(1) : sort;
  const path = allowed[key];
  if (!path) return fallback;
  return { [path]: descending ? -1 : 1, _id: descending ? -1 : 1 };
}

/**
 * Runs a paginated find.
 * @returns {Promise<{ data: object[], meta: { page:number, limit:number, total:number, totalPages:number } }>}
 */
async function paginate(model, filter, { page, limit, sort, populate, select }) {
  let query = model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (select) query = query.select(select);
  for (const entry of [].concat(populate ?? [])) query = query.populate(entry);
  const [data, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return { data, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

/** Adds an inclusive date-only range condition on `field` when from/to are provided. */
function dateRangeFilter(field, from, to) {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { [field]: range };
}

module.exports = { listQueryShape, escapeRegex, searchFilter, buildSort, paginate, dateRangeFilter, MAX_LIMIT };
