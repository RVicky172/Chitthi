import { useState } from 'react';
import { YearField } from 'chitthi-postcard-studio';

export const CalendarYear = () => {
  const [year, setYear] = useState(2027);
  return (
    <div style={{ width: 360 }}>
      <YearField value={year} onChange={setYear} />
    </div>
  );
};

export const PostmarkYear = () => {
  const [year, setYear] = useState(2026);
  return (
    <div style={{ width: 360 }}>
      <YearField label="Postmark year" value={year} onChange={setYear} />
    </div>
  );
};
