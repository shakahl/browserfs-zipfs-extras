/* explode.c -- Not copyrighted 1992 by Mark Adler
   version c7, 27 June 1992 */


/* You can do whatever you like with this source file, though I would
   prefer that if you modify it and redistribute it that you include
   comments to that effect with your name and the date.  Thank you.

   History:
   vers    date          who           what
   ----  ---------  --------------  ------------------------------------
    c1   30 Mar 92  M. Adler        explode that uses huft_build from inflate
                                    (this gives over a 70% speed improvement
                                    over the original unimplode.c, which
                                    decoded a bit at a time)
    c2    4 Apr 92  M. Adler        fixed bug for file sizes a multiple of 32k.
    c3   10 Apr 92  M. Adler        added a little memory tracking if DEBUG
    c4   11 Apr 92  M. Adler        added NOMEMCPY do kill use of memcpy()
    c5   21 Apr 92  M. Adler        added the WSIZE #define to allow reducing
                                    the 32K window size for specialized
                                    applications.
    c6   31 May 92  M. Adler        added typecasts to eliminate some warnings
    c7   27 Jun 92  G. Roelofs      added more typecasts
    c8   16 Mar 16  J. Vilk         converted to TypeScript
 */


/*
   Explode imploded (PKZIP method 6 compressed) data.  This compression
   method searches for as much of the current string of bytes (up to a length
   of ~320) in the previous 4K or 8K bytes.  If it doesn't find any matches
   (of at least length 2 or 3), it codes the next byte.  Otherwise, it codes
   the length of the matched string and its distance backwards from the
   current position.  Single bytes ("literals") are preceded by a one (a
   single bit) and are either uncoded (the eight bits go directly into the
   compressed stream for a total of nine bits) or Huffman coded with a
   supplied literal code tree.  If literals are coded, then the minimum match
   length is three, otherwise it is two.

   There are therefore four kinds of imploded streams: 8K search with coded
   literals (min match = 3), 4K search with coded literals (min match = 3),
   8K with uncoded literals (min match = 2), and 4K with uncoded literals
   (min match = 2).  The kind of stream is identified in two bits of a
   general purpose bit flag that is outside of the compressed stream.

   Distance-length pairs are always coded.  Distance-length pairs for matched
   strings are preceded by a zero bit (to distinguish them from literals) and
   are always coded.  The distance comes first and is either the low six (4K)
   or low seven (8K) bits of the distance (uncoded), followed by the high six
   bits of the distance coded.  Then the length is six bits coded (0..63 +
   min match length), and if the maximum such length is coded, then it's
   followed by another eight bits (uncoded) to be added to the coded length.
   This gives a match length range of 2..320 or 3..321 bytes.

   The literal, length, and distance codes are all represented in a slightly
   compressed form themselves.  What is sent are the lengths of the codes for
   each value, which is sufficient to construct the codes.  Each byte of the
   code representation is the code length (the low four bits representing
   1..16), and the number of values sequentially with that length (the high
   four bits also representing 1..16).  There are 256 literal code values (if
   literals are coded), 64 length code values, and 64 distance code values,
   in that order at the beginning of the compressed stream.  Each set of code
   values is preceded (redundantly) with a byte indicating how many bytes are
   in the code description that follows, in the range 1..256.

   The codes themselves are decoded using tables made by huft_build() from
   the bit lengths.  That routine and its comments are in the inflate.ts
   module.
 */

import ByteBuff from './bytebuff';
import {mask_bits, get_slide, release_slide} from './unzip';
import {flush, huft, huft_build} from './inflate';
import Ptr from './ptr';

const WSIZE = 0x8000;  /* window size--must be a power of two, and at least
                           8K for zip's implode method */


/* The implode algorithm uses a sliding 4K or 8K byte window on the
   uncompressed stream to find repeated byte strings.  This is implemented
   here as a circular buffer.  The index is updated simply by incrementing
   and then and'ing with 0x0fff (4K-1) or 0x1fff (8K-1).  Here, the 32K
   buffer of inflate is used, and it works just as well to always have
   a 32K circular buffer, so the index is anded with 0x7fff.  This is
   done to allow the window to also be used as the output buffer. */
/* This must be supplied in an external module useable like "byte slide[8192];"
   or "byte *slide;", where the latter would be malloc'ed.  In unzip, slide[]
   is actually a 32K area for use by inflate, which uses a 32K sliding window.
 */


