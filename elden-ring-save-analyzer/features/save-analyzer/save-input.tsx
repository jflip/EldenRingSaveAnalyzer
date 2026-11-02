const SaveInput = ({
  handleFileChange,
}: {
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <div>
      <input
        className="form-control"
        type="file"
        id="savefile"
        accept=".sl2, .co2"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default SaveInput;
