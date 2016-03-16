import Ptr from './ptr';

/* If BMAX needs to be larger than 16, then h and x[] should be ulg. */
const BMAX = 16;         /* maximum bit length of any code (16 for explode) */
const N_MAX = 288;       /* maximum number of codes in any set */

export interface huft {
  e: number;               /* [byte] number of extra bits or operation */
  b: number;               /* [byte] number of bits in this code or subcode */
  v: number | Ptr<huft>; /* [unsigned word] or pointer within a huf table */
                    /* literal, length base, or distance base, or... */
                    /* pointer to next level of table */
}

export function flush(slide: Uint8Array, out: Uint8Array, outcnt: number, w: number): number {
  let n: number;
  let OUTBUFSIZ = out.byteLength;
  let slideI: number = 0;
  while (w) {
    n = (n = OUTBUFSIZ - outcnt) < w ? n : w;
    out.set(slide.subarray(slideI, slideI + n), outcnt);
    outcnt += n;
    // if ((outcnt += n) === OUTBUFSIZ) {
      // Buffer is full. TODO: Support streaming decompression.
    // }
    slideI += n;
    w -= n;
  }

  return outcnt;
}

function create_empty_huft_table(n: number): huft[] {
  const rv = new Array<huft>(n);
  for (let i = 0; i < n; i++) {
    rv[i] = {
      e: 0,
      b: 0,
      v: new Ptr<huft>(null, null)
    };
  }
  return rv;
}

/**
 * Clone a into b.
 */
function clone_huft(a: huft, b: huft) {
  b.e = a.e;
  b.b = b.b;
  if (typeof(a.v) === 'number') {
    b.v = a.v;
  } else {
    (a.v as Ptr<huft>).cloneInto((b.v as Ptr<huft>));
  }
}

/**
 * Given a list of code lengths and a maximum table size, make a set of
 * tables to decode that set of codes.  Return zero on success, one if
 * the given code set is incomplete (the tables are still built in this
 * case), two if the input is invalid (all zero length codes or an
 * oversubscribed set of lengths), and three if not enough memory.
 * @param b code lengths in bits (all assumed <= BMAX)
 * @param n number of codes (assumed <= N_MAX)
 * @param s number of simple-valued codes (0..s-1)
 * @param d list of base values for non-simple codes
 * @param e list of extra bits for non-simple codes
 * @param output.t result: starting table
 * @param output.m maximum lookup bits, returns actual
 */
