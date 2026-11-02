// Reads the 10 character names from fixed offsets in the file. Names are
// stored as 16-bit characters (32 bytes), hence the Uint16Array.
const getNames = (file_read: ArrayBuffer): string[] => {
  const decoder = new TextDecoder("utf-8");
  const name1 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x1901d0e, 0x1901d0e + 32))),
    ),
  );
  const name2 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x1901f5a, 0x1901f5a + 32))),
    ),
  );
  const name3 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x19021a6, 0x19021a6 + 32))),
    ),
  );
  const name4 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x19023f2, 0x19023f2 + 32))),
    ),
  );
  const name5 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x190263e, 0x190263e + 32))),
    ),
  );
  const name6 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x190288a, 0x190288a + 32))),
    ),
  );
  const name7 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x1902ad6, 0x1902ad6 + 32))),
    ),
  );
  const name8 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x1902d22, 0x1902d22 + 32))),
    ),
  );
  const name9 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x1902f6e, 0x1902f6e + 32))),
    ),
  );
  const name10 = decoder.decode(
    new Int8Array(
      Array.from(new Uint16Array(file_read.slice(0x19031ba, 0x19031ba + 32))),
    ),
  );

  const names = [
    name1,
    name2,
    name3,
    name4,
    name5,
    name6,
    name7,
    name8,
    name9,
    name10,
  ];
  // Strip the null characters left over from fixed-width name fields
  names.forEach((name, index) => {
    names[index] = name.replaceAll("\x00", "");
  });
  return names;
};

export default getNames;
