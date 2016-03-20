export const mask_bits: number[] = [
    0x0000,
    0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff,
    0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff, 0x3fff, 0x7fff, 0xffff
];

export const enum PK_RETURN_CODE {
  OK = 0,   /* no error */
  WARN = 1,   /* warning error */
  ERR = 2,   /* error in zipfile */
  BADERR = 3,   /* severe error in zipfile */
  PK_EOF = 51   /* unexpected EOF */
}
