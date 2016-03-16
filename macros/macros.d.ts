interface ReadByte {
  readByte(): number;
}

declare function NEXTBYTE(byteBuff: ReadByte): number;
declare function NEEDBITS(n: number, byteBuff: ReadByte, k: number, b: number): void;
declare function DUMPBITS(n: number, k: number, b: number): void;