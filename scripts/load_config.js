/* Evaluate the CONFIG block of a game's source so simulations use the shipped values. */
const fs = require('fs');
const path = require('path');
module.exports = function loadConfig(gameDir) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'games', gameDir, 'game.js'), 'utf8');
  const m = src.match(/\/\*CONFIG\*\/([\s\S]*?)\/\*END CONFIG\*\//);
  if (!m) throw new Error(`no CONFIG block in ${gameDir}`);
  return new Function('AS', m[1] + '\nreturn CONFIG;')({ config: (o) => o });
};
