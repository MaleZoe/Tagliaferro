// api/index.js — Serverless entry point para Vercel.
// Importa el servidor Express del backend y lo expone como handler serverless.
const app = require('../backend/server');

module.exports = app;
