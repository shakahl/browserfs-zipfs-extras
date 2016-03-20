/*---------------------------------------------------------------------------

  unreduce.c

  The Reducing algorithm is actually a combination of two distinct algorithms.
  The first algorithm compresses repeated byte sequences, and the second al-
  gorithm takes the compressed stream from the first algorithm and applies a
  probabilistic compression method.

     * Copyright 1989 Samuel H. Smith;  All rights reserved
     *
     * Do not distribute modified versions without my permission.
     * Do not remove or alter this notice or any other copyright notice.
     * If you use this in your own program you must distribute source code.
     * Do not use any of this in a commercial product.

  See the accompanying file "COPYING" in UnZip source and binary distributions
  for further information.  This code is NOT used unless USE_SMITH_CODE is
  explicitly defined (==> COPYRIGHT_CLEAN is not defined).

  ---------------------------------------------------------------------------*/

import ByteBuff from './bytebuff';
import Ptr from './ptr';
import {flush} from './inflate';
import {get_slide, release_slide} from './unzpriv';

/**************************************/
/*  UnReduce Defines, Typedefs, etc.  */
/**************************************/

const DLE = 144;

// typedef uch f_array[64];        /* for followers[256][64] */


/*******************************/
/*  UnReduce Global Constants  */
/*******************************/

const L_table = new Int16Array([0, 0x7f, 0x3f, 0x1f, 0x0f]);

const D_shift = new Int16Array([0, 0x07, 0x06, 0x05, 0x04]);

const D_mask = new Int16Array([0, 0x01, 0x03, 0x07, 0x0f]);

const B_table = new Int16Array([
8, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5,
 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6,
 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7,
 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
 8, 8, 8, 8]);


/*************************/
/*  Function unreduce()  */
/*************************/

function unreduce(compressionMethod: number, slide: Uint8Array, compressedData: ByteBuff, output: Uint8Array, ucsize: number): void   /* expand probabilistically reduced data */
{
    let lchar = 0;
    let nchar: number;
    let ExState = 0;
    let V = 0;
    let Len = 0;
    let s = ucsize;  /* number of bytes left to decompress */
    let w = 0;      /* position in output window slide[] */
    let u = 1;      /* true if slide[] unflushed */
    let Slen = new Uint8Array(256);

    // f_array *followers = (f_array *)(slide + 0x4000);
    let followers = new Ptr(slide, 0x4000);
    let factor = compressionMethod - 1;
    let outIndex = 0;

    LoadFollowers(compressedData, followers, Slen);

    while (s > 0 /* && (!zipeof) */) {
        if (Slen[lchar] == 0)
            nchar = compressedData.readBits(8);   /* ; */
        else {
            nchar = compressedData.readBits(1);   /* ; */
            if (nchar != 0)
                nchar = compressedData.readBits(8);       /* ; */
            else {
                let bitsneeded = B_table[Slen[lchar]];
                let follower = compressedData.readBits(bitsneeded);   /* ; */
                nchar = followers.getOffset((64 * lchar) + follower);
            }
        }
        /* expand the resulting byte */
        switch (ExState) {

        case 0:
            if (nchar != DLE) {
                s--;
                slide[w++] = nchar;
                if (w == 0x4000) {
                    flush(slide, output, outIndex, w);
                    outIndex += w;
                    w = u = 0;
                }
            }
            else
                ExState = 1;
            break;

        case 1:
            if (nchar != 0) {
                V = nchar;
                Len = V & L_table[factor];
                if (Len == L_table[factor])
                    ExState = 2;
                else
                    ExState = 3;
            } else {
                s--;
                slide[w++] = DLE;
                if (w == 0x4000)
                {
                  flush(slide, output, outIndex, w);
                  outIndex += w;
                  w = u = 0;
                }
                ExState = 0;
            }
            break;

        case 2:{
                Len += nchar;
                ExState = 3;
            }
            break;

        case 3:{
                let e: number;
                let n = Len + 3;
                let d = w - ((((V >> D_shift[factor]) &
                               D_mask[factor]) << 8) + nchar + 1);

                s -= n;
                do {
                  n -= (e = (e = 0x4000 - ((d &= 0x3fff) > w ? d : w)) > n ?
                        n : e);
                  if (u && w <= d)
                  {
                    for (let i = 0; i < e; i++) {
                      slide[w + i] = 0;
                    }
                    w += e;
                    d += e;
                  }
                  else
                    if (w - d < e)      /* (assume unsigned comparison) */
                      do {              /* slow to avoid memcpy() overlap */
                        slide[w++] = slide[d++];
                      } while (--e);
                    else
                    {
                      for (let i = 0; i < e; i++) {
                        slide[w + i] = slide[d + i];
                      }
                      w += e;
                      d += e;
                    }
                  if (w == 0x4000)
                  {
                    flush(slide, output, outIndex, w);
                    outIndex += w;
                    w = u = 0;
                  }
                } while (n);

                ExState = 0;
            }
            break;
        }

        /* store character for next iteration */
        lchar = nchar;
    }

    /* flush out slide */
    flush(slide, output, outIndex, w);
    outIndex += w;
}





/******************************/
/*  Function LoadFollowers()  */
/******************************/

function LoadFollowers(compressedData: ByteBuff, followers: Ptr<number>, Slen: Uint16Array): void
{
    let x: number;
    let i: number;

    for (x = 255; x >= 0; x--) {
        Slen[x] = compressedData.readBits(6);   /* ; */
        for (i = 0; i < Slen[x]; i++)
            followers.setOffset((64 * x) + i, compressedData.readBits(8));   /* ; */
    }
}

export = function(compressionMethod: number, compressedData: Uint8Array, output: Uint8Array, ucsize: number = output.byteLength): void {
  const slide = get_slide();
  unreduce(compressionMethod, slide, new ByteBuff(compressedData), output, ucsize);
  release_slide(slide);
}