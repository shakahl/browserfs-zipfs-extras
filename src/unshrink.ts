/*
  Copyright (c) 1990-2008 Info-ZIP.  All rights reserved.

  See the accompanying file LICENSE, version 2000-Apr-09 or later
  (the contents of which are also included in unzip.h) for terms of use.
  If, for some reason, all these files are missing, the Info-ZIP license
  also may be found at:  ftp://ftp.info-zip.org/pub/infozip/license.html
*/
/*---------------------------------------------------------------------------

  unshrink.c                     version 1.22                     19 Mar 2008


       NOTE:  This code may or may not infringe on the so-called "Welch
       patent" owned by Unisys.  (From reading the patent, it appears
       that a pure LZW decompressor is *not* covered, but this claim has
       not been tested in court, and Unisys is reported to believe other-
       wise.)  It is therefore the responsibility of the user to acquire
       whatever license(s) may be required for legal use of this code.

       THE INFO-ZIP GROUP DISCLAIMS ALL LIABILITY FOR USE OF THIS CODE
       IN VIOLATION OF APPLICABLE PATENT LAW.


  Shrinking is basically a dynamic LZW algorithm with allowed code sizes of
  up to 13 bits; in addition, there is provision for partial clearing of
  leaf nodes.  PKWARE uses the special code 256 (decimal) to indicate a
  change in code size or a partial clear of the code tree:  256,1 for the
  former and 256,2 for the latter.  [Note that partial clearing can "orphan"
  nodes:  the parent-to-be can be cleared before its new child is added,
  but the child is added anyway (as an orphan, as though the parent still
  existed).  When the tree fills up to the point where the parent node is
  reused, the orphan is effectively "adopted."  Versions prior to 1.05 were
  affected more due to greater use of pointers (to children and siblings
  as well as parents).]

  This replacement version of unshrink.c was written from scratch.  It is
  based only on the algorithms described in Mark Nelson's _The Data Compres-
  sion Book_ and in Terry Welch's original paper in the June 1984 issue of
  IEEE _Computer_; no existing source code, including any in Nelson's book,
  was used.

  Memory requirements have been reduced in this version and are now no more
  than the original Sam Smith code.  This is still larger than any of the
  other algorithms:  at a minimum, 8K+8K+16K (stack+values+parents) assuming
  16-bit short ints, and this does not even include the output buffer (the
  other algorithms leave the uncompressed data in the work area, typically
  called slide[]).  For machines with a 64KB data space this is a problem,
  particularly when text conversion is required and line endings have more
  than one character.  UnZip's solution is to use two roughly equal halves
  of outbuf for the ASCII conversion in such a case; the "unshrink" argument
  to flush() signals that this is the case.

  For large-memory machines, a second outbuf is allocated for translations,
  but only if unshrinking and only if translations are required.

              | binary mode  |        text mode
    ---------------------------------------------------
    big mem   |  big outbuf  | big outbuf + big outbuf2  <- malloc'd here
    small mem | small outbuf | half + half small outbuf

  Copyright 1994, 1995 Greg Roelofs.  See the accompanying file "COPYING"
  in UnZip 5.20 (or later) source or binary distributions.

  ---------------------------------------------------------------------------*/

import Ptr from './ptr';
import {HSIZE, MAX_BITS, get_work_struct_unshrink, release_work_struct_unshrink, UnshrinkWorkStruct} from './unzpriv';
import {PK_RETURN_CODE as RETURN} from './unzip';
import ByteBuff from './bytebuff';

/*
#ifdef DEBUG
#  define OUTDBG(c) \
   if ((c)<32 || (c)>=127) fprintf(stderr,"\\x%02x",(c)); else putc((c),stderr);
#else
#  define OUTDBG(c)
#endif
*/

/*function OUTDBG(c: number): void {
  if ((c)<32 || (c)>=127) {
    process.stderr.write(`\\x${c}`);
  } else {
    process.stderr.write(String.fromCharCode(c));
  }
}*/

/* HSIZE is defined as 2^13 (8192) in unzip.h (resp. unzpriv.h */
const BOGUSCODE = 256;
const CODE_MASK = (HSIZE - 1);   /* 0x1fff (lower bits are parent's index) */
const FREE_CODE = HSIZE;         /* 0x2000 (code is unused or was cleared) */
const HAS_CHILD = (HSIZE << 1);  /* 0x4000 (code has a child--do not clear) */

/***********************/
/* Function unshrink() */
/***********************/

