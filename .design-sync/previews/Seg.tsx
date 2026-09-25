import { useState } from 'react';
import { Seg } from 'chitthi-postcard-studio';

export const ProductSwitch = () => {
  const [v, setV] = useState('postcard');
  return (
    <Seg
      label="What are you making?"
      value={v}
      options={[
        ['postcard', 'Postcard'],
        ['calendar', 'Calendar'],
        ['frame', 'Photo frame'],
      ]}
      onChange={setV}
    />
  );
};

export const Orientation = () => {
  const [v, setV] = useState('portrait');
  return (
    <Seg
      label="Orientation"
      value={v}
      options={[
        ['landscape', 'Horizontal'],
        ['portrait', 'Vertical'],
      ]}
      onChange={setV}
    />
  );
};

export const MatBorder = () => {
  const [v, setV] = useState('classic');
  return (
    <Seg
      label="Mat border"
      value={v}
      options={[
        ['none', 'None'],
        ['thin', 'Thin'],
        ['classic', 'Classic'],
        ['wide', 'Wide'],
      ]}
      onChange={setV}
    />
  );
};
