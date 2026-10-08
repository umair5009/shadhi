// Bridge to the ESM modules in /shared (Node ≥ 22.12 can require synchronous ES modules).
const constants = require('../../../shared/constants.js');
const finance = require('../../../shared/bookingFinance.js');
const format = require('../../../shared/format.js');

module.exports = { ...constants, ...finance, ...format };
