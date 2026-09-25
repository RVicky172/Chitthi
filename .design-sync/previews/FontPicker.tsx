import { useState } from 'react';
import { FontPicker, installFontLinks } from 'chitthi-postcard-studio';

installFontLinks();

export const GreetingFont = () => {
  const [font, setFont] = useState('Rozha One');
  return (
    <div style={{ width: 360 }}>
      <FontPicker label="Greeting font" value={font} sample="Happy Diwali" weight="hw" onChange={setFont} />
    </div>
  );
};

export const Handwriting = () => {
  const [font, setFont] = useState('Kalam');
  return (
    <div style={{ width: 360 }}>
      <FontPicker
        label="Handwriting font"
        value={font}
        sample="Dear Nani, wish you were here"
        weight="bw"
        only={['Kalam', 'Caveat', 'Amita', 'Dancing Script', 'Shadows Into Light', 'Baloo 2', 'Hind']}
        onChange={setFont}
      />
    </div>
  );
};