/* Tables for length and distance */
const cplen2: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
        18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
        35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
        52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65];
const cplen3: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
        19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
        36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
        53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66];
const extra: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        8];
const cpdist4: number[] = [1, 65, 129, 193, 257, 321, 385, 449, 513, 577, 641, 705,
        769, 833, 897, 961, 1025, 1089, 1153, 1217, 1281, 1345, 1409, 1473,
        1537, 1601, 1665, 1729, 1793, 1857, 1921, 1985, 2049, 2113, 2177,
        2241, 2305, 2369, 2433, 2497, 2561, 2625, 2689, 2753, 2817, 2881,
        2945, 3009, 3073, 3137, 3201, 3265, 3329, 3393, 3457, 3521, 3585,
        3649, 3713, 3777, 3841, 3905, 3969, 4033];
const cpdist8: number[] = [1, 129, 257, 385, 513, 641, 769, 897, 1025, 1153, 1281,
        1409, 1537, 1665, 1793, 1921, 2049, 2177, 2305, 2433, 2561, 2689,
        2817, 2945, 3073, 3201, 3329, 3457, 3585, 3713, 3841, 3969, 4097,
        4225, 4353, 4481, 4609, 4737, 4865, 4993, 5121, 5249, 5377, 5505,
        5633, 5761, 5889, 6017, 6145, 6273, 6401, 6529, 6657, 6785, 6913,
        7041, 7169, 7297, 7425, 7553, 7681, 7809, 7937, 8065];



//extern UWORD bytebuf;           /* (use the one in inflate.c) */

/**
 * Get the bit lengths for a code representation from the compressed
 * stream.  If get_tree() returns 4, then there is an error in the data.
 * Otherwise zero is returned.
 * @param l bit lengths
 * @param n number expected
 */
function get_tree(byteBuff: ByteBuff, l: number[], n: number): number {
  let i: number;           /* bytes remaining in list */
  let j: number;           /* number of codes */
  let k: number;           /* lengths entered */
  let b: number;           /* bit length for those codes */


  i = byteBuff.readByte() + 1;          /* length/count pairs to read */
  k = 0;                                /* next code */
  do {
    const byte = byteBuff.readByte();
    b = ((j = byte) & 0xf) + 1;         /* bits in code (1..16) */
    j = ((j & 0xf0) >> 4) + 1;          /* codes with those bits (1..16) */
    if (k + j > n)
      return 4;                         /* don't overflow l[] */
    do {
      l[k++] = b;
    } while (--j);
  } while (--i);
  return k != n ? 4 : 0;                /* should have read n of them */
}


/**
 * Decompress the imploded data using coded literals and an 8K sliding
 * window.
 * @param byteBuff Buffer of bytes to decompress.
 * @param ucsize Size of byteBuff uncompressed.
 * @param tb literal table
 * @param tl length table
 * @param td distance table
 * @param bb number of bits encoded by literal table
 * @param bl number of bits encoded by length table
 * @param bb number of bits encoded by distance table
 */
