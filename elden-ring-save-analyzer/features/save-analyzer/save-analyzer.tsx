"use client";

import React from "react";
import SaveInput from "./save-input"
import readSaveFile from "./utilities/read-save-file";
import calculate from "./utilities/calculate";
import getNames from "./utilities/get-names";

const SaveAnalyzer = () => {
  const [names, setNames] = React.useState<string[]>([]);  
  const [selectedName, setSelectedName] = React.useState<string | null>(null);
  const [saveFile, setSaveFile] = React.useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {    
    console.log("File change event:", event);
    const file = event.target.files ? event.target.files[0] : null;    

    if(!file) {
      console.error("No file selected");
      return;
    }

    readSaveFile(file).then((arrayBuffer) => {
      setSaveFile(file);
      // Extract names from the array buffer
      const extractedNames = getNames(arrayBuffer);
      console.log("Extracted names:", extractedNames);
      setNames(extractedNames);
    }).catch((error) => {
      console.error("Error reading save file:", error);
    });
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const name = event.target.value;
    console.log("Selected name:", name);
    setSelectedName(name);
  }

  const handleButtonClick = () => {

    if(!selectedName) {
      console.error("No name selected");
      return;
    }

    if(!saveFile) {
      console.error("No save file loaded");
      return;
    }

    calculate(selectedName, saveFile);
  };

  return (
    <div>    
      <div>
          <SaveInput handleFileChange={handleFileChange} />
      </div>
      <br />
      <div>
        <select onChange={handleNameChange}>      
          <option key={-1} value="">Select a name</option>    
          {names.map((name, index) => (
            <option key={index} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <br />
      <div>
        <button onClick={handleButtonClick}>
          Calculate
        </button>
      </div>
    </div>
    ); 
};

export default SaveAnalyzer;