/*
PKWARE reduce decompression 0.1
by Luigi Auriemma
e-mail: me@aluigi.org
web:    aluigi.org

---
    Copyright 2015 Luigi Auriemma

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program; if not, write to the Free Software
    Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307 USA

    http://www.gnu.org/licenses/gpl-2.0.txt
*/
import Ptr from './ptr';
import ByteBuff from './bytebuff';

const mask = new Uint8Array([
    8,1,1,2,2,3,3,3,3,4,4,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,
    5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,
    6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,
    7,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,
    8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,
    8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,
    8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8 ]);

function reduce_decompress_B(X: number): number {
  return mask[X];
}

function reduce_decompress_L(X: number, factor: number): number {
  return X & ((1 << (8 - factor)) -1);
}

function reduce_decompress_F(X: number, factor: number): number {
  if(reduce_decompress_L(X, factor) == reduce_decompress_L(-1, factor)) return 2;
  return 3;
}

function reduce_decompress_D(X: number, Y: number, factor: number): number {
  return ((X >> (8 - factor)) * 256) + Y + 1;
}

const DLE = 144;  // 0x90

function reduce_decompress(inArr: Uint8Array, insz: number, out: Uint8Array, outsz: number, factor: number): number {
  let inBuff = new ByteBuff(inArr);
  let o = new Ptr(out, 0),
    outl = new Ptr(out, outsz);


  let p = new Ptr<number>(null, null);
  let i: number,
    j: number;
  let C = 0,
    V = 0,
    I = 0,
    Len = 0,
    State = 0,
    Last_Character = 0;



  let N = new Uint8Array(256),
    S = new Uint8Array(256*64);

  for(j = 0xff; j >= 0; j--) {
    N[j] = inBuff.readBits(6);
    for(i = 0; i < N[j]; i++) {
      S[(j * 64) + i] = inBuff.readBits(8);
    }
  }

  while (!inBuff.zipeof() && (o.getIndex() < outl.getIndex())) {

    if (N[Last_Character] == 0) {
      C = inBuff.readBits(8);
    } else {
      if (inBuff.readBits(1)) {
        C = inBuff.readBits(8);
      } else {
        I = inBuff.readBits(reduce_decompress_B(N[Last_Character]));
        C = S[(64 * Last_Character) + I];
      }
    }
    Last_Character = C;



    switch(State) {

      case 0:
        if (C != DLE) {
          if (o.getIndex() < outl.getIndex()) {
            o.set(C);
            o.add(1);
          }
        } else {
          State = 1;
        }
        break;

      case 1:
        if (C != 0) {
          V = C;
          Len = reduce_decompress_L(V, factor);
          State = reduce_decompress_F(Len, factor);
        } else {
          if (o < outl) {
            o.set(DLE);
            o.add(1);
          }
          State = 0;
        }
        break;

      case 2:
        Len += C;
        State = 3;
        break;

      case 3:
        o.addInto(p, -(reduce_decompress_D(V, C, factor) & 0x3fff));   // Winzip uses a 0x3fff mask here
        for (i = 0; i < (Len + 3); i++, p.add(1)) {
          if (o.getIndex() < outl.getIndex()) {
            if (p.getIndex() < 0) {
              o.set(0);
              o.add(1);
            }
            else {
              o.set(p.get());
              o.add(1);
            }
          }
        }
        State = 0;
        break;

        default:
          break;
      }
  }

  return o.getIndex();
}

export = reduce_decompress;
