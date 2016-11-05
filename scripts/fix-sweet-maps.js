const fs = require('fs');
const path = require('path');
const distPath = path.resolve(__dirname, '..', 'dist');
function fixMap(mapPath) {
  const map = JSON.parse(
    fs.readFileSync(mapPath, 'utf8')
  );
  map.sources = [path.join('..', map.sources[0])];
  fs.writeFileSync(mapPath, JSON.stringify(map));
}
fixMap(path.resolve(distPath, 'browserfs-zipfs-extras.js.map'));
fixMap(path.resolve(distPath, 'browserfs-zipfs-extras-node.js.map'));
