import { describe, expect, it } from 'vitest';
import rawConfig from '../config/passes.json';
import { PASSES, parsePassConfig } from '../src/config';
import { DataError } from '../src/data/validate';

interface RawPass {
  id: string;
  summit: { latitude: number; longitude: number; elevationFt: number };
  approaches: { side: string }[];
  alertRadiusMiles: number;
}

const freshConfig = () => structuredClone(rawConfig) as unknown as { passes: RawPass[] };

const firstPass = (config: { passes: RawPass[] }): RawPass => {
  const pass = config.passes[0];
  if (!pass) throw new Error('fixture has no passes');
  return pass;
};

describe('pass config', () => {
  it('loads the four passes in swipe order, Snoqualmie first', () => {
    expect(PASSES.map((pass) => pass.id)).toEqual(['snoqualmie', 'stevens', 'white', 'blewett']);
  });

  it('gives every pass two approaches, a weather station and an avalanche zone', () => {
    for (const pass of PASSES) {
      expect(pass.approaches).toHaveLength(2);
      expect(pass.wsdot.weatherStationId).toBeGreaterThan(0);
      expect(pass.avalancheZone.name).not.toBe('');
    }
  });

  it('rejects duplicate ids', () => {
    const config = freshConfig();
    config.passes.push(firstPass(config));
    expect(() => parsePassConfig(config)).toThrow(/duplicate id/);
  });

  it('rejects coordinates outside Washington, e.g. swapped latitude and longitude', () => {
    const config = freshConfig();
    const summit = firstPass(config).summit;
    const latitude = summit.latitude;
    summit.latitude = summit.longitude;
    summit.longitude = latitude;
    expect(() => parsePassConfig(config)).toThrow(DataError);
  });

  it('rejects an unknown approach side', () => {
    const config = freshConfig();
    const approach = firstPass(config).approaches[0];
    if (approach) approach.side = 'up';
    expect(() => parsePassConfig(config)).toThrow(/side/);
  });

  it('rejects ids that are not URL-safe', () => {
    const config = freshConfig();
    firstPass(config).id = 'Snoqualmie Pass';
    expect(() => parsePassConfig(config)).toThrow(/lowercase/);
  });

  it('rejects an empty pass list', () => {
    expect(() => parsePassConfig({ passes: [] })).toThrow(DataError);
  });
});
