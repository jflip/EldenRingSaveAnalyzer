import isSaveValid from "./is-save-valid";




const readSaveFile = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const file_read = e.target?.result;
      if (!(file_read instanceof ArrayBuffer)) {
        reject(new Error("Unable to read save file"));
        return;
      }

      // Valid saves begin with the ASCII bytes "BND4" (66, 78, 68, 52)
      if (isSaveValid(file_read, e)) {
        alert("Insert a valid file");
        reject(new Error("Invalid save file"));
        return;
      }

      resolve(file_read)

    };
    reader.onerror = function () {
      reject(reader.error ?? new Error("Error reading save file"));
    };
    reader.readAsArrayBuffer(file);
  });
};

export default readSaveFile;