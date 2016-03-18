## `decompress-implode`: EXPLODE implementation in JavaScript

A direct port of Info-Zip's EXPLODE algorithm to JavaScript. [Based on the version in this release of Info-Zip.](https://downloads.sourceforge.net/project/infozip/UnZip%206.x%20%28latest%29/UnZip%206.0/unzip60.tar.gz)

It appears to work, but I need some test files that exercise the code base!

Prereqs:

```
$ npm i -g typescript sweet.js
$ # In Git repository directory
$ npm install
```

Building:

```
$ tsc
$ sjs -m ./macros/macros.js ./build/explode.js -o ./build/explode.js
```

...or simply run `./make.sh`

Running:

```
$ node build/extract.js [path to zip file] [file to extract]
```

Porting Comments:

We emulate pointers and pointer arithmetic with the `Ptr` `class`, which
takes an array and an offset into the array. `extract.ts` and `inflate.ts`
extensively use pointers into Huffman tables as well as pointer arithmetic
to iterate through table values!

To reduce object allocations, most `Ptr` manipulations edit the value of
an existing `Ptr` rather than create a new one. As a result, developers
must be cognizant of `Ptr` aliasing; if two places contain the same `Ptr`
object, then manipulating one will change the other!

It's possible that this is the current source of a bug.
