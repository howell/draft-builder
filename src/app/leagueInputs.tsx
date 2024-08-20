import { PlatformLeague } from "@/platforms/common";

export type LeagueSubmitCallback = (league: PlatformLeague) => Promise<any>;
export type LeagueLoginProps = {
    submitLeague: LeagueSubmitCallback;
};


export const PrivateLeagueLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <label className='w-1/10 text-left'>{label}:</label>
  );
}

export type PrivateLeagueInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export const PrivateLeagueInput: React.FC<PrivateLeagueInputProps> = ({ label, value, onChange }) => {
  return (
    <input
      className="col-span-3 h-12 p-2 mt-2 text-black bg-white border border-gray-300 rounded-lg"
      type="text"
      name={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};
