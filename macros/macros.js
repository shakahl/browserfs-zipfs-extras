/**
 * Sweet.js macros created from the original C macros.
 * All of these are created with a callable syntax so they
 * are valid TypeScript (type signatures defined in macros.d.ts).
 */

/* Macros for inflate() bit peeking and grabbing.
   The usage is:

        NEEDBITS(j)
        x = b & mask_bits[j];
        DUMPBITS(j)

   where NEEDBITS makes sure that b has at least j bits in it, and
   DUMPBITS removes the bits from b.  The macros use the variable k
   for the number of bits in b.  Normally, b and k are register
   variables for speed.
 */

macro IS_INVALID_CODE {
  rule { ($c) } => { $c === 99 }
}
export IS_INVALID_CODE;

macro NEXTBYTE {
  rule { ($byteBuff) } => { $byteBuff.readByte() }
}
export NEXTBYTE;

macro NEEDBITS {
  rule { ($n, $byteBuff, $k, $b) } => {
    console.log("NEEDBITS: " + $n + " k: " + $k + " b: " + $b);
    while($k < $n) {
      $b |= ((NEXTBYTE($byteBuff)) << $k);
      $k += 8;
    }
  }
}
export NEEDBITS;

macro DUMPBITS {
  rule { ($n, $k, $b) } => {
    $b >>= $n;
    $k -= $n;
  }
}
export DUMPBITS;

macro DECODEHUFT {
  rule { ($htab, $bits, $mask, $mask_bits, $t, $b, $e, $k, $byteBuff) } => {
    NEEDBITS($bits, $byteBuff, $k, $b);
    $htab.addInto($t, (~$b) & $mask);
    while (1) {
      var __macro_tmp = $t.get().b
      DUMPBITS(__macro_tmp, $k, $b);
      if (($e = $t.get().e) <= 32) break;
      if (IS_INVALID_CODE($e)) return 1;
      $e &= 31;
      NEEDBITS($e, $byteBuff, $k, $b);
      $t.get().v.addInto($t, (~$b)&$mask_bits[$e]);
    }
  }
}
export DECODEHUFT;
