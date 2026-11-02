 // True if two buffers contain exactly the same bytes.
function buffer_equal(buf1: ArrayBuffer, buf2: Int8Array): boolean {
  if (buf1.byteLength !== buf2.byteLength) return false;
  const dv1 = new Int8Array(buf1);
  const dv2 = new Int8Array(buf2);
  for (let i = 0; i !== buf1.byteLength; i++) {
    if (dv1[i] !== dv2[i]) return false;
  }
  return true;
}

 
 const isSaveValid = (file_read: string | ArrayBuffer | null, e: unknown): boolean => {
    if(!file_read || !(file_read instanceof ArrayBuffer)) {
        console.error("Invalid file_read: not an ArrayBuffer");
        return false;
    }
    return !buffer_equal(file_read["slice"](0, 4), new Int8Array([66, 78, 68, 52]))
}

export {
    buffer_equal,
}

export default isSaveValid;