function unshrink(workStruct: UnshrinkWorkStruct, compressedData: ByteBuff, output: Uint8Array, ucsize: number): number {
  let parent = workStruct.Parent;   /* upper bits of parent[] used as flag bits */
  let FLAG_BITS = workStruct.Parent;
  let Value = workStruct.value;
  let stack = workStruct.Stack;
  let stacktop = new Ptr(stack, HSIZE - 1);
  let newstr = new Ptr<number>(null, null);
  let finalval: number;
  let codesize = 9, len: number;
  let code: number, oldcode: number, curcode: number;
  let lastfreecode: number;
  let outptr = new Ptr(output, 0);


/*---------------------------------------------------------------------------
    Initialize various variables.
  ---------------------------------------------------------------------------*/

  lastfreecode = BOGUSCODE;

  for (code = 0;  code < BOGUSCODE;  ++code) {
    Value[code] = code;
    parent[code] = BOGUSCODE;
  }
  for (code = BOGUSCODE+1;  code < HSIZE;  ++code)
    parent[code] = FREE_CODE;

/*---------------------------------------------------------------------------
    Get and output first code, then loop over remaining ones.
  ---------------------------------------------------------------------------*/

  oldcode = compressedData.readBits(codesize);
  if (compressedData.zipeof()) {
    // console.log("OK");
    return RETURN.OK;
  }

  finalval = oldcode;
  // OUTDBG(finalval);
  outptr.set(finalval);
  outptr.add(1);

  while (1) {
    code = compressedData.readBits(codesize);
    if (compressedData.zipeof())
      break;
    if (code === BOGUSCODE) {   /* possible to have consecutive escapes? */
      code = compressedData.readBits(codesize);
      if (compressedData.zipeof())
        break;
      if (code === 1) {
        ++codesize;
        // console.error(" (codesize now %d bits)\n", codesize);
        if (codesize > MAX_BITS) {
          // console.log("codesize > MAX_BITS");
          return RETURN.ERR;
        }
      } else if (code === 2) {
        // console.error(" (partial clear code)\n");
        /* clear leafs (nodes with no children) */
        partial_clear(parent, FLAG_BITS, lastfreecode);
        // console.error(" (done with partial clear)\n");
        lastfreecode = BOGUSCODE; /* reset start of free-node search */
      }
      continue;
    }

    /*-----------------------------------------------------------------------
        Translate code:  traverse tree from leaf back to root.
      -----------------------------------------------------------------------*/

    stacktop.cloneInto(newstr);
    curcode = code;

    if (parent[code] === FREE_CODE) {
      /* or (FLAG_BITS[code] & FREE_CODE)? */
      // console.error(" (found a KwKwK code %d; oldcode = %d)\n", code,
      //   oldcode);
      newstr.set(finalval);
      newstr.add(-1);
      code = oldcode;
    }

    while (code !== BOGUSCODE) {
      if (newstr.getIndex() < 0) {
        /* Bogus compression stream caused buffer underflow! */
        // console.error("unshrink stack overflow!\n");
        // console.log("newstr.getIndex() < 0");
        return RETURN.ERR;
      }
      if (parent[code] === FREE_CODE) {
        /* or (FLAG_BITS[code] & FREE_CODE)? */
        // console.error(" (found a KwKwK code %d; oldcode = %d)\n",
        //   code, oldcode);
        newstr.set(finalval);
        newstr.add(-1);
        code = oldcode;
      } else {
        newstr.set(Value[code]);
        newstr.add(-1);
        code = parent[code] & CODE_MASK;
      }
    }

    len = stacktop.getIndex() - newstr.getIndex();
    newstr.add(1);
    finalval = newstr.get();

    /*-----------------------------------------------------------------------
        Write expanded string in reverse order to output buffer.
      -----------------------------------------------------------------------*/

    // console.error("code %d; oldcode %d; char %d (%s); len %d; string [%s", curcode,
    //    oldcode, newstr.get(), (newstr.get() < 32 || newstr.get() >= 127)? ' ': String.fromCharCode(newstr.get()),
    //    len);

    {
      let p = new Ptr<number>(null, null);
      const destIndex = newstr.getIndex() + len;
      for (newstr.cloneInto(p);  p.getIndex() < destIndex;  p.add(1)) {
        outptr.set(p.get());
        outptr.add(1);
        // OUTDBG(p.get());
      }
    }

    /*-----------------------------------------------------------------------
        Add new leaf (first character of newstr) to tree as child of oldcode.
      -----------------------------------------------------------------------*/

    /* search for freecode */
    code = lastfreecode + 1;
    /* add if-test before loop for speed? */
    while ((code < HSIZE) && (parent[code] !== FREE_CODE))
      ++code;
    lastfreecode = code;
    // console.error("]; newcode %d\n", code);
    if (code >= HSIZE) {
      /* invalid compressed data caused max-code overflow! */
      // console.log("code >= HSIZE");
      return RETURN.ERR;
    }

    Value[code] = finalval;
    parent[code] = oldcode;
    oldcode = curcode;

  }

  // console.log("OK");
  return RETURN.OK;

} /* end function unshrink() */





/****************************/
/* Function partial_clear() */      /* no longer recursive... */
/****************************/

function partial_clear(parent: Int16Array, FLAG_BITS: Int16Array, lastcodeused: number): void
{
    let code: number;

    /* clear all nodes which have no children (i.e., leaf nodes only) */

    /* first loop:  mark each parent as such */
    for (code = BOGUSCODE + 1;  code <= lastcodeused;  ++code) {
      let cparent = parent[code] & CODE_MASK;

      if (cparent > BOGUSCODE)
        FLAG_BITS[cparent] |= HAS_CHILD;   /* set parent's child-bit */
    }

    /* second loop:  clear all nodes *not* marked as parents; reset flag bits */
    for (code = BOGUSCODE+1;  code <= lastcodeused;  ++code) {
      if (FLAG_BITS[code] & HAS_CHILD)    /* just clear child-bit */
        FLAG_BITS[code] &= ~HAS_CHILD;
      else {                              /* leaf:  lose it */
        // console.error("%d\n", code);
        parent[code] = FREE_CODE;
      }
    }

    return;
}

export default function(compressedData: Uint8Array, output: Uint8Array, ucsize: number = output.byteLength): number {
  const ws = get_work_struct_unshrink();
  const rv = unshrink(ws, new ByteBuff(compressedData), output, ucsize);
  release_work_struct_unshrink(ws);
  return rv;
};