function explode_lit8(byteBuff: ByteBuff, output: Uint8Array, ucsize: number, tb: Ptr<huft>, tl: Ptr<huft>, td: Ptr<huft>, bb: number, bl: number, bd: number): number {
  let s: number;        /* bytes to decompress */
  let e: number;        /* table entry flag/number of extra bits */
  let n: number,        /* length and index for copy */
    d: number;
  let w: number;        /* current window position */
  let t: Ptr<huft> = new Ptr<huft>(null, null); /* pointer to table entry */
  let mb: number,       /* masks for bb, bl, and bd bits */
    ml: number,
    md: number;
  let b: number;        /* bit buffer */
  let k: number;        /* number of bits in bit buffer */
  let u: number;        /* true if unflushed */
  const slide = get_slide();
  let outcnt = 0;
  let _b: number;


  /* explode the coded data */
  b = k = w = 0;                /* initialize bit buffer, window */
  u = 1;                        /* buffer unflushed */
  mb = mask_bits[bb];           /* precompute masks for speed */
  ml = mask_bits[bl];
  md = mask_bits[bd];
  s = ucsize;
  while (s > 0)                 /* do until ucsize bytes uncompressed */
  {
    NEEDBITS(1, byteBuff, k, b)
    if (b & 1)                  /* then literal--decode it */
    {
      DUMPBITS(1, k, b)
      s--;
      NEEDBITS(bb, byteBuff, k, b)              /* get coded literal */
      if ((e = (tb.addInto(t, (~b) & mb)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).add((~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b);
      slide[w++] = t.get().v as number;
      if (w == WSIZE)
      {
        outcnt = flush(slide, output, outcnt, w);
        w = u = 0;
      }
    }
    else                        /* else distance/length */
    {
      DUMPBITS(1, k, b)
      NEEDBITS(7, byteBuff, k, b)               /* get distance low bits */
      d = b & 0x7f;
      DUMPBITS(7, k, b)
      NEEDBITS(bd, byteBuff, k, b)    /* get coded distance high bits */
      if ((e = (td.addInto(t, (~b) & md)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      d = w - d - (t.get().v as number);       /* construct offset */
      NEEDBITS(bl, byteBuff, k, b)    /* get coded length */
      if ((e = (tl.addInto(t, (~b) & ml)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      n = t.get().v as number;
      if (e)                    /* get length extra bits */
      {
        NEEDBITS(8, byteBuff, k, b)
        n += b & 0xff;
        DUMPBITS(8, k, b)
      }

      /* do the copy */
      s -= n;
      do {
        n -= (e = (e = WSIZE - ((d &= WSIZE-1) > w ? d : w)) > n ? n : e);
        if (u && w <= d)
        {
          // memset(slide + w, 0, e);
          for (let i = 0; i < e; i++) {
            slide[w + i] = 0;
          }
          w += e;
          d += e;
        }
        else
            do {
              slide[w++] = slide[d++];
            } while (--e);
        if (w == WSIZE)
        {
          outcnt = flush(slide, output, outcnt, w);
          w = u = 0;
        }
      } while (n);
    }
  }

  /* flush out slide */
  outcnt = flush(slide, output, outcnt, w);
  release_slide(slide);
  return byteBuff.eof() ? 0 : 5;         /* should have read csize bytes */
}

/**
 * Decompress the imploded data using coded literals and a 4K sliding
 * window.
 * @param byteBuff Byte buffer containing compressed bits.
 * @param ucsize Byte buffer uncompressed size.
 * @param tb literal table
 * @param tl length table
 * @param td distance table
 * @param bb number of bits encoded by literal table
 * @param bl number of bits encoded by length table
 * @param bb number of bits encoded by distance table
 */
function explode_lit4(byteBuff: ByteBuff, output: Uint8Array, ucsize: number, tb: Ptr<huft>, tl: Ptr<huft>, td: Ptr<huft>, bb: number, bl: number, bd: number): number {
  let s: number;        /* bytes to decompress */
  let e: number;        /* table entry flag/number of extra bits */
  let n: number,        /* length and index for copy */
    d: number;
  let w: number;        /* current window position */
  let t: Ptr<huft> = new Ptr<huft>(null, null); /* pointer to table entry */
  let mb: number,       /* masks for bb, bl, and bd bits */
    ml: number,
    md: number;
  let b: number;        /* bit buffer */
  let k: number;        /* number of bits in bit buffer */
  let u: number;        /* true if unflushed */
  const slide = get_slide();
  let outcnt = 0;
  let _b: number;

  /* explode the coded data */
  b = k = w = 0;                /* initialize bit buffer, window */
  u = 1;                        /* buffer unflushed */
  mb = mask_bits[bb];           /* precompute masks for speed */
  ml = mask_bits[bl];
  md = mask_bits[bd];
  s = ucsize;
  while (s > 0)                 /* do until ucsize bytes uncompressed */
  {
    NEEDBITS(1, byteBuff, k, b)
    if (b & 1)                  /* then literal--decode it */
    {
      DUMPBITS(1, k, b)
      s--;
      NEEDBITS(bb, byteBuff, k, b)    /* get coded literal */
      if ((e = (tb.addInto(t, (~b) & mb)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = ((t.get().v as Ptr<huft>).addInto(t,(~b) & mask_bits[e])).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      slide[w++] = t.get().v as number;
      if (w == WSIZE)
      {
        outcnt = flush(slide, output, outcnt, w);
        w = u = 0;
      }
    }
    else                        /* else distance/length */
    {
      DUMPBITS(1, k, b)
      NEEDBITS(6, byteBuff, k, b)               /* get distance low bits */
      d = b & 0x3f;
      DUMPBITS(6, k, b)
      NEEDBITS(bd, byteBuff, k, b)    /* get coded distance high bits */
      if ((e = (td.addInto(t, (~b) & md)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = ((t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e])).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      d = w - d - (t.get().v as number); /* construct offset */
      NEEDBITS(bl, byteBuff, k, b)    /* get coded length */
      if ((e = (tl.addInto(t, (~b) & ml)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = ((t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e])).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      n = t.get().v as number;
      if (e)                    /* get length extra bits */
      {
        NEEDBITS(8, byteBuff, k, b)
        n += b & 0xff;
        DUMPBITS(8, k, b)
      }

      /* do the copy */
      s -= n;
      do {
        n -= (e = (e = WSIZE - ((d &= WSIZE-1) > w ? d : w)) > n ? n : e);
        if (u && w <= d)
        {
          // memset(slide + w, 0, e);
          for (let i = 0; i < e; i++) {
            slide[w + i] = 0;
          }
          w += e;
          d += e;
        }
        else
            do {
              slide[w++] = slide[d++];
            } while (--e);
        if (w == WSIZE)
        {
          outcnt = flush(slide, output, outcnt, w);
          w = u = 0;
        }
      } while (n);
    }
  }

  /* flush out slide */
  outcnt = flush(slide, output, outcnt, w);
  release_slide(slide);
  return byteBuff.eof() ? 0 : 5;         /* should have read csize bytes */
}


/**
 * Decompress the imploded data using uncoded literals and an 8K sliding
 * window.
 * @param tl length table
 * @param td distance table
 * @param bl number of bits encoded by length table
 * @param bb number of bits encoded by distance table
 */
function explode_nolit8(byteBuff: ByteBuff, output: Uint8Array, ucsize: number, tl: Ptr<huft>, td: Ptr<huft>, bl: number, bd: number) {
  let s: number;           /* bytes to decompress */
  let e: number;           /* table entry flag/number of extra bits */
  let n: number,           /* length and index for copy */
    d: number;
  let w: number;           /* current window position */
  let t: Ptr<huft> = new Ptr<huft>(null, null); /* pointer to table entry */
  let ml: number,          /* masks for bl and bd bits */
    md: number;
  let b: number;           /* bit buffer */
  let k: number;           /* number of bits in bit buffer */
  let u: number;           /* true if unflushed */
  const slide = get_slide();
  let outcnt = 0;
  let _b: number;

  /* explode the coded data */
  b = k = w = 0;                /* initialize bit buffer, window */
  u = 1;                        /* buffer unflushed */
  ml = mask_bits[bl];           /* precompute masks for speed */
  md = mask_bits[bd];
  s = ucsize;
  while (s > 0)                 /* do until ucsize bytes uncompressed */
  {
    NEEDBITS(1, byteBuff, k, b)
    if (b & 1)                  /* then literal--get eight bits */
    {
      DUMPBITS(1, k, b)
      s--;
      NEEDBITS(8, byteBuff, k, b)
      slide[w++] = b;
      if (w == WSIZE)
      {
        outcnt = flush(slide, output, outcnt, w);
        w = u = 0;
      }
      DUMPBITS(8, k, b)
    }
    else                        /* else distance/length */
    {
      DUMPBITS(1, k, b)
      NEEDBITS(7, byteBuff, k, b)               /* get distance low bits */
      d = b & 0x7f;
      DUMPBITS(7, k, b)
      NEEDBITS(bd, byteBuff, k, b)    /* get coded distance high bits */
      if ((e = (td.addInto(t, (~b) & md)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      d = w - d - (t.get().v as number);       /* construct offset */
      NEEDBITS(bl, byteBuff, k, b)    /* get coded length */
      if ((e = (tl.addInto(t, (~b) & ml)).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      n = t.get().v as number;
      if (e)                    /* get length extra bits */
      {
        NEEDBITS(8, byteBuff, k, b)
        n += b & 0xff;
        DUMPBITS(8, k, b)
      }

      /* do the copy */
      s -= n;
      do {
        n -= (e = (e = WSIZE - ((d &= WSIZE-1) > w ? d : w)) > n ? n : e);
        if (u && w <= d)
        {
          // memset(slide + w, 0, e);
          for (let i = 0; i < e; i++) {
            slide[w + i] = 0;
          }
          w += e;
          d += e;
        }
        else
            do {
              slide[w++] = slide[d++];
            } while (--e);
        if (w == WSIZE)
        {
          outcnt = flush(slide, output, outcnt, w);
          w = u = 0;
        }
      } while (n);
    }
  }

  /* flush out slide */
  outcnt = flush(slide, output, outcnt, w);
  release_slide(slide);
  return byteBuff.eof() ? 0 : 5;         /* should have read csize bytes */
}


/**
 * Decompress the imploded data using uncoded literals and a 4K sliding
 * window.
 * @param tl length table
 * @param td distance table
 * @param bl number of bits encoded by length table
 * @param bb number of bits encoded by distance table
 */
function explode_nolit4(byteBuff: ByteBuff, output: Uint8Array, ucsize: number, tl: Ptr<huft>, td: Ptr<huft>, bl: number, bd: number) {
  let s: number;     /* bytes to decompress */
  let e: number;     /* table entry flag/number of extra bits */
  let n: number,     /* length and index for copy */
    d: number;
  let w: number;     /* current window position */
  let t: Ptr<huft> = new Ptr<huft>(null, null); /* pointer to table entry */
  let ml: number,    /* masks for bl and bd bits */
    md: number;
  let b: number;     /* bit buffer */
  let k: number;     /* number of bits in bit buffer */
  let u: number;     /* true if unflushed */
  const slide = get_slide();
  let outcnt = 0;
  let _b: number;

  /* explode the coded data */
  b = k = w = 0;                /* initialize bit buffer, window */
  u = 1;                        /* buffer unflushed */
  ml = mask_bits[bl];           /* precompute masks for speed */
  md = mask_bits[bd];
  s = ucsize;
  while (s > 0)                 /* do until ucsize bytes uncompressed */
  {
    NEEDBITS(1, byteBuff, k, b)
    if (b & 1)                  /* then literal--get eight bits */
    {
      DUMPBITS(1, k, b)
      s--;
      NEEDBITS(8, byteBuff, k, b)
      slide[w++] = b;
      if (w == WSIZE)
      {
        outcnt = flush(slide, output, outcnt, w);
        w = u = 0;
      }
      DUMPBITS(8, k, b)
    }
    else                        /* else distance/length */
    {
      DUMPBITS(1, k, b)
      NEEDBITS(6, byteBuff, k, b)               /* get distance low bits */
      d = b & 0x3f;
      DUMPBITS(6, k, b)
      NEEDBITS(bd, byteBuff, k, b)    /* get coded distance high bits */
      if ((e = td.addInto(t, (~b) & md).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      d = w - d - (t.get().v as number); /* construct offset */
      NEEDBITS(bl, byteBuff, k, b)    /* get coded length */
      if ((e = tl.addInto(t, (~b) & ml).get().e) > 16)
        do {
          if (e == 99)
            return 1;
          _b = t.get().b;
          DUMPBITS(_b, k, b)
          e -= 16;
          NEEDBITS(e, byteBuff, k, b)
        } while ((e = (t.get().v as Ptr<huft>).addInto(t, (~b) & mask_bits[e]).get().e) > 16);
      _b = t.get().b;
      DUMPBITS(_b, k, b)
      n = t.get().v as number;
      if (e)                    /* get length extra bits */
      {
        NEEDBITS(8, byteBuff, k, b)
        n += b & 0xff;
        DUMPBITS(8, k, b)
      }

      /* do the copy */
      s -= n;
      do {
        n -= (e = (e = WSIZE - ((d &= WSIZE-1) > w ? d : w)) > n ? n : e);
        if (u && w <= d)
        {
          // memset(slide + w, 0, e);
          for (let i = 0; i < e; i++) {
            slide[w + i] = 0;
          }
          w += e;
          d += e;
        }
        else
            do {
              slide[w++] = slide[d++];
            } while (--e);
        if (w == WSIZE)
        {
          outcnt = flush(slide, output, outcnt, w);
          w = u = 0;
        }
      } while (n);
    }
  }

  /* flush out slide */
  outcnt = flush(slide, output, outcnt, w);
  release_slide(slide);
  return byteBuff.eof() ? 0 : 5;         /* should have read csize bytes */
}


/**
 * Explode an imploded compressed stream.  Based on the general purpose
 * bit flag, decide on coded or uncoded literals, and an 8K or 4K sliding
 * window.  Construct the literal (if any), length, and distance codes and
 * the tables needed to decode them (using huft_build() from inflate.c),
 * and call the appropriate routine for the type of data in the remainder
 * of the stream.  The four routines are nearly identical, differing only
 * in whether the literal is decoded or simply read in, and in how many
 * bits are read in, uncoded, for the low distance bits.
 * @param general_purpose_bit_flag General purpose bit flag from the zip entry header.
 * @param compressedData Zip entry
 * @param outArray Uint8Array to write the output into.
 * @param ucsize Uncompressed size of zip entry. If unspecified, outArray.byteLength is used.
 * @return 0 on success
 */
export default function explode(general_purpose_bit_flag: number, compressedData: Uint8Array, output: Uint8Array, ucsize: number = output.byteLength): number {
  let r: number;       /* return codes */
  let tb: Ptr<huft>;   /* literal code table */
  let tl: Ptr<huft>;   /* length code table */
  let td: Ptr<huft>;   /* distance code table */
  let bb: number;      /* bits for tb */
  let bl: number;      /* bits for tl */
  let bd: number;      /* bits for td */
  let l: number[] = new Array(256); /* bit lengths for codes */
  const byteBuff = new ByteBuff(compressedData);

  if (ucsize > output.byteLength) {
    throw new Error(`Output buffer is too short for ${ucsize} bytes of uncompressed data!`);
  }


  /* Tune base table sizes.  Note: I thought that to truly optimize speed,
     I would have to select different bl, bd, and bb values for different
     compressed file sizes.  I was suprised to find out the the values of
     7, 7, and 9 worked best over a very wide range of sizes, except that
     bd = 8 worked marginally better for large compressed sizes. */
  bl = 7;
  bd = byteBuff.size() > 200000 ? 8 : 7;

  // Output of huft build.
  const hb_output = { t: new Ptr<huft>(null, null), m: -1};

  /* With literal tree--minimum match length is 3 */
  if (general_purpose_bit_flag & 4)
  {
    bb = 9;                     /* base table size for literals */
    if ((r = get_tree(byteBuff, l, 256)) != 0)
      return r;
    hb_output.m = bb;
    if ((r = huft_build(l, 256, 256, null, null, hb_output)) !== 0)
    {
      return r;
    } else {
      bb = hb_output.m;
      tb = hb_output.t.clone();
    }
    if ((r = get_tree(byteBuff, l, 64)) != 0)
      return r;
    hb_output.m = bl;
    if ((r = huft_build(l, 64, 0, cplen3, extra, hb_output)) != 0)
    {
      return r;
    } else {
      bl = hb_output.m;
      tl = hb_output.t.clone();
    }
    if ((r = get_tree(byteBuff, l, 64)) != 0)
      return r;
    if (general_purpose_bit_flag & 2)      /* true if 8K */
    {
      hb_output.m = bd;
      if ((r = huft_build(l, 64, 0, cpdist8, extra, hb_output)) != 0)
      {
        return r;
      } else {
        bd = hb_output.m;
        td = hb_output.t.clone();
      }
      r = explode_lit8(byteBuff, output, ucsize, tb, tl, td, bb, bl, bd);
    }
    else                                        /* else 4K */
    {
      hb_output.m = bd;
      if ((r = huft_build(l, 64, 0, cpdist4, extra, hb_output)) != 0)
      {
        return r;
      } else {
        bd = hb_output.m;
        td = hb_output.t.clone();
      }
      r = explode_lit4(byteBuff, output, ucsize, tb, tl, td, bb, bl, bd);
    }
  }
  else
  /* No literal tree--minimum match length is 2 */
  {
    if ((r = get_tree(byteBuff, l, 64)) != 0)
      return r;
    hb_output.m = bl;
    if ((r = huft_build(l, 64, 0, cplen2, extra, hb_output)) != 0)
    {
      return r;
    } else {
      bl = hb_output.m;
      tl = hb_output.t.clone();
    }
    if ((r = get_tree(byteBuff, l, 64)) != 0)
      return r;
    if (general_purpose_bit_flag & 2)      /* true if 8K */
    {
      hb_output.m = bd;
      if ((r = huft_build(l, 64, 0, cpdist8, extra, hb_output)) != 0)
      {
        return r;
      } else {
        bd = hb_output.m;
        td = hb_output.t.clone();
      }
      r = explode_nolit8(byteBuff, output, ucsize, tl, td, bl, bd);
    }
    else                                        /* else 4K */
    {
      hb_output.m = bd;
      if ((r = huft_build(l, 64, 0, cpdist4, extra, hb_output)) != 0)
      {
        return r;
      } else {
        bd = hb_output.m;
        td = hb_output.t.clone();
      }
      r = explode_nolit4(byteBuff, output, ucsize, tl, td, bl, bd);
    }
  }
  return r;
}