export const MAX_BITS = 13;            /* used in unshrink() */
export const HSIZE = (1 << MAX_BITS);  /* size of global work area */

/**
 *   struct {                 // unshrink():
 *     shrint Parent[HSIZE];    // (8192 * sizeof(shrint)) == 16KB minimum
 *     uch value[HSIZE];        // 8KB
 *     uch Stack[HSIZE];        // 8KB
 *   } shrink;                  // total = 32KB minimum; 80KB on Cray/Alpha
 */
export class UnshrinkWorkStruct {
  public Parent = new Int16Array(HSIZE);
  public value = new Uint8Array(HSIZE);
  public Stack = new Uint8Array(HSIZE);
}

const _unshrinkWorkStructFreeList: UnshrinkWorkStruct[] = [];

/**
 * union work {
 *   struct {                 // unshrink():
 *     shrint Parent[HSIZE];    // (8192 * sizeof(shrint)) == 16KB minimum
 *     uch value[HSIZE];        // 8KB
 *     uch Stack[HSIZE];        // 8KB
 *   } shrink;                  // total = 32KB minimum; 80KB on Cray/Alpha
 *   uch Slide[WSIZE];        // explode(), inflate(), unreduce()
 * };
 */
export function get_work_struct_unshrink(): UnshrinkWorkStruct {
  if (_unshrinkWorkStructFreeList.length > 0) {
    return _unshrinkWorkStructFreeList.pop();
  } else {
    return new UnshrinkWorkStruct();
  }
}

export function release_work_struct_unshrink(workStruct: UnshrinkWorkStruct): void {
  _unshrinkWorkStructFreeList.push(workStruct);
}

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
