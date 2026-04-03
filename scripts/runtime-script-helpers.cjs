const path = require('path')

function parsePort(value, fallback) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback
}

function resolveRepoFile(baseDir, fileName) {
  return path.join(baseDir, fileName)
}

module.exports = {
  parsePort,
  resolveRepoFile
}