export function huft_build(b: number[], n: number, s: number, d: number[], e: number[], output: { t: Ptr<huft>, m: number }): number {
  let a: number;          /* counter for codes of length k */
  let c = new Uint32Array(BMAX+1); /* bit length count table */
  let f: number;          /* i repeats in table every f entries */
  let g: number;          /* maximum code length */
  let h: number;          /* table level */
  let i: number;          /* counter, current code */
  let j: number;          /* counter */
  let k: number;          /* number of bits in current code */
  let l: number;          /* bits per table (returned in m) */
  let p = new Ptr<number>(null, null); /* pointer into c[], b[], or v[] */
  let q = new Ptr<huft>(null, null); /* points to current table */
  let r: huft = {         /* table entry for structure assignment */
    e: 0,
    b: 0,
    v: 0
  };
  let u = new Array<Ptr<huft>>(BMAX); /* table stack */
  let v = new Uint32Array(N_MAX); /* values in order of bit length */
  let w: number;          /* bits before this table == (l * h) */
  let x = new Uint32Array(BMAX+1); /* bit offsets, then code stack */
  let xp = new Ptr<number>(null, null); /* pointer into x */
  let y: number;          /* number of dummy codes added */
  let z: number;          /* number of entries in current table */
  let t = output.t;


  /* Generate counts for each bit length */
  // Unneeded, since typed arrays are initialized to 0.
  // memset(c, 0, sizeof(c));
  p.reset(b, 0);  i = n;
  do {
    c[p.get()]++;                  /* assume all entries <= BMAX */
    p.add(1);
  } while (--i);
  if (c[0] == n)                /* null input--all zero length codes */
  {
    t.reset(null, null);
    output.m = 0;
    return 0;
  }


  /* Find minimum and maximum length, bound *m by those */
  l = output.m;
  for (j = 1; j <= BMAX; j++)
    if (c[j])
      break;
  k = j;                        /* minimum code length */
  if (l < j)
    l = j;
  for (i = BMAX; i; i--)
    if (c[i])
      break;
  g = i;                        /* maximum code length */
  if (l > i)
    l = i;
  output.m = l;


  /* Adjust last length count to fill out codes, if needed */
  for (y = 1 << j; j < i; j++, y <<= 1)
    if ((y -= c[j]) < 0)
      return 2;                 /* bad input: more codes than bits */
  if ((y -= c[i]) < 0)
    return 2;
  c[i] += y;


  /* Generate starting offsets into the value table for each length */
  x[1] = j = 0;
  p.reset(c, 1);  xp.reset(x, 2);
  while (--i) {                 /* note that i == g from above */
    xp.set(j += p.get());
    p.add(1);
    xp.add(1);
  }


  /* Make a table of values in order of bit lengths */
  p.reset(b, 0);  i = 0;
  do {
    if ((j = p.get()) != 0)
      v[x[j]++] = i;
    p.add(1);
  } while (++i < n);


  /* Generate the Huffman codes and for each, make the table entries */
  x[0] = i = 0;                 /* first Huffman code is zero */
  p.reset(v, 0);                /* grab values in bit order */
  h = -1;                       /* no tables yet--level -1 */
  w = -l;                       /* bits decoded == (l * h) */
  u[0] = null;                  /* just to keep compilers happy */
  q.reset(null, null);          /* ditto */
  z = 0;                        /* ditto */

  /* go through the bit lengths (k already is bits in shortest code) */
  for (; k <= g; k++)
  {
    a = c[k];
    while (a--)
    {
      /* here i is the Huffman code of length k bits for value *p */
      /* make tables up to required level */
      while (k > w + l)
      {
        h++;
        w += l;                 /* previous table always l bits */

        /* compute minimum size table less than or equal to l bits */
        z = (z = g - w) > l ? l : z;  /* upper limit on table size */
        if ((f = 1 << (j = k - w)) > a + 1)     /* try a k-w bit table */
        {                       /* too few codes for k-w bit table */
          f -= a + 1;           /* deduct codes from patterns left */
          xp.reset(c, k);
          while (++j < z)       /* try smaller tables up to z bits */
          {
            if ((f <<= 1) <= xp.add(1).get())
              break;            /* enough codes to use up j bits */
            f -= xp.get();      /* else deduct codes from patterns */
          }
        }
        z = 1 << j;             /* table entries for j-bit table */

        /* allocate and link in new table */
        q.reset(create_empty_huft_table(z + 1), 0);
        q.addInto(t, 1); /* link to list for huft_free() */
        t = q.get().v as Ptr<huft>;
        u[h] = q.add(1).clone(); /* table starts after link */

        /* connect to last table, if there is one */
        if (h)
        {
          x[h] = i;             /* save pattern for backing up */
          r.b = l;              /* bits to dump before this table */
          r.e = 16 + j;         /* bits in this table */
          r.v = q.clone(); /* pointer to this table */
          j = i >> (w - l);     /* (get around Turbo C bug) */
          clone_huft(r, u[h - 1].getOffset(j)); /* connect to last table */
        }
      }

      /* set up table entry in r */
      r.b = k - w;
      if (p.getIndex() >= n)
        r.e = 99;               /* out of values--invalid code */
      else if (p.get() < s)
      {
        r.e = p.get() < 256 ? 16 : 15; /* 256 is end-of-block code */
        r.v = p.get();          /* simple code is just the value */
        p.add(1);
      }
      else
      {
        r.e = e[p.get() - s];   /* non-simple--look up in lists */
        r.v = d[p.get() - s];
        p.add(1);
      }

      /* fill code-like entries with r */
      f = 1 << (k - w);
      for (j = i >> w; j < z; j += f)
        clone_huft(r, q.getOffset(j));

      /* backwards increment the k-bit code i */
      for (j = 1 << (k - 1); i & j; j >>= 1)
        i ^= j;
      i ^= j;

      /* backup over finished tables */
      while ((i & ((1 << w) - 1)) != x[h])
      {
        h--;                    /* don't need to update q */
        w -= l;
      }
    }
  }


  /* Return true (1) if we were given an incomplete table */
  return (y !== 0 && g !== 1) ? 1 : 0;
}
