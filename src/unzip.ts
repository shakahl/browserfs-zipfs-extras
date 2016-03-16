export const mask_bits: number[] = [
    0x0000,
    0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff,
    0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff, 0x3fff, 0x7fff, 0xffff
];


const slideFreeList: Uint8Array[] = [];

// slide = (byte *)calloc(8193, sizeof(short)+sizeof(char)+sizeof(char));
// 8193 x 4 bytes
// Changed into a function to avoid global state.
export function get_slide(): Uint8Array {
  if (slideFreeList.length === 0) {
    return new Uint8Array(8193 * 4);
  } else {
    return slideFreeList.pop();
  }
}

export function release_slide(slide: Uint8Array): void {
  slideFreeList.push(slide);
}
