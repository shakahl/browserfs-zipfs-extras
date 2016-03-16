#!/bin/sh

tsc
sjs -m ./macros/macros.js ./build/explode.js -o ./build/explode.js
