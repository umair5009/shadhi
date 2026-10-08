const ApiError = require('../utils/ApiError');

/**
 * Validates request parts with Zod schemas and exposes the parsed values on `req.valid`
 * (Express 5 makes req.query read-only, and parsed values carry coercions/transforms).
 * Field paths for the body are reported without a prefix so the web app can map them onto form fields.
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
function validate(schemas) {
  return (req, _res, next) => {
    const valid = {};
    const errors = [];
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          const path = part === 'body' ? issue.path : [part, ...issue.path];
          errors.push({ field: path.join('.'), message: issue.message });
        }
      }
    }
    if (errors.length) throw ApiError.unprocessable(errors[0].message, errors);
    req.valid = valid;
    next();
  };
}

module.exports = validate;
