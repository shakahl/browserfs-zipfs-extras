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

macro NEXTBYTE {
  rule { ($byteBuff) } => { $byteBuff.readByte() }
}
export NEXTBYTE;

macro NEEDBITS {
  rule { ($n, $byteBuff, $k, $b) } => { while($k<$n){$b|=(NEXTBYTE($byteBuff))<<$k;$k+=8;} }
}
export NEEDBITS;

macro DUMPBITS {
  rule { ($n, $k, $b) } => { $b>>=$n;$k-=$n; }
}
export DUMPBITS;
