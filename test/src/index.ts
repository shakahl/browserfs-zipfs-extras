interface FixtureMetadata {
  size: number;
  crc: number;
}

describe("Decompression", function() {
  const mfs = new BrowserFS.FileSystem.MountableFileSystem();
  const fs = BrowserFS.BFSRequire('fs');
  const path = BrowserFS.BFSRequire('path');
  const xhrfs = new BrowserFS.FileSystem.XmlHttpRequest('listings.json', '/base/test/fixtures');
  // Use the zip file w/o compression as the gold standard.
  const goldStandard = "PKZ204E0.ZIP";
  const correctData = new Map<string, FixtureMetadata>();
  mfs.mount('/fixtures', xhrfs);
  BrowserFS.initialize(mfs);

  before(function(done) {
    fs.readFile(`/fixtures/${goldStandard}`, (err, data) => {
      if (err) {
        done(err);
      } else {
        mfs.mount('/gold_standard', new BrowserFS.FileSystem.ZipFS(data, goldStandard));
        let empty = true;
        // Fixture contains no directories, just a listing of files.
        fs.readdirSync('/gold_standard').forEach((f) => {
          empty = false;
          try {
            const data = fs.readFileSync(`/gold_standard/${f}`);
            correctData.set(f, {
              size: data.length,
              crc: crc32(data)
            });
          } catch (e) {
            done(e);
          }
        });
        if (empty) {
          done(new Error("No files found in gold standard zip file!"));
        } else {
          done();
        }
      }
    });
  });

  fs.readdirSync('/fixtures').filter((f) => path.extname(f).toLowerCase() === '.zip' && f !== goldStandard).forEach((f) => {
    it(`${f} should be correct`, function(done) {
      fs.readFile(`/fixtures/${f}`, (err, data) => {
        if (err) {
          done(err);
        } else {
          mfs.mount(`/${f}`, new BrowserFS.FileSystem.ZipFS(data, f));
          let passed: number = 0;
          fs.readdirSync(`/${f}`).forEach((p) => {
            try {
              const data = fs.readFileSync(`/${f}/${p}`);
              const info = correctData.get(p);
              if (!info) {
                done(new Error(`Could not find gold standard data for file ${p}`));
              } else {
                if (info.size !== data.length) {
                  done(new Error(`Incorrect size for file ${p}: ${data.length} != ${info.size}`));
                } else {
                  const hash = crc32(data);
                  if (hash !== info.crc) {
                    done(new Error(`CRCs do not match for file ${p}: ${hash} != ${info.crc}`));
                  } else {
                    passed++;
                  }
                }
              }
            } catch (e) {
              done(e);
            }
          });
          if (passed < correctData.size) {
            done(new Error(`${f} is missing files.`));
          } else {
            done();
          }
        }
      });
    });
  });
});