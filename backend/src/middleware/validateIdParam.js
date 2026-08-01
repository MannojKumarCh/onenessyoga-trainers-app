function validateIdParam(req, res, next, value) {
  if (!/^\d+$/.test(value)) {
    const err = new Error('Invalid id parameter');
    err.status = 400;
    return next(err);
  }
  next();
}

module.exports = validateIdParam;
