import { PlatformLeague } from "@/platforms/common";
import { Input } from "@/ui/Input";
import { Button } from "@/ui/Button";

export type LeagueSubmitCallback = (league: PlatformLeague) => Promise<any>;
export type LeagueLoginProps = {
    submitLeague: LeagueSubmitCallback;
};


export const PrivateLeagueLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <label className='text-left text-sm font-medium text-gray-700 dark:text-gray-300'>{label}:</label>
  );
}

export type PrivateLeagueInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId?: string;
};

export const PrivateLeagueInput: React.FC<PrivateLeagueInputProps> = ({ label, value, onChange, testId }) => {
  return (
    <Input
      type="text"
      name={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
    />
  );
};

export const LeagueDataInput: React.FC<{ label: string, value: string, onChange: (value: string) => void }> = ({ label, value, onChange }) => {
  return (
    <div className="mt-4">
      <Input
        type="text"
        name={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export const SubmitButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    onClick();
  };

  return (
    <Button type="button" variant="primary" fullWidth className="mt-4" onClick={handleClick}>
      Submit
    </Button>
  );
}
