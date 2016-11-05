# BrowserFS ZipFS Extras v1.0.1

Adds the following decompression algorithms to BrowserFS, which were used in
older versions of PKZip:

* EXPLODE and UNSHRINK (ported from Info-Zip's GPL2'd code)
* UNREDUCE (ported from [this GPL2 code](http://aluigi.altervista.org/papers/unreduce.c))

Although BrowserFS is licensed under the MIT license, this add-on library is
based on GPL2 code and is provided under the GPL2 license.

## Using

### Browser

Simply include [browserfs.js](https://github.com/jvilk/browserfs) and `browserfs-zipfs-extras.js` on the same page, and BrowserFS will know how to decompress these extra algorithms.
Make sure you include `browserfs.js` *first*.

### Node

Add both `browserfs` and `browserfs-zipfs-extras` as dependencies of your project. Then, simply `require` `browserfs-zipfs-extras` before you begin using `browserfs`.

```javascript
const BrowserFS = require('browserfs');
require('browserfs-zipfs-extras');
// Now you can use BrowserFS.
```

## Building

Requires a reasonably recent version of Node. Run:

```
$ npm install
```

## Running Tests

**NOTE: You must have [Git LFS](https://git-lfs.github.com/) installed and use it to clone the repository.**
We use Git LFS to manage our test fixtures, which are a bunch of zip files.

```
$ npm test
```

## Porting Comments

We emulate pointers and pointer arithmetic with the `Ptr` `class`, which
takes an array and an offset into the array. `extract.ts` and `inflate.ts`
extensively use pointers into Huffman tables as well as pointer arithmetic
to iterate through table values!

To reduce object allocations, most `Ptr` manipulations edit the value of
an existing `Ptr` rather than create a new one. As a result, developers
maintaining this project must be cognizant of `Ptr` aliasing; if two places
contain the same `Ptr` object, then manipulating one will change the other!
