import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import QRCode from './QRCode.jsx';

afterEach(() => { delete window.QRCodeGen; });

describe('QRCode', () => {
  it('renders nothing when the vendored encoder never loaded', () => {
    const { container } = render(<QRCode text="http://192.168.1.1:3000" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('builds one SVG path from the encoder\'s module grid', () => {
    window.QRCodeGen = {
      encode: () => ({ size: 2, modules: [[true, false], [false, true]] }),
    };
    const { container } = render(<QRCode text="http://x" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 2 2');
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('d', 'M0 0h1v1h-1zM1 1h1v1h-1z');
  });

  it('falls back to rendering nothing if the encoder throws (e.g. text too long)', () => {
    window.QRCodeGen = {
      encode: () => { throw new Error('too big'); },
    };
    const { container } = render(<QRCode text="http://very-long-tunnel-hostname.example" />);
    expect(container).toBeEmptyDOMElement();
  });
});
