// api/index.js — Serverless entry point para Vercel.
// Carga el servidor Express desde backend/server.js y lo expone como handler.
const app = require('../backend/server');

module.exports = app;
