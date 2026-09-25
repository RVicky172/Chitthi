import { useState } from 'react';
import { Check, Pane, Seg, StepLabel } from 'chitthi-postcard-studio';

export const StepWithNext = () => {
  const [orient, setOrient] = useState('landscape');
  const [crop, setCrop] = useState(true);
  return (
    <div className="panel" style={{ width: 420 }}>
      <StepLabel.Provider value="Step 2 of 6">
        <Pane
          title="Size and layout"
          lead="Postcard: choose the size and how your photos sit on it."
          next="occasion"
          onNext={() => undefined}
        >
          <Seg
            label="Orientation"
            value={orient}
            options={[
              ['landscape', 'Horizontal'],
              ['portrait', 'Vertical'],
            ]}
            onChange={setOrient}
          />
          <h3>Print</h3>
          <Check checked={crop} onChange={setCrop}>
            Crop marks
          </Check>
        </Pane>
      </StepLabel.Provider>
    </div>
  );
};

export const TitleOnly = () => (
  <div className="panel" style={{ width: 420 }}>
    <Pane title="Year at a glance" lead="The back page shows all twelve months.">
      <p className="hint">Use it as the calendar's cover or last page.</p>
    </Pane>
  </div>
);